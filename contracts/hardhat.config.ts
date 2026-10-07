import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Cancun is the conservative target for Monad's EVM compatibility.
      evmVersion: "cancun",
    },
  },
  networks: {
    // Check RPC URL and chain ID against the Monad docs before deploying.
    // Secrets are read via configVariable: set them with
    //   npx hardhat keystore set MONAD_DEPLOYER_PRIVATE_KEY
    // (or as environment variables) — never commit them.
    monadTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 10143,
      url: configVariable("MONAD_TESTNET_RPC_URL"),
      accounts: [configVariable("MONAD_DEPLOYER_PRIVATE_KEY")],
    },
  },
});
