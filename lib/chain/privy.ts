import { PrivyClient } from "@privy-io/node";

let client: PrivyClient | null = null;

/** Server-side Privy client (needs NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET). */
export function getPrivy(): PrivyClient {
  if (client) return client;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET for onchain mode.");
  client = new PrivyClient({ appId, appSecret });
  return client;
}
