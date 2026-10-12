import { prisma } from "@/lib/db";
import { getOrCreateLedgerAccountId, transferWithFee } from "@/lib/ledger/core";
import { PLATFORM_FEE_BPS, CHAT, LedgerTxType } from "@/lib/constants";
import { money } from "@/lib/format";

export class TipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TipError";
  }
}

const MIN_TIP_CENTS = 100; // $1 minimum

export async function sendTip(
  fanId: string,
  creatorId: string,
  amountCents: number,
  message?: string,
  episodeId?: string
) {
  if (amountCents < MIN_TIP_CENTS) {
    throw new TipError(`Tips start at ${money(MIN_TIP_CENTS)}`);
  }
  if (message && message.length > CHAT.TIP_MESSAGE_MAX_LEN) {
    throw new TipError(`Tip messages are limited to ${CHAT.TIP_MESSAGE_MAX_LEN} characters`);
  }

  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  if (creator.userId === fanId) throw new TipError("You can't tip your own channel");

  if (episodeId) {
    const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
    if (!episode || episode.creatorId !== creatorId) {
      throw new TipError("That episode doesn't belong to this creator");
    }
  }

  return prisma.$transaction(async (tx) => {
    const fanAccountId = await getOrCreateLedgerAccountId(tx, fanId);
    const creatorAccountId = await getOrCreateLedgerAccountId(tx, creator.userId);

    const tip = await tx.tip.create({
      data: { fanId, creatorId, episodeId, amountCents, message: message?.trim() || null },
    });

    await transferWithFee(tx, {
      fromAccountId: fanAccountId,
      toAccountId: creatorAccountId,
      totalAmountCents: amountCents,
      feeBps: PLATFORM_FEE_BPS,
      debitType: LedgerTxType.TIP_OUT,
      creditType: LedgerTxType.TIP_IN,
      feeType: LedgerTxType.PLATFORM_FEE_IN,
      refType: "TIP",
      refId: tip.id,
    });

    // Tips during a live premiere feed the hype bar and get pinned in chat —
    // handled by the caller (API route) which also has socket access to
    // broadcast the highlight in realtime; this function only owns the money.
    return tip;
  });
}
