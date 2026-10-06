import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { BackingStatus } from "@/lib/constants";

export const GET = withApiErrors(async () => {
  const user = await requireUser();

  const [reviews, backings, subscriptions] = await Promise.all([
    prisma.review.findMany({
      where: { userId: user.id },
      include: { episode: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.backing.findMany({
      where: { userId: user.id, status: BackingStatus.ACTIVE },
      include: { campaign: { select: { id: true, filmTitle: true } }, tier: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.subscription.count({ where: { fanId: user.id, active: true } }),
  ]);

  return ok(toJSONSafe({ reviews, backings, subscriptionCount: subscriptions }));
});
