import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { isActiveSubscriber } from "@/lib/ledger/subscriptions";

export const GET = withApiErrors(async (_req: Request, { params }: { params: { handle: string } }) => {
  const { handle } = params;
  const creator = await prisma.creator.findUnique({
    where: { handle },
    include: {
      emotes: true,
      episodes: { orderBy: { createdAt: "desc" } },
      campaigns: { where: { status: { in: ["ACTIVE", "FUNDED_PRODUCING"] } }, include: { tiers: true } },
    },
  });
  if (!creator) return ok({ error: "Channel not found" }, 404);

  const topTips = await prisma.tip.groupBy({
    by: ["fanId"],
    where: { creatorId: creator.id },
    _sum: { amountPaise: true },
    orderBy: { _sum: { amountPaise: "desc" } },
    take: 10,
  });
  const tipperIds = topTips.map((t) => t.fanId);
  const tippers = await prisma.user.findMany({
    where: { id: { in: tipperIds } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  const supporterWall = topTips.map((t) => ({
    user: tippers.find((u) => u.id === t.fanId),
    totalPaise: t._sum.amountPaise ?? 0,
  }));

  const subscriberCount = await prisma.subscription.count({ where: { creatorId: creator.id, active: true } });

  const viewer = await getCurrentUser();
  const isSubscribed = viewer ? await isActiveSubscriber(viewer.id, creator.id) : false;
  const isOwner = viewer?.id === creator.userId;

  return ok(
    toJSONSafe({
      creator: { ...creator, episodes: undefined, emotes: undefined, campaigns: undefined },
      episodes: creator.episodes,
      emotes: creator.emotes,
      campaigns: creator.campaigns,
      supporterWall,
      subscriberCount,
      viewerState: { isSubscribed, isOwner },
    })
  );
});
