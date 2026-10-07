// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Read surface of CinovaRegistry used by the other contracts.
interface ICinovaRegistry {
    struct Episode {
        address creator;
        // Price per minute of watching, in stablecoin base units.
        uint96 ratePerMinute;
        uint32 previewSeconds;
        // Maximum one viewer ever pays for this episode, across all sessions.
        uint128 cap;
        bool isPaid;
        bool exists;
        // Optional FilmCampaign that receives this episode's revenue through
        // the Producer Unit waterfall. Zero = straight to the creator.
        address revenueRecipient;
    }

    function hasRole(bytes32 role, address account) external view returns (bool);
    function isCreator(address account) external view returns (bool);
    function isVerifiedInvestor(address account) external view returns (bool);
    function getEpisode(bytes32 episodeId) external view returns (Episode memory);
    function treasury() external view returns (address);
    function feeBps() external view returns (uint16);
    function splitFee(uint256 gross) external view returns (uint256 fee, uint256 net);

    function VAULT_SPENDER_ROLE() external view returns (bytes32);
    function MILESTONE_APPROVER_ROLE() external view returns (bytes32);
}

/// @notice Balance surface of CinovaVault used by Subscriptions and Tips.
interface ICinovaVault {
    function balanceOf(address account) external view returns (uint256);
    function spend(address from, address to, uint256 amount) external;
}

/// @notice Anything that can take a share of episode revenue (a FilmCampaign).
/// The caller must approve `amount` first; the receiver pulls it.
interface IRevenueReceiver {
    function distributeRevenue(uint256 amount) external returns (uint256 toUnits, uint256 toCreator);
}

/// @notice What the Registry needs to check before linking an episode to a campaign.
interface ICampaignFactory {
    function isCampaign(address campaign) external view returns (bool);
}

interface IFilmCampaignView {
    function creator() external view returns (address);
}

interface IBackerPass {
    function mint(address to, uint8 tier) external;
    function burn(address from, uint8 tier, uint256 amount) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}
