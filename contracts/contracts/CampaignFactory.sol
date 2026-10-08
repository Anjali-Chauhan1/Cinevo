// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ICinovaRegistry, ICampaignFactory, IBackerPass} from "./interfaces/ICinova.sol";
import {FilmCampaign} from "./FilmCampaign.sol";
import {BackerPass} from "./BackerPass.sol";

/// @title CampaignFactory
/// @notice Deploys one FilmCampaign escrow per film as a cheap EIP-1167 clone
/// and authorises it to mint its own BackerPasses.
contract CampaignFactory is ICampaignFactory {
    ICinovaRegistry public immutable registry;
    IERC20 public immutable token;
    BackerPass public immutable backerPass;
    address public immutable implementation;

    mapping(address => bool) public isCampaign;
    address[] public campaigns;

    event CampaignCreated(
        address indexed campaign,
        address indexed creator,
        uint256 goal,
        uint64 deadline,
        uint64 deliveryDate,
        bool unitsEnabled
    );

    error NotCreator();
    error NotPublisher();

    constructor(ICinovaRegistry registry_, IERC20 token_, BackerPass backerPass_, address implementation_) {
        registry = registry_;
        token = token_;
        backerPass = backerPass_;
        implementation = implementation_;
    }

    function createCampaign(FilmCampaign.Config calldata cfg) external returns (address campaign) {
        return _create(msg.sender, cfg);
    }

    /// @notice The Cinova server launching a campaign the creator set up in the app.
    function createCampaignFor(address creator, FilmCampaign.Config calldata cfg) external returns (address campaign) {
        if (!registry.hasRole(registry.PUBLISHER_ROLE(), msg.sender)) revert NotPublisher();
        return _create(creator, cfg);
    }

    function _create(address creator, FilmCampaign.Config calldata cfg) private returns (address campaign) {
        if (!registry.isCreator(creator)) revert NotCreator();
        campaign = Clones.clone(implementation);
        isCampaign[campaign] = true;
        campaigns.push(campaign);
        backerPass.grantRole(backerPass.MINTER_ROLE(), campaign);
        FilmCampaign(campaign).initialize(creator, registry, token, IBackerPass(address(backerPass)), cfg);
        emit CampaignCreated(campaign, creator, cfg.goal, cfg.deadline, cfg.deliveryDate, cfg.unitsEnabled);
    }

    function campaignCount() external view returns (uint256) {
        return campaigns.length;
    }
}
