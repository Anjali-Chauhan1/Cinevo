// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CinovaTestUSD
/// @notice Testnet stand-in for the USD stablecoin: 6 decimals like USDC.
/// Only the owner (the Cinova server) can mint; users get it through the
/// in-app "Get test money" faucet, which credits their vault balance.
/// Has no value. Never deploy on mainnet.
contract CinovaTestUSD is ERC20, Ownable {
    constructor(address owner_) ERC20("Cinova Test USD", "tUSD") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
