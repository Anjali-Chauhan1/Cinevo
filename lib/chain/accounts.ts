import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

/**
 * Finds or creates the Cinova account behind an onchain sign-in, linking it
 * by Privy user id, then wallet, then email (so someone who signed up with a
 * password before keeps their account, channel and history).
 */
export async function upsertWalletUser(opts: {
  walletAddress: string;
  email: string | null;
  privyUserId?: string;
  displayName?: string;
}) {
  const walletAddress = opts.walletAddress.toLowerCase();
  const existing =
    (opts.privyUserId ? await prisma.user.findUnique({ where: { privyUserId: opts.privyUserId } }) : null) ??
    (await prisma.user.findUnique({ where: { walletAddress } })) ??
    (opts.email ? await prisma.user.findUnique({ where: { email: opts.email.toLowerCase() } }) : null);

  if (existing) {
    if (existing.walletAddress && existing.walletAddress !== walletAddress) {
      throw new Error("This account is already linked to a different wallet");
    }
    return prisma.user.update({
      where: { id: existing.id },
      data: { walletAddress, privyUserId: opts.privyUserId ?? existing.privyUserId },
    });
  }

  const email = (opts.email ?? `${walletAddress}@wallet.cinova`).toLowerCase();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        // Onchain accounts sign in through their wallet, never a password.
        passwordHash: await hashPassword(randomBytes(32).toString("hex")),
        displayName: opts.displayName || email.split("@")[0].slice(0, 40),
        privyUserId: opts.privyUserId,
        walletAddress,
      },
    });
    // Balance is mirrored from the chain; it starts at zero.
    await tx.ledgerAccount.create({ data: { userId: user.id, balancePaise: 0 } });
    return user;
  });
}

/** The exact message a dev wallet signs to sign in (local chain only). */
export const devSignInMessage = (address: string, issuedAt: number) =>
  `Sign in to Cinova (local development)\nWallet: ${address.toLowerCase()}\nIssued at: ${issuedAt}`;
