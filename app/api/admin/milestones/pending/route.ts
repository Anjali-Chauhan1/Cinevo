import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { MilestoneStatus } from "@/lib/constants";

export const GET = withApiErrors(async () => {
  await requireAdmin();
  const milestones = await prisma.milestone.findMany({
    where: { status: MilestoneStatus.SUBMITTED },
    include: { campaign: { select: { id: true, filmTitle: true, creator: { select: { channelName: true } } } } },
    orderBy: { submittedAt: "asc" },
  });
  return ok({ milestones });
});
