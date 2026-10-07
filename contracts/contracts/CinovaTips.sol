// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICinovaRegistry, ICinovaVault} from "./interfaces/ICinova.sol";

/// @title CinovaTips
/// @notice One-tap tips from the fan's vault balance: 90% to the creator,
/// 10% platform fee, settled instantly. The message itself stays off-chain;
/// only its hash is recorded so the supporter wall can be verified.
contract CinovaTips is ReentrancyGuard {
    ICinovaRegistry public immutable registry;
    ICinovaVault public immutable vault;
    /// Smallest tip, in stablecoin base units (the doc's ₹10).
    uint256 public minTip;

    event Tipped(
        address indexed fan,
        address indexed creator,
        bytes32 indexed filmId,
        uint256 amount,
        uint256 toCreator,
        uint256 toPlatform,
        bytes32 messageHash
    );
    event MinTipUpdated(uint256 minTip);

    error NotCreator();
    error TipTooSmall();
    error SelfTip();
    error NotAdmin();

    constructor(ICinovaRegistry registry_, ICinovaVault vault_, uint256 minTip_) {
        registry = registry_;
        vault = vault_;
        minTip = minTip_;
    }

    /// @param filmId keccak256 of the off-chain episode id (zero for a channel tip).
    function tip(address creator, bytes32 filmId, uint256 amount, bytes32 messageHash) external nonReentrant {
        if (!registry.isCreator(creator)) revert NotCreator();
        if (creator == msg.sender) revert SelfTip();
        if (amount < minTip) revert TipTooSmall();

        (uint256 fee, uint256 net) = registry.splitFee(amount);
        if (fee > 0) vault.spend(msg.sender, registry.treasury(), fee);
        vault.spend(msg.sender, creator, net);
        emit Tipped(msg.sender, creator, filmId, amount, net, fee, messageHash);
    }

    function setMinTip(uint256 minTip_) external {
        if (!registry.hasRole(bytes32(0), msg.sender)) revert NotAdmin(); // DEFAULT_ADMIN_ROLE
        minTip = minTip_;
        emit MinTipUpdated(minTip_);
    }
}
