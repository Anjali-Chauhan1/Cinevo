import type { ArgumentType, IgnitionModuleBuilder } from "@nomicfoundation/ignition-core";
import { id } from "ethers";

// keccak256 role ids, matching the constants in the contracts.
const VAULT_SPENDER_ROLE = id("VAULT_SPENDER_ROLE");
const FACTORY_ROLE = id("FACTORY_ROLE");

/**
 * Deploys and wires the full Cinova contract set against a given stablecoin.
 * The deployer becomes admin of everything (it has to, to grant the roles
 * below); hand DEFAULT_ADMIN_ROLE to a multisig once deployment is verified.
 */
export function deployCinova(m: IgnitionModuleBuilder, token: ArgumentType) {
  const deployer = m.getAccount(0);
  const treasury = m.getParameter("treasury", deployer);
  const feeBps = m.getParameter("feeBps", 1000); // 10%
  // Stablecoin base units (6 decimals). Defaults ≈ ₹0.10–₹2 per minute and a
  // ₹10 minimum tip at ~₹83/USD — re-check against the live rate.
  const minRatePerMinute = m.getParameter("minRatePerMinute", 1_200n);
  const maxRatePerMinute = m.getParameter("maxRatePerMinute", 24_000n);
  const minTip = m.getParameter("minTip", 120_000n);
  const withdrawDelaySeconds = m.getParameter("withdrawDelaySeconds", 600);
  const backerPassUri = m.getParameter("backerPassUri", "https://cinova.app/api/passes/{id}.json");

  const registry = m.contract("CinovaRegistry", [deployer, treasury, feeBps, minRatePerMinute, maxRatePerMinute]);
  const vault = m.contract("CinovaVault", [token, registry, withdrawDelaySeconds]);
  const subscriptions = m.contract("CinovaSubscriptions", [registry, vault]);
  const tips = m.contract("CinovaTips", [registry, vault, minTip]);
  const backerPass = m.contract("BackerPass", [deployer, backerPassUri]);
  const filmCampaignImplementation = m.contract("FilmCampaign", [], { id: "FilmCampaignImplementation" });
  const campaignFactory = m.contract("CampaignFactory", [registry, token, backerPass, filmCampaignImplementation]);

  m.call(registry, "grantRole", [VAULT_SPENDER_ROLE, subscriptions], { id: "GrantSpender_Subscriptions" });
  m.call(registry, "grantRole", [VAULT_SPENDER_ROLE, tips], { id: "GrantSpender_Tips" });
  m.call(backerPass, "grantRole", [FACTORY_ROLE, campaignFactory], { id: "GrantFactory_BackerPass" });
  m.call(registry, "setCampaignFactory", [campaignFactory]);

  return { registry, vault, subscriptions, tips, backerPass, filmCampaignImplementation, campaignFactory };
}
