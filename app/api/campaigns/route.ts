import { NextRequest } from "next/server";
import { requireCreator, ForbiddenError } from "@/lib/auth";
import { createCampaign } from "@/lib/ledger/campaigns";
import { campaignCreateSchema, rupeesToPaiseInt } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { VerificationStatus } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { isOnchain } from "@/lib/chain/config";
import { createCampaignOnchain } from "@/lib/chain/operator";

export const POST = withApiErrors(async (req: NextRequest) => {
  const { creator } = await requireCreator();
  if (creator.verificationStatus !== VerificationStatus.APPROVED) {
    throw new ForbiddenError("Your channel must be verified before opening a campaign");
  }
  const body = campaignCreateSchema.parse(await req.json());

  const campaign = await createCampaign(creator.id, {
    filmTitle: body.filmTitle,
    pitch: body.pitch,
    pitchVideoUrl: body.pitchVideoUrl,
    goalPaise: rupeesToPaiseInt(body.goalRupees),
    deadline: new Date(body.deadline),
    deliveryDate: new Date(body.deliveryDate),
    producerUnitsEnabled: body.producerUnitsEnabled,
    tiers: body.tiers.map((t) => ({
      name: t.name,
      pricePaise: rupeesToPaiseInt(t.priceRupees),
      perks: t.perks,
      backerLimit: t.backerLimit,
    })),
    milestones: body.milestones,
  });

  if (isOnchain) {
    try {
      await createCampaignOnchain(campaign.id);
    } catch (err) {
      // No escrow contract means no campaign: remove the draft records.
      await prisma.$transaction([
        prisma.campaignTier.deleteMany({ where: { campaignId: campaign.id } }),
        prisma.milestone.deleteMany({ where: { campaignId: campaign.id } }),
        prisma.campaign.delete({ where: { id: campaign.id } }),
      ]);
      throw err;
    }
  }
  return ok(toJSONSafe({ campaign }), 201);
});
