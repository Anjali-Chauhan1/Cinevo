import { NextRequest } from "next/server";
import { z } from "zod";
import { verifyMessage, type Address, type Hex } from "viem";
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { sanitizeUser } from "@/lib/serialize";
import { isLocalChain, isOnchain } from "@/lib/chain/config";
import { devSignInMessage, upsertWalletUser } from "@/lib/chain/accounts";

const schema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  issuedAt: z.number().int(),
  signature: z.string().startsWith("0x"),
  email: z.string().email().optional(),
  displayName: z.string().min(2).max(50).optional(),
});

/**
 * Local-chain development and automated tests only: sign in by signing a
 * message with a wallet key, standing in for Privy (which can't run against
 * a local Hardhat node). Refused unless the app points at the local chain
 * AND ALLOW_DEV_WALLET_LOGIN=1.
 */
export const POST = withApiErrors(async (req: NextRequest) => {
  if (!isOnchain || !isLocalChain || process.env.ALLOW_DEV_WALLET_LOGIN !== "1") {
    return ok({ error: "Not found" }, 404);
  }
  const body = schema.parse(await req.json());
  if (Math.abs(Date.now() - body.issuedAt) > 5 * 60_000) return ok({ error: "Sign-in message expired" }, 401);
  // A malformed signature throws rather than returning false.
  const valid = await verifyMessage({
    address: body.address as Address,
    message: devSignInMessage(body.address, body.issuedAt),
    signature: body.signature as Hex,
  }).catch(() => false);
  if (!valid) return ok({ error: "Bad signature" }, 401);

  const user = await upsertWalletUser({ walletAddress: body.address, email: body.email ?? null, displayName: body.displayName });
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
