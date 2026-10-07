// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IBackerPass} from "./interfaces/ICinova.sol";

/// @title BackerPass
/// @notice Non-transferable ERC-1155 pass per film tier. Holding one unlocks
/// that tier's perks (credits, early access, premiere access).
///
/// Token ids are derived from the minting campaign's address, so a campaign
/// can only ever mint or burn its own passes:
///   id = (uint160(campaign) << 8) | tier
contract BackerPass is ERC1155, AccessControl, IBackerPass {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    /// Held by CampaignFactory so it can grant MINTER_ROLE to each new campaign.
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");

    error Soulbound();

    constructor(address admin, string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setRoleAdmin(MINTER_ROLE, FACTORY_ROLE);
    }

    function tokenIdFor(address campaign, uint8 tier) public pure returns (uint256) {
        return (uint256(uint160(campaign)) << 8) | tier;
    }

    function mint(address to, uint8 tier) external onlyRole(MINTER_ROLE) {
        _mint(to, tokenIdFor(msg.sender, tier), 1, "");
    }

    /// @notice Revokes passes when a backer is refunded.
    function burn(address from, uint8 tier, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, tokenIdFor(msg.sender, tier), amount);
    }

    function balanceOf(address account, uint256 id)
        public
        view
        override(ERC1155, IBackerPass)
        returns (uint256)
    {
        return super.balanceOf(account, id);
    }

    /// Mint and burn only — a pass belongs to the person who backed.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) revert Soulbound();
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
