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
    function vault() external view returns (address);
    function campaignFactory() external view returns (address);

    function VAULT_SPENDER_ROLE() external view returns (bytes32);
    function MILESTONE_APPROVER_ROLE() external view returns (bytes32);
    function PUBLISHER_ROLE() external view returns (bytes32);
}

/// @notice Balance surface of CinovaVault used by Subscriptions, Tips and campaigns.
interface ICinovaVault {
    function balanceOf(address account) external view returns (uint256);
    /// Moves balance between two accounts inside the vault (no token transfer).
    function spend(address from, address to, uint256 amount) external;
    /// Pulls `amount` tokens from the caller and credits `account`'s balance.
    function depositFor(address account, uint256 amount) external;
}

/// @notice A FilmCampaign as the vault sees it: revenue share and backing
/// paid from a viewer's vault balance.
interface IFilmCampaign {
    function creator() external view returns (address);
    function tierPrice(uint8 tier) external view returns (uint256);
    function unitPrice() external view returns (uint128);
    /// Pulls the unit holders' share of `amount` from the caller (the vault)
    /// and returns the split; the creator's share stays with the caller.
    function distributeRevenue(uint256 amount) external returns (uint256 toUnits, uint256 toCreator);
    function backFor(address backer, uint8 tier, bytes32 ackHash) external;
    function buyUnitsFor(address backer, uint256 units, bytes32 ackHash) external;
}

/// @notice What the Registry and Vault need to check a campaign is genuine.
interface ICampaignFactory {
    function isCampaign(address campaign) external view returns (bool);
}

interface IBackerPass {
    function mint(address to, uint8 tier) external;
    function burn(address from, uint8 tier, uint256 amount) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}
