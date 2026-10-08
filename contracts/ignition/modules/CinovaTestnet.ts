import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { deployCinova } from "../deployCinova.js";

/** Monad testnet: deploys the Cinova Test USD token (owned by the operator)
 * and everything else, then mints the operator a float for the in-app
 * "Get test money" faucet and approves the vault to pull from it. */
export default buildModule("CinovaTestnet", (m) => {
  const deployer = m.getAccount(0);
  const testUsd = m.contract("CinovaTestUSD", [deployer]);
  const cinova = deployCinova(m, testUsd);
  const float = m.getParameter("faucetFloat", 1_000_000_000_000n); // 1,000,000 tUSD
  m.call(testUsd, "mint", [deployer, float], { id: "MintFaucetFloat" });
  m.call(testUsd, "approve", [cinova.vault, 2n ** 256n - 1n], { id: "ApproveVaultForFaucet" });
  return { testUsd, ...cinova };
});
