import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { startWatchSession } from "@/lib/ledger/vault";
import { ok, withApiErrors } from "@/lib/api";
import { FreeReason } from "@/lib/constants";
import { getAddresses, isOnchain, toChainId } from "@/lib/chain/config";
import { syncEpisodeOnchain } from "@/lib/chain/operator";

const schema = z.object({ episodeId: z.string().min(1) });
// How long a session's vouchers stay valid for settlement.
const VOUCHER_LIFETIME_SECONDS = 7 * 24 * 3600;

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const { episodeId } = schema.parse(await req.json());

  if (isOnchain) {
    // Vouchers can only settle against an episode the registry knows about.
    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    if (episode.isPaid && !episode.chainSyncedAt) await syncEpisodeOnchain(episodeId);
  }

  let session = await startWatchSession(user.id, episodeId);
  if (!isOnchain || session.freeReason !== FreeReason.NONE) return ok({ session });

  // Paid session in onchain mode: fix the voucher expiry once, and tell the
  // player exactly what its wallet should sign every 10 seconds.
  if (!session.voucherExpiry) {
    session = await prisma.watchSession.update({
      where: { id: session.id },
      data: { voucherExpiry: Math.floor(Date.now() / 1000) + VOUCHER_LIFETIME_SECONDS },
    });
  }
  return ok({
    session,
    voucher: {
      vault: getAddresses().vault,
      viewer: user.walletAddress,
      episodeId: toChainId(episodeId),
      sessionId: toChainId(session.sessionToken),
      expiry: session.voucherExpiry,
    },
  });
});
