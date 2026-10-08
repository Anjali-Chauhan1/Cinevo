import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { deployCinova } from "../deployCinova.js";

/** Local development: deploys a mintable MockUSDC alongside everything else,
 * and gives the operator a float for the in-app top-up faucet.
 * Never use on a public network. */
export default buildModule("CinovaLocal", (m) => {
  const deployer = m.getAccount(0);
  const mockUsdc = m.contract("MockUSDC");
  const cinova = deployCinova(m, mockUsdc);
  m.call(mockUsdc, "mint", [deployer, 1_000_000_000_000n], { id: "MintFaucetFloat" }); // 1,000,000 test USD
  m.call(mockUsdc, "approve", [cinova.vault, 2n ** 256n - 1n], { id: "ApproveVaultForFaucet" });
  return { mockUsdc, ...cinova };
});
