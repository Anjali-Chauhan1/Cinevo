import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { linkCampaignToEpisode, unlinkCampaignFromEpisode } from "@/lib/ledger/campaigns";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { prisma } from "@/lib/db";
import { isOnchain } from "@/lib/chain/config";
import { setEpisodeRevenueRecipientOnchain } from "@/lib/chain/operator";

const schema = z.object({ episodeId: z.string().min(1) });

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { creator } = await requireCreator();
  const { id } = params;
  const { episodeId } = schema.parse(await req.json());
  const campaign = await linkCampaignToEpisode(creator.id, id, episodeId);
  if (isOnchain) await setEpisodeRevenueRecipientOnchain(episodeId, id);
  // toJSONSafe: campaigns carry a BigInt field JSON can't serialise.
  return ok(toJSONSafe({ campaign }));
});

export const DELETE = withApiErrors(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { creator } = await requireCreator();
  const linked = await prisma.campaign.findUniqueOrThrow({ where: { id: params.id } });
  const campaign = await unlinkCampaignFromEpisode(creator.id, params.id);
  if (isOnchain && linked.fundedEpisodeId) await setEpisodeRevenueRecipientOnchain(linked.fundedEpisodeId, null);
  // toJSONSafe: campaigns carry a BigInt field JSON can't serialise.
  return ok(toJSONSafe({ campaign }));
});
