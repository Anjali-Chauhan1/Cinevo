import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sendTip } from "@/lib/ledger/tips";
import { tipSchema, rupeesToPaiseInt } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { postTipHighlight } from "@/lib/chat";
import { addTipToHypeBar } from "@/lib/hype";
import { emitToEpisode } from "@/lib/realtime";
import { EpisodeStatus } from "@/lib/constants";
import { toJSONSafe } from "@/lib/serialize";
import { notify } from "@/lib/notifications";
import { NotificationType } from "@/lib/constants";
import { paise } from "@/lib/format";
import type { Hex } from "viem";
import { isOnchain } from "@/lib/chain/config";
import { confirmTip } from "@/lib/chain/confirm";

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const body = tipSchema.parse(await req.json());
  if (isOnchain && !body.txHash) return ok({ error: "Missing transaction hash" }, 400);
  const { tip, created } =
    isOnchain && body.txHash
      ? await confirmTip(user.id, body.txHash as Hex, { creatorId: body.creatorId, episodeId: body.episodeId, message: body.message })
      : { tip: await sendTip(user.id, body.creatorId, rupeesToPaiseInt(body.amountRupees), body.message, body.episodeId), created: true };
  // A replayed confirmation must not notify the creator or post to chat again.
  if (!created) return ok({ tip }, 200);
  // Onchain the amount comes from the chain event, not the request.
  const amountPaise = tip.amountPaise;

  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: body.creatorId } });
  await notify(creator.userId, {
    type: NotificationType.NEW_TIP,
    title: `${user.displayName} tipped you ${paise(amountPaise)}`,
    body: body.message || undefined,
    link: "/studio",
  });

  // Tips during a live premiere get pinned in chat and feed the hype bar.
  // This is realtime-best-effort UX on top of the money, which already
  // settled in sendTip() regardless of whether anyone is listening.
  if (body.episodeId) {
    const episode = await prisma.episode.findUnique({ where: { id: body.episodeId } });
    if (episode?.status === EpisodeStatus.PREMIERING) {
      const message = await postTipHighlight(body.episodeId, user.id, amountPaise, body.message);
      emitToEpisode(body.episodeId, "chat_message", toJSONSafe({
        id: message.id,
        text: message.text,
        type: message.type,
        tipAmountPaise: message.tipAmountPaise,
        pinned: true,
        createdAt: message.createdAt,
        user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      }));

      const { progress, newLevel } = await addTipToHypeBar(body.episodeId, amountPaise);
      emitToEpisode(body.episodeId, "hype_update", toJSONSafe({ progress, newLevel }));
    }
  }

  return ok({ tip }, 201);
});
