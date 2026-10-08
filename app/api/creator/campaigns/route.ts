import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";

/** The signed-in creator's own campaigns, every status, newest first. */
export const GET = withApiErrors(async () => {
  const { creator } = await requireCreator();
  const campaigns = await prisma.campaign.findMany({
    where: { creatorId: creator.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filmTitle: true,
      status: true,
      goalPaise: true,
      totalBackedPaise: true,
      deadline: true,
      producerUnitsEnabled: true,
      totalUnits: true,
      fundedEpisodeId: true,
    },
  });
  return ok({ campaigns });
});
