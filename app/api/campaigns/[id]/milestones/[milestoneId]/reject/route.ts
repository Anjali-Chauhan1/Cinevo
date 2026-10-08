import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { rejectMilestone } from "@/lib/ledger/campaigns";
import { ok, withApiErrors } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { NotificationType } from "@/lib/constants";
import { isOnchain } from "@/lib/chain/config";
import { rejectMilestoneOnchain } from "@/lib/chain/operator";

const schema = z.object({ reason: z.string().min(3).max(500) });

export const POST = withApiErrors(
  async (req: NextRequest, { params }: { params: { id: string; milestoneId: string } }) => {
    const admin = await requireAdmin();
    const { milestoneId } = params;
    const { reason } = schema.parse(await req.json());
    if (isOnchain) await rejectMilestoneOnchain(milestoneId, reason);
    const milestone = await rejectMilestone(admin.id, milestoneId, reason);
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: milestone.campaignId },
      include: { creator: true },
    });
    await notify(campaign.creator.userId, {
      type: NotificationType.MILESTONE_REJECTED,
      title: `Proof for "${milestone.label}" wasn't accepted`,
      body: reason,
      link: `/back/${campaign.id}`,
    });
    return ok({ milestone });
  }
);
