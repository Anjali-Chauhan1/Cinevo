import { prisma } from "@/lib/db";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";

export const GET = withApiErrors(async () => {
  const scores = await prisma.popularityScore.findMany({
    orderBy: { score: "desc" },
    take: 20,
    include: {
      episode: { include: { creator: { select: { handle: true, channelName: true } } } },
    },
  });
  return ok(toJSONSafe({ trending: scores }));
});
