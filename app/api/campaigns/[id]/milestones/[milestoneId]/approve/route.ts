import { requireAdmin } from "@/lib/auth";
import { approveMilestone } from "@/lib/ledger/campaigns";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { prisma } from "@/lib/db";
import { notify, notifyMany, campaignBackerIds } from "@/lib/notifications";
import { NotificationType } from "@/lib/constants";
import { paise } from "@/lib/format";
import { isOnchain } from "@/lib/chain/config";
import { approveMilestoneOnchainFlow } from "@/lib/chain/flows";

export const POST = withApiErrors(
  async (_req: Request, { params }: { params: { id: string; milestoneId: string } }) => {
    const admin = await requireAdmin();
    const { milestoneId } = params;
    const milestone = isOnchain
      ? await approveMilestoneOnchainFlow(admin.id, milestoneId)
      : await approveMilestone(admin.id, milestoneId);

    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: milestone.campaignId },
      include: { creator: true },
    });
    const link = `/back/${campaign.id}`;
    await notify(campaign.creator.userId, {
      type: NotificationType.MILESTONE_RELEASED,
      title: `${paise(milestone.releasedAmountPaise)} released for "${milestone.label}"`,
      body: `Milestone approved on ${campaign.filmTitle}. The money is in your balance.`,
      link,
    });
    await notifyMany(await campaignBackerIds(campaign.id), () => ({
      type: NotificationType.MILESTONE_RELEASED,
      title: `${campaign.filmTitle}: "${milestone.label}" is done`,
      body: `${campaign.creator.channelName} completed a milestone on a film you backed.`,
      link,
    }));
    return ok(toJSONSafe({ milestone }));
  }
);
