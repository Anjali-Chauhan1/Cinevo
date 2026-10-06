import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { linkCampaignToEpisode } from "@/lib/ledger/campaigns";
import { ok, withApiErrors } from "@/lib/api";

const schema = z.object({ episodeId: z.string().min(1) });

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { creator } = await requireCreator();
  const { id } = params;
  const { episodeId } = schema.parse(await req.json());
  const campaign = await linkCampaignToEpisode(creator.id, id, episodeId);
  return ok({ campaign });
});
