// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ICinovaRegistry, ICampaignFactory, IFilmCampaignView} from "./interfaces/ICinova.sol";

/// @title CinovaRegistry
/// @notice Single source of truth for who may do what: verified creators,
/// episodes and their pricing, KYC-verified investors, the platform fee, and
/// the roles every other Cinova contract checks.
contract CinovaRegistry is AccessControl, ICinovaRegistry {
    /// Approves creator channels (MVP: the admin team).
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    /// Marks investors as KYC-verified in a permitted region (a licensed partner).
    bytes32 public constant KYC_ROLE = keccak256("KYC_ROLE");
    /// Approves milestone proof so escrow can release (MVP: admin; roadmap: backer vote).
    bytes32 public constant MILESTONE_APPROVER_ROLE = keccak256("MILESTONE_APPROVER_ROLE");
    /// Contracts allowed to move funds out of viewer balances (Subscriptions, Tips).
    bytes32 public constant VAULT_SPENDER_ROLE = keccak256("VAULT_SPENDER_ROLE");

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 2_000;

    address public treasury;
    uint16 public feeBps;
    address public campaignFactory;

    /// Allowed pay-per-minute range, in stablecoin base units per minute.
    uint256 public minRatePerMinute;
    uint256 public maxRatePerMinute;

    mapping(address => bool) public isCreator;
    mapping(address => bool) public isVerifiedInvestor;
    mapping(bytes32 => Episode) private _episodes;

    event CreatorRegistered(address indexed creator);
    event CreatorRemoved(address indexed creator);
    event InvestorVerificationSet(address indexed account, bool verified);
    event EpisodeRegistered(
        bytes32 indexed episodeId,
        address indexed creator,
        uint96 ratePerMinute,
        uint32 previewSeconds,
        uint128 cap,
        bool isPaid
    );
    event PricingUpdated(bytes32 indexed episodeId, uint96 ratePerMinute, uint32 previewSeconds, uint128 cap, bool isPaid);
    event RevenueRecipientSet(bytes32 indexed episodeId, address recipient);
    event TreasuryUpdated(address treasury);
    event FeeUpdated(uint16 feeBps);
    event RateBoundsUpdated(uint256 minRatePerMinute, uint256 maxRatePerMinute);
    event CampaignFactorySet(address factory);

    error NotCreator();
    error NotEpisodeOwner();
    error EpisodeExists();
    error UnknownEpisode();
    error InvalidPricing();
    error InvalidRecipient();
    error InvalidFee();
    error ZeroAddress();

    constructor(
        address admin,
        address treasury_,
        uint16 feeBps_,
        uint256 minRatePerMinute_,
        uint256 maxRatePerMinute_
    ) {
        if (admin == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();
        if (minRatePerMinute_ == 0 || minRatePerMinute_ > maxRatePerMinute_) revert InvalidPricing();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
        _grantRole(KYC_ROLE, admin);
        _grantRole(MILESTONE_APPROVER_ROLE, admin);
        treasury = treasury_;
        feeBps = feeBps_;
        minRatePerMinute = minRatePerMinute_;
        maxRatePerMinute = maxRatePerMinute_;
    }

    // ------------------------------------------------------------------
    // Creators and investors
    // ------------------------------------------------------------------

    function registerCreator(address creator) external onlyRole(VERIFIER_ROLE) {
        if (creator == address(0)) revert ZeroAddress();
        isCreator[creator] = true;
        emit CreatorRegistered(creator);
    }

    function removeCreator(address creator) external onlyRole(VERIFIER_ROLE) {
        isCreator[creator] = false;
        emit CreatorRemoved(creator);
    }

    /// @notice KYC result from the licensed partner. Region is decided by
    /// identity, never IP, so only a KYC operator can set this.
    function setInvestorVerified(address account, bool verified) external onlyRole(KYC_ROLE) {
        isVerifiedInvestor[account] = verified;
        emit InvestorVerificationSet(account, verified);
    }

    // ------------------------------------------------------------------
    // Episodes
    // ------------------------------------------------------------------

    /// @param episodeId keccak256 of the off-chain episode id.
    function registerEpisode(
        bytes32 episodeId,
        uint96 ratePerMinute,
        uint32 previewSeconds,
        uint128 cap,
        bool isPaid
    ) external {
        if (!isCreator[msg.sender]) revert NotCreator();
        if (_episodes[episodeId].exists) revert EpisodeExists();
        _validatePricing(ratePerMinute, cap, isPaid);
        _episodes[episodeId] = Episode({
            creator: msg.sender,
            ratePerMinute: ratePerMinute,
            previewSeconds: previewSeconds,
            cap: cap,
            isPaid: isPaid,
            exists: true,
            revenueRecipient: address(0)
        });
        emit EpisodeRegistered(episodeId, msg.sender, ratePerMinute, previewSeconds, cap, isPaid);
    }

    function setPricing(
        bytes32 episodeId,
        uint96 ratePerMinute,
        uint32 previewSeconds,
        uint128 cap,
        bool isPaid
    ) external {
        Episode storage ep = _ownedEpisode(episodeId);
        _validatePricing(ratePerMinute, cap, isPaid);
        ep.ratePerMinute = ratePerMinute;
        ep.previewSeconds = previewSeconds;
        ep.cap = cap;
        ep.isPaid = isPaid;
        emit PricingUpdated(episodeId, ratePerMinute, previewSeconds, cap, isPaid);
    }

    /// @notice Routes this episode's pay-per-minute revenue through one of the
    /// creator's own FilmCampaigns (Producer Unit waterfall). Zero clears it.
    function setRevenueRecipient(bytes32 episodeId, address recipient) external {
        Episode storage ep = _ownedEpisode(episodeId);
        if (recipient != address(0)) {
            if (campaignFactory == address(0) || !ICampaignFactory(campaignFactory).isCampaign(recipient)) {
                revert InvalidRecipient();
            }
            if (IFilmCampaignView(recipient).creator() != msg.sender) revert InvalidRecipient();
        }
        ep.revenueRecipient = recipient;
        emit RevenueRecipientSet(episodeId, recipient);
    }

    function getEpisode(bytes32 episodeId) external view returns (Episode memory) {
        return _episodes[episodeId];
    }

    // ------------------------------------------------------------------
    // Fees
    // ------------------------------------------------------------------

    /// @notice Splits a gross amount into the platform fee and the remainder.
    function splitFee(uint256 gross) external view returns (uint256 fee, uint256 net) {
        fee = (gross * feeBps) / BPS;
        net = gross - fee;
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setFeeBps(uint16 feeBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function setRateBounds(uint256 min_, uint256 max_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (min_ == 0 || min_ > max_) revert InvalidPricing();
        minRatePerMinute = min_;
        maxRatePerMinute = max_;
        emit RateBoundsUpdated(min_, max_);
    }

    function setCampaignFactory(address factory) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (factory == address(0)) revert ZeroAddress();
        campaignFactory = factory;
        emit CampaignFactorySet(factory);
    }

    // AccessControl.hasRole satisfies the interface; restated for the compiler.
    function hasRole(bytes32 role, address account)
        public
        view
        override(AccessControl, ICinovaRegistry)
        returns (bool)
    {
        return super.hasRole(role, account);
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _ownedEpisode(bytes32 episodeId) private view returns (Episode storage ep) {
        ep = _episodes[episodeId];
        if (!ep.exists) revert UnknownEpisode();
        if (ep.creator != msg.sender) revert NotEpisodeOwner();
    }

    function _validatePricing(uint96 ratePerMinute, uint128 cap, bool isPaid) private view {
        if (!isPaid) return;
        if (ratePerMinute < minRatePerMinute || ratePerMinute > maxRatePerMinute || cap == 0) {
            revert InvalidPricing();
        }
    }
}
