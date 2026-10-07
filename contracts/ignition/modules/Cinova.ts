import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { deployCinova } from "../deployCinova.js";

/** Production / testnet deployment against an existing USD stablecoin.
 * Requires the `token` parameter (see ignition/parameters/). */
export default buildModule("Cinova", (m) => {
  const token = m.getParameter<string>("token");
  return deployCinova(m, token);
});
