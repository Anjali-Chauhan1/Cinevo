// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICinovaRegistry, IBackerPass, IRevenueReceiver} from "./interfaces/ICinova.sol";

/// @title FilmCampaign
/// @notice One escrow per film. Never a pooled fund across films.
///
/// - Fans back a perk tier and receive a non-transferable BackerPass.
/// - KYC-verified investors in permitted regions may buy Producer Units.
/// - Money waits here and is released to the creator milestone by milestone,
///   each one approved after the creator submits proof (10% platform fee is
///   taken on release, so refunds are always the full amount escrowed).
/// - Goal missed by the deadline, or film not delivered by the delivery date:
///   every backer can claim a refund of their share of what is still escrowed.
/// - After funding, episode revenue routed here is split by the Producer Unit
///   waterfall: unit holders recoup 120% first, then the creator earns most.
///
/// Deployed as EIP-1167 clones by CampaignFactory, hence `initialize`.
contract FilmCampaign is Initializable, ReentrancyGuard, IRevenueReceiver {
    using SafeERC20 for IERC20;

    enum State {
        Active, // accepting backing until the deadline
        Funded, // goal met; releasing milestones
        Delivered, // final milestone released
        Failed // goal or delivery date missed; refunds open
    }

    struct Tier {
        uint128 price;
        uint32 limit; // 0 = unlimited
        uint32 backedCount;
    }

    struct Config {
        uint128 goal;
        uint64 deadline;
        uint64 deliveryDate;
        uint128[] tierPrices;
        uint32[] tierLimits;
        uint16[] milestoneBps; // must sum to 10_000
        bool unitsEnabled;
        uint128 unitPrice;
        uint128 maxUnitSpendPerBacker; // the doc's ₹5,000 per person per film
        uint128 unitHardCap; // total Producer Unit money this film accepts; 0 = no cap
    }

    uint256 public constant BPS = 10_000;
    /// Waterfall shares, as a fraction of GROSS viewer revenue (the platform
    /// fee is the other 10%). Converted to shares of the net amount received.
    uint256 public constant STAGE1_UNITS_BPS = 5_000; // until holders recoup
    uint256 public constant STAGE2_UNITS_BPS = 2_000; // afterwards
    /// Holders recoup their money back plus 20% before stage 2.
    uint256 public constant RECOUP_BPS = 12_000;
    uint256 public constant MAX_TIERS = 8;
    uint256 public constant MAX_MILESTONES = 8;
    uint256 private constant ACC_PRECISION = 1e18;

    address public creator;
    ICinovaRegistry public registry;
    IERC20 public token;
    IBackerPass public backerPass;

    uint128 public goal;
    uint64 public deadline;
    uint64 public deliveryDate;
    State public state;

    Tier[] private _tiers;
    uint16[] private _milestoneBps;
    uint8 public milestonesReleased;
    mapping(uint8 => bytes32) public milestoneProof;

    uint256 public totalRaised;
    uint256 public totalReleased;
    uint256 public escrowAtFailure;
    uint256 public raisedAtFailure;
    mapping(address => uint256) public contributionOf;
    mapping(address => mapping(uint8 => uint256)) public passesOf;

    // Producer Units
    bool public unitsEnabled;
    uint128 public unitPrice;
    uint128 public maxUnitSpendPerBacker;
    uint128 public unitHardCap;
    uint256 public totalUnits;
    uint256 public unitsRaised;
    uint256 public unitsRecouped;
    uint256 public accRevenuePerUnit;
    mapping(address => uint256) public unitsOf;
    mapping(address => uint256) public unitSpendOf;
    mapping(address => uint256) private _accSnapshotOf;
    mapping(address => uint256) private _pendingRevenueOf;

    event Backed(address indexed backer, uint8 indexed tier, uint256 amount, bytes32 ackHash);
    event UnitsPurchased(address indexed backer, uint256 units, uint256 cost, bytes32 ackHash);
    event StateChanged(State state);
    event MilestoneProofSubmitted(uint8 indexed index, bytes32 proofHash);
    event MilestoneProofRejected(uint8 indexed index, bytes32 reasonHash);
    event MilestoneReleased(uint8 indexed index, uint256 amount, uint256 toCreator, uint256 toPlatform);
    event Refunded(address indexed backer, uint256 amount);
    event RevenueDistributed(uint256 amount, uint256 toUnits, uint256 toCreator);
    event RevenueClaimed(address indexed holder, uint256 amount);

    error InvalidConfig();
    error WrongState(State current);
    error UnknownTier();
    error TierSoldOut();
    error MissingAcknowledgement();
    error UnitsDisabled();
    error NotVerifiedInvestor();
    error OverPersonalCap();
    error OverHardCap();
    error NotCreator();
    error NotApprover();
    error WrongMilestone();
    error NoProof();
    error NothingToClaim();

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address creator_,
        ICinovaRegistry registry_,
        IERC20 token_,
        IBackerPass backerPass_,
        Config calldata cfg
    ) external initializer {
        if (cfg.goal == 0 || cfg.deadline <= block.timestamp || cfg.deliveryDate <= cfg.deadline) {
            revert InvalidConfig();
        }
        uint256 nTiers = cfg.tierPrices.length;
        if (nTiers == 0 || nTiers > MAX_TIERS || nTiers != cfg.tierLimits.length) revert InvalidConfig();
        uint256 nMilestones = cfg.milestoneBps.length;
        if (nMilestones == 0 || nMilestones > MAX_MILESTONES) revert InvalidConfig();
        uint256 bpsSum;
        for (uint256 i; i < nMilestones; ++i) {
            if (cfg.milestoneBps[i] == 0) revert InvalidConfig();
            bpsSum += cfg.milestoneBps[i];
        }
        if (bpsSum != BPS) revert InvalidConfig();
        if (cfg.unitsEnabled && (cfg.unitPrice == 0 || cfg.maxUnitSpendPerBacker < cfg.unitPrice)) {
            revert InvalidConfig();
        }

        creator = creator_;
        registry = registry_;
        token = token_;
        backerPass = backerPass_;
        goal = cfg.goal;
        deadline = cfg.deadline;
        deliveryDate = cfg.deliveryDate;
        for (uint256 i; i < nTiers; ++i) {
            if (cfg.tierPrices[i] == 0) revert InvalidConfig();
            _tiers.push(Tier({price: cfg.tierPrices[i], limit: cfg.tierLimits[i], backedCount: 0}));
        }
        _milestoneBps = cfg.milestoneBps;
        unitsEnabled = cfg.unitsEnabled;
        unitPrice = cfg.unitPrice;
        maxUnitSpendPerBacker = cfg.maxUnitSpendPerBacker;
        unitHardCap = cfg.unitHardCap;
    }

    // ------------------------------------------------------------------
    // State machine (time-driven transitions happen lazily on any call)
    // ------------------------------------------------------------------

    modifier synced() {
        _syncState();
        _;
    }

    /// @notice Applies any deadline/delivery-date transition that is due.
    function syncState() external {
        _syncState();
    }

    /// @notice The state as of now, including transitions not yet written.
    function currentState() public view returns (State s) {
        s = state;
        if (s == State.Active && block.timestamp >= deadline) {
            s = totalRaised >= goal ? State.Funded : State.Failed;
        }
        // Applied after the step above, so a film that was funded but whose
        // delivery date has also passed resolves straight to Failed.
        if (s == State.Funded && block.timestamp > deliveryDate) s = State.Failed;
    }

    function _syncState() private {
        State next = currentState();
        if (next == state) return;
        state = next;
        if (next == State.Failed) {
            escrowAtFailure = totalRaised - totalReleased;
            raisedAtFailure = totalRaised;
        }
        emit StateChanged(next);
    }

    function _requireState(State expected) private view {
        if (state != expected) revert WrongState(state);
    }

    // ------------------------------------------------------------------
    // Backing
    // ------------------------------------------------------------------

    /// @param ackHash Hash of the risk acknowledgement the backer accepted
    /// ("I understand this supports the creator and may not be delivered").
    function back(uint8 tier, bytes32 ackHash) external nonReentrant synced {
        _requireState(State.Active);
        if (tier >= _tiers.length) revert UnknownTier();
        if (ackHash == bytes32(0)) revert MissingAcknowledgement();
        Tier storage t = _tiers[tier];
        if (t.limit != 0 && t.backedCount >= t.limit) revert TierSoldOut();

        t.backedCount += 1;
        contributionOf[msg.sender] += t.price;
        totalRaised += t.price;
        passesOf[msg.sender][tier] += 1;

        token.safeTransferFrom(msg.sender, address(this), t.price);
        backerPass.mint(msg.sender, tier);
        emit Backed(msg.sender, tier, t.price, ackHash);
    }

    /// @notice Buys Producer Units: a fixed share of the film's revenue, not
    /// its profit. KYC-verified investors in permitted regions only. Units
    /// cannot be transferred (secondary market is on the roadmap).
    function buyUnits(uint256 units, bytes32 ackHash) external nonReentrant synced {
        if (!unitsEnabled) revert UnitsDisabled();
        _requireState(State.Active);
        if (!registry.isVerifiedInvestor(msg.sender)) revert NotVerifiedInvestor();
        if (ackHash == bytes32(0)) revert MissingAcknowledgement();
        if (units == 0) revert InvalidConfig();

        uint256 cost = units * unitPrice;
        if (unitSpendOf[msg.sender] + cost > maxUnitSpendPerBacker) revert OverPersonalCap();
        if (unitHardCap != 0 && unitsRaised + cost > unitHardCap) revert OverHardCap();

        _harvest(msg.sender);
        unitsOf[msg.sender] += units;
        unitSpendOf[msg.sender] += cost;
        totalUnits += units;
        unitsRaised += cost;
        contributionOf[msg.sender] += cost;
        totalRaised += cost;

        token.safeTransferFrom(msg.sender, address(this), cost);
        emit UnitsPurchased(msg.sender, units, cost, ackHash);
    }

    // ------------------------------------------------------------------
    // Milestones
    // ------------------------------------------------------------------

    function submitMilestoneProof(uint8 index, bytes32 proofHash) external synced {
        if (msg.sender != creator) revert NotCreator();
        _requireState(State.Funded);
        if (index != milestonesReleased) revert WrongMilestone();
        if (proofHash == bytes32(0)) revert NoProof();
        milestoneProof[index] = proofHash;
        emit MilestoneProofSubmitted(index, proofHash);
    }

    function rejectMilestoneProof(uint8 index, bytes32 reasonHash) external synced {
        if (!registry.hasRole(registry.MILESTONE_APPROVER_ROLE(), msg.sender)) revert NotApprover();
        _requireState(State.Funded);
        if (index != milestonesReleased) revert WrongMilestone();
        delete milestoneProof[index];
        emit MilestoneProofRejected(index, reasonHash);
    }

    /// @notice Releases the next milestone's share of the money raised to the
    /// creator, minus the platform fee. The final milestone releases whatever
    /// remains (so rounding dust is never stuck) and marks the film delivered.
    function releaseMilestone(uint8 index) external nonReentrant synced {
        if (!registry.hasRole(registry.MILESTONE_APPROVER_ROLE(), msg.sender)) revert NotApprover();
        _requireState(State.Funded);
        if (index != milestonesReleased) revert WrongMilestone();
        if (milestoneProof[index] == bytes32(0)) revert NoProof();

        bool isLast = index == _milestoneBps.length - 1;
        uint256 amount = isLast ? totalRaised - totalReleased : (totalRaised * _milestoneBps[index]) / BPS;
        totalReleased += amount;
        milestonesReleased = index + 1;
        if (isLast) {
            state = State.Delivered;
            emit StateChanged(State.Delivered);
        }

        (uint256 fee, uint256 net) = registry.splitFee(amount);
        if (fee > 0) token.safeTransfer(registry.treasury(), fee);
        token.safeTransfer(creator, net);
        emit MilestoneReleased(index, amount, net, fee);
    }

    // ------------------------------------------------------------------
    // Refunds
    // ------------------------------------------------------------------

    /// @notice Refund owed to a backer if the campaign has failed: their share
    /// of the money still in escrow. Full amount when the goal was missed
    /// (nothing was released); pro-rata if the delivery date was missed after
    /// some milestones had already been paid out.
    function refundAmount(address backer) public view returns (uint256) {
        if (raisedAtFailure == 0) return 0;
        return (contributionOf[backer] * escrowAtFailure) / raisedAtFailure;
    }

    function claimRefund() external nonReentrant synced returns (uint256 amount) {
        _requireState(State.Failed);
        amount = refundAmount(msg.sender);
        if (contributionOf[msg.sender] == 0) revert NothingToClaim();

        contributionOf[msg.sender] = 0;
        // Revenue already earned stays claimable; the units themselves end.
        _harvest(msg.sender);
        totalUnits -= unitsOf[msg.sender];
        unitsOf[msg.sender] = 0;

        uint256 nTiers = _tiers.length;
        for (uint8 i; i < nTiers; ++i) {
            uint256 passes = passesOf[msg.sender][i];
            if (passes > 0) {
                passesOf[msg.sender][i] = 0;
                backerPass.burn(msg.sender, i, passes);
            }
        }

        if (amount > 0) token.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Revenue waterfall
    // ------------------------------------------------------------------

    /// @notice Pulls `amount` (net of the platform fee) from the caller —
    /// normally CinovaVault settling pay-per-minute revenue for an episode
    /// linked to this film — and splits it between unit holders and creator.
    function distributeRevenue(uint256 amount) external nonReentrant synced returns (uint256 toUnits, uint256 toCreator) {
        token.safeTransferFrom(msg.sender, address(this), amount);

        bool unitsLive = (state == State.Funded || state == State.Delivered) && totalUnits > 0;
        if (unitsLive) {
            toUnits = _unitsShare(amount);
            unitsRecouped += toUnits;
            accRevenuePerUnit += (toUnits * ACC_PRECISION) / totalUnits;
        }
        toCreator = amount - toUnits;
        if (toCreator > 0) token.safeTransfer(creator, toCreator);
        emit RevenueDistributed(amount, toUnits, toCreator);
    }

    function claimableRevenue(address holder) public view returns (uint256) {
        return _pendingRevenueOf[holder]
            + (unitsOf[holder] * (accRevenuePerUnit - _accSnapshotOf[holder])) / ACC_PRECISION;
    }

    function claimRevenue() external nonReentrant returns (uint256 amount) {
        _harvest(msg.sender);
        amount = _pendingRevenueOf[msg.sender];
        if (amount == 0) revert NothingToClaim();
        _pendingRevenueOf[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit RevenueClaimed(msg.sender, amount);
    }

    /// @dev Shares are defined on gross revenue; `amount` arrives net of the
    /// platform fee, so each share is scaled by BPS / (BPS - feeBps).
    function _unitsShare(uint256 amount) private view returns (uint256) {
        uint256 netBps = BPS - registry.feeBps();
        uint256 target = (unitsRaised * RECOUP_BPS) / BPS;
        uint256 remaining = target > unitsRecouped ? target - unitsRecouped : 0;

        if (remaining == 0) return (amount * STAGE2_UNITS_BPS) / netBps;
        uint256 stage1 = (amount * STAGE1_UNITS_BPS) / netBps;
        if (stage1 <= remaining) return stage1;

        // This payment crosses the recoup line: the part needed to finish
        // stage 1 is split at stage-1 rates, the rest at stage-2 rates.
        uint256 amountAtStage1 = (remaining * netBps) / STAGE1_UNITS_BPS;
        uint256 rest = amount - amountAtStage1;
        return remaining + (rest * STAGE2_UNITS_BPS) / netBps;
    }

    /// @dev Banks revenue earned so far before a holder's unit count changes,
    /// so new holders only earn from revenue after they join.
    function _harvest(address holder) private {
        uint256 acc = accRevenuePerUnit;
        uint256 units = unitsOf[holder];
        if (units > 0) {
            _pendingRevenueOf[holder] += (units * (acc - _accSnapshotOf[holder])) / ACC_PRECISION;
        }
        _accSnapshotOf[holder] = acc;
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function tierCount() external view returns (uint256) {
        return _tiers.length;
    }

    function getTier(uint8 tier) external view returns (Tier memory) {
        return _tiers[tier];
    }

    function milestoneCount() external view returns (uint256) {
        return _milestoneBps.length;
    }

    function milestoneBps(uint8 index) external view returns (uint16) {
        return _milestoneBps[index];
    }
}
