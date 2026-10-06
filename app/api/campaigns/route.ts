import { NextRequest } from "next/server";
import { requireCreator, ForbiddenError } from "@/lib/auth";
import { createCampaign } from "@/lib/ledger/campaigns";
import { campaignCreateSchema, rupeesToPaiseInt } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { VerificationStatus } from "@/lib/constants";

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

  return ok(toJSONSafe({ campaign }), 201);
});
