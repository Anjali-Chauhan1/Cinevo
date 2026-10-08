import { NextRequest } from "next/server";
import { z } from "zod";
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { sanitizeUser } from "@/lib/serialize";
import { isOnchain } from "@/lib/chain/config";
import { getPrivy } from "@/lib/chain/privy";
import { upsertWalletUser } from "@/lib/chain/accounts";

const schema = z.object({ accessToken: z.string().min(10) });

/**
 * Onchain sign-in: swaps a Privy access token for a Cinova session. The
 * token is verified server-side, and the email and embedded wallet come from
 * Privy's API (never from the browser).
 */
export const POST = withApiErrors(async (req: NextRequest) => {
  if (!isOnchain) return ok({ error: "Onchain sign-in is not enabled" }, 404);
  const { accessToken } = schema.parse(await req.json());

  const privy = getPrivy();
  let privyUserId: string;
  try {
    privyUserId = (await privy.utils().auth().verifyAccessToken(accessToken)).user_id;
  } catch {
    return ok({ error: "Your sign-in expired — please sign in again" }, 401);
  }
  const privyUser = await privy.users()._get(privyUserId);

  type Linked = { type: string; address?: string; email?: string; chain_type?: string; connector_type?: string };
  const accounts = privyUser.linked_accounts as Linked[];
  const embedded = accounts.find((a) => a.type === "wallet" && a.chain_type === "ethereum" && a.connector_type === "embedded");
  // The wallet is created right after first login; the browser retries on 409.
  if (!embedded?.address) return ok({ error: "Your wallet is still being created", retry: true }, 409);
  const email = accounts.find((a) => a.type === "email")?.address ?? accounts.find((a) => a.type === "google_oauth")?.email ?? null;

  const user = await upsertWalletUser({ walletAddress: embedded.address, email, privyUserId });
  if (user.suspended) return ok({ error: "This account is suspended" }, 403);

  const res = ok({ user: sanitizeUser(user) });
  res.cookies.set(SESSION_COOKIE_NAME, signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
});
