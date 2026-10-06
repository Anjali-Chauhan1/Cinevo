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

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const body = tipSchema.parse(await req.json());
  const amountPaise = rupeesToPaiseInt(body.amountRupees);

  const tip = await sendTip(user.id, body.creatorId, amountPaise, body.message, body.episodeId);

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
