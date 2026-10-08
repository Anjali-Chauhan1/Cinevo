// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICinovaRegistry, ICinovaVault, IFilmCampaign, ICampaignFactory} from "./interfaces/ICinova.sol";

/// @title CinovaVault
/// @notice Everyone's Cinova balance, and pay-per-minute settlement.
///
/// Tokens enter through deposits (top-ups, refunds, payouts from campaigns)
/// and leave only through a delayed withdrawal. Inside, money moves between
/// balances without token transfers: a viewer paying for a film, a fan tipping
/// or subscribing, and the creator and platform being paid are all balance
/// updates here. Creators withdraw what they've earned like anyone else.
///
/// Pay-per-minute: while watching, the viewer's wallet signs an off-chain
/// EIP-712 voucher every few seconds ("I owe up to X for this session"), at no
/// gas. When the viewer stops, anyone (normally the Cinova server) submits the
/// latest voucher; the vault charges only the increase over what that session
/// already paid — capped per episode and never more than the balance.
contract CinovaVault is EIP712, ReentrancyGuard, ICinovaVault {
    using SafeERC20 for IERC20;

    struct Voucher {
        address viewer;
        bytes32 episodeId;
        bytes32 sessionId;
        // Total owed for this session so far — only ever increases.
        uint256 cumulativeAmount;
        uint256 expiry;
    }

    struct WithdrawRequest {
        uint128 amount;
        uint64 readyAt;
    }

    bytes32 public constant VOUCHER_TYPEHASH = keccak256(
        "Voucher(address viewer,bytes32 episodeId,bytes32 sessionId,uint256 cumulativeAmount,uint256 expiry)"
    );

    IERC20 public immutable token;
    ICinovaRegistry public immutable registry;
    /// Gap between requesting and completing a withdrawal, so open watch
    /// sessions and accrued subscriptions can be settled first.
    uint256 public immutable withdrawDelay;

    mapping(address => uint256) public balanceOf;
    mapping(address => WithdrawRequest) public withdrawRequests;
    /// keccak256(viewer, episodeId, sessionId) => amount already settled
    /// (paid, or forgiven because the episode cap was reached).
    mapping(bytes32 => uint256) public sessionSettled;
    /// viewer => episodeId => total paid across every session (cap enforcement).
    mapping(address => mapping(bytes32 => uint256)) public episodePaid;

    event Deposited(address indexed account, address indexed from, uint256 amount);
    event WithdrawRequested(address indexed account, uint256 amount, uint256 readyAt);
    event WithdrawCancelled(address indexed account);
    event Withdrawn(address indexed account, uint256 amount);
    event Settled(
        address indexed viewer,
        bytes32 indexed episodeId,
        bytes32 indexed sessionId,
        uint256 amount,
        uint256 toCreator,
        uint256 toUnits,
        uint256 toPlatform
    );
    event Spent(address indexed from, address indexed to, address indexed spender, uint256 amount);
    event BackedFromBalance(address indexed backer, address indexed campaign, uint256 amount);

    error ZeroAmount();
    error InsufficientBalance();
    error NoWithdrawRequest();
    error WithdrawNotReady(uint256 readyAt);
    error VoucherExpired();
    error InvalidSignature();
    error EpisodeNotPaid();
    error StaleVoucher();
    error NotSpender();
    error UnknownCampaign();

    constructor(IERC20 token_, ICinovaRegistry registry_, uint256 withdrawDelay_) EIP712("Cinova Vault", "1") {
        token = token_;
        registry = registry_;
        withdrawDelay = withdrawDelay_;
    }

    // ------------------------------------------------------------------
    // Balance
    // ------------------------------------------------------------------

    function deposit(uint256 amount) external {
        _deposit(msg.sender, amount);
    }

    /// @notice Credits someone's balance with tokens from the caller — used by
    /// the top-up on-ramp, and by campaigns paying out releases and refunds.
    function depositFor(address account, uint256 amount) external {
        _deposit(account, amount);
    }

    function _deposit(address account, uint256 amount) private nonReentrant {
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        balanceOf[account] += amount;
        emit Deposited(account, msg.sender, amount);
    }

    /// @notice Starts the withdraw delay. The balance stays spendable during
    /// the delay so pending sessions can still settle against it.
    function requestWithdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (amount > balanceOf[msg.sender]) revert InsufficientBalance();
        uint64 readyAt = uint64(block.timestamp + withdrawDelay);
        withdrawRequests[msg.sender] = WithdrawRequest(uint128(amount), readyAt);
        emit WithdrawRequested(msg.sender, amount, readyAt);
    }

    function cancelWithdraw() external {
        if (withdrawRequests[msg.sender].amount == 0) revert NoWithdrawRequest();
        delete withdrawRequests[msg.sender];
        emit WithdrawCancelled(msg.sender);
    }

    /// @notice Completes a withdrawal after the delay, paying out whatever is
    /// left of the requested amount once settlements have run.
    function withdraw() external nonReentrant returns (uint256 amount) {
        WithdrawRequest memory req = withdrawRequests[msg.sender];
        if (req.amount == 0) revert NoWithdrawRequest();
        if (block.timestamp < req.readyAt) revert WithdrawNotReady(req.readyAt);
        delete withdrawRequests[msg.sender];

        amount = req.amount < balanceOf[msg.sender] ? req.amount : balanceOf[msg.sender];
        balanceOf[msg.sender] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Pay-per-minute
    // ------------------------------------------------------------------

    function hashVoucher(Voucher calldata v) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(VOUCHER_TYPEHASH, v.viewer, v.episodeId, v.sessionId, v.cumulativeAmount, v.expiry))
        );
    }

    /// @notice Settles a signed voucher. Charges only the increase over what
    /// this session already settled, clamped to the episode cap (the rest of
    /// the episode is free) and to the viewer's balance (any shortfall can be
    /// collected later with the same voucher, until it expires).
    function settle(Voucher calldata v, bytes calldata signature) external nonReentrant returns (uint256 paid) {
        if (block.timestamp > v.expiry) revert VoucherExpired();
        if (!_isValidSignature(v.viewer, hashVoucher(v), signature)) revert InvalidSignature();

        ICinovaRegistry.Episode memory ep = registry.getEpisode(v.episodeId);
        if (!ep.exists || !ep.isPaid) revert EpisodeNotPaid();

        paid = _debitVoucher(v, ep.cap);
        if (paid == 0) {
            emit Settled(v.viewer, v.episodeId, v.sessionId, 0, 0, 0, 0);
            return 0;
        }
        (uint256 toCreator, uint256 toUnits, uint256 fee) = _payOut(ep, paid);
        emit Settled(v.viewer, v.episodeId, v.sessionId, paid, toCreator, toUnits, fee);
    }

    /// @dev Embedded wallets upgraded with EIP-7702 (for gas sponsorship)
    /// have code, so an ERC-1271-only check would ask the delegate contract.
    /// The wallet's own key signing is proof enough, so try that first.
    function _isValidSignature(address signer, bytes32 hash, bytes calldata signature) private view returns (bool) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == signer) return true;
        return SignatureChecker.isValidERC1271SignatureNow(signer, hash, signature);
    }

    /// @dev Voucher accounting: works out what this voucher may charge and
    /// takes it from the viewer's balance.
    function _debitVoucher(Voucher calldata v, uint256 cap) private returns (uint256 paid) {
        bytes32 key = keccak256(abi.encode(v.viewer, v.episodeId, v.sessionId));
        uint256 alreadySettled = sessionSettled[key];
        if (v.cumulativeAmount <= alreadySettled) revert StaleVoucher();
        uint256 owed = v.cumulativeAmount - alreadySettled;

        uint256 paidSoFar = episodePaid[v.viewer][v.episodeId];
        uint256 capRoom = paidSoFar >= cap ? 0 : cap - paidSoFar;
        uint256 chargeable = owed < capRoom ? owed : capRoom;
        uint256 balance = balanceOf[v.viewer];
        paid = chargeable < balance ? chargeable : balance;

        // Above the cap is forgiven for good; a balance shortfall is not.
        sessionSettled[key] = alreadySettled + (owed - chargeable) + paid;
        balanceOf[v.viewer] = balance - paid;
        episodePaid[v.viewer][v.episodeId] = paidSoFar + paid;
    }

    /// @dev Platform fee to the treasury's balance; the rest to the creator's
    /// balance, minus the unit holders' share if the episode is linked to a
    /// film's Producer Unit waterfall (that share is sent to the campaign).
    function _payOut(ICinovaRegistry.Episode memory ep, uint256 paid)
        private
        returns (uint256 toCreator, uint256 toUnits, uint256 fee)
    {
        uint256 net;
        (fee, net) = registry.splitFee(paid);
        balanceOf[registry.treasury()] += fee;

        toCreator = net;
        if (ep.revenueRecipient != address(0)) {
            token.forceApprove(ep.revenueRecipient, net);
            (toUnits, toCreator) = IFilmCampaign(ep.revenueRecipient).distributeRevenue(net);
            token.forceApprove(ep.revenueRecipient, 0);
        }
        balanceOf[ep.creator] += toCreator;
    }

    // ------------------------------------------------------------------
    // Backing a film from the balance
    // ------------------------------------------------------------------

    /// @notice Backs a campaign tier with the caller's balance, so fans never
    /// need tokens in their own wallet.
    function backCampaign(address campaign, uint8 tier, bytes32 ackHash) external nonReentrant {
        IFilmCampaign c = _genuineCampaign(campaign);
        uint256 amount = c.tierPrice(tier);
        _fundCampaign(campaign, amount);
        c.backFor(msg.sender, tier, ackHash);
        token.forceApprove(campaign, 0);
    }

    /// @notice Buys Producer Units with the caller's balance (KYC still applies).
    function buyUnits(address campaign, uint256 units, bytes32 ackHash) external nonReentrant {
        IFilmCampaign c = _genuineCampaign(campaign);
        uint256 amount = units * c.unitPrice();
        _fundCampaign(campaign, amount);
        c.buyUnitsFor(msg.sender, units, ackHash);
        token.forceApprove(campaign, 0);
    }

    function _genuineCampaign(address campaign) private view returns (IFilmCampaign) {
        address factory = registry.campaignFactory();
        if (factory == address(0) || !ICampaignFactory(factory).isCampaign(campaign)) revert UnknownCampaign();
        return IFilmCampaign(campaign);
    }

    /// @dev Takes `amount` from the caller's balance and lets the campaign pull it.
    function _fundCampaign(address campaign, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        uint256 balance = balanceOf[msg.sender];
        if (amount > balance) revert InsufficientBalance();
        balanceOf[msg.sender] = balance - amount;
        token.forceApprove(campaign, amount);
        emit BackedFromBalance(msg.sender, campaign, amount);
    }

    // ------------------------------------------------------------------
    // Spending by Subscriptions / Tips
    // ------------------------------------------------------------------

    /// @notice Moves balance between two accounts. Only contracts granted
    /// VAULT_SPENDER_ROLE in the registry (Subscriptions, Tips) can call this,
    /// and each of them only spends on behalf of the viewer's own action.
    function spend(address from, address to, uint256 amount) external {
        if (!registry.hasRole(registry.VAULT_SPENDER_ROLE(), msg.sender)) revert NotSpender();
        if (amount == 0) revert ZeroAmount();
        uint256 balance = balanceOf[from];
        if (amount > balance) revert InsufficientBalance();
        balanceOf[from] = balance - amount;
        balanceOf[to] += amount;
        emit Spent(from, to, msg.sender, amount);
    }
}
