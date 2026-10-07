import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { deployCinova } from "../deployCinova.js";

/** Local development: deploys a mintable MockUSDC alongside everything else.
 * Never use on a public network. */
export default buildModule("CinovaLocal", (m) => {
  const mockUsdc = m.contract("MockUSDC");
  return { mockUsdc, ...deployCinova(m, mockUsdc) };
});
