import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { PRODUCER_UNITS, KycStatus, BackingStatus } from "@/lib/constants";
import { CHAIN_TIER_ORDER } from "@/lib/chain/operator";
import { isOnchain } from "@/lib/chain/config";

export const GET = withApiErrors(async (_req: Request, { params }: { params: { id: string } }) => {
  const { id } = params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      tiers: { orderBy: CHAIN_TIER_ORDER },
      milestones: { orderBy: { order: "asc" } },
      creator: { select: { id: true, handle: true, channelName: true, userId: true, user: { select: { walletAddress: true } } } },
    },
  });
  if (!campaign) return ok({ error: "Campaign not found" }, 404);

  const backerCount = await prisma.backing.count({ where: { campaignId: id, status: BackingStatus.ACTIVE } });

  const viewer = await getCurrentUser();
  let viewerState: Record<string, unknown> = { signedIn: false };
  if (viewer) {
    const myBackings = await prisma.backing.findMany({ where: { campaignId: id, userId: viewer.id } });
    const myHolding = await prisma.producerUnitHolding.findUnique({
      where: { campaignId_userId: { campaignId: id, userId: viewer.id } },
    });

    // Server-side gate, not just a UI toggle: Producer Units are only ever
    // described as available if region + KYC actually clear.
    const producerUnitsAvailableToViewer =
      campaign.producerUnitsEnabled &&
      PRODUCER_UNITS.PERMITTED_REGIONS.includes(viewer.region) &&
      viewer.kycStatus === KycStatus.VERIFIED;

    viewerState = {
      signedIn: true,
      isOwner: viewer.id === campaign.creator.userId,
      myBackings,
      myUnits: myHolding?.units ?? 0,
      producerUnitsAvailableToViewer,
      kycStatus: viewer.kycStatus,
      region: viewer.region,
    };
  }

  return ok(
    toJSONSafe({
      // Tiers come in onchain order: a tier's position is its onchain index.
      campaign: { ...campaign, tiers: campaign.tiers.map((t, chainIndex) => ({ ...t, chainIndex })) },
      onchain: isOnchain ? { contractAddress: campaign.contractAddress } : null,
      backerCount,
      unitEconomics: campaign.producerUnitsEnabled
        ? {
            unitPricePaise: PRODUCER_UNITS.UNIT_PRICE_PAISE,
            maxPaisePerPerson: PRODUCER_UNITS.MAX_PAISE_PER_PERSON_PER_FILM,
            lockUpMonths: PRODUCER_UNITS.LOCK_UP_MONTHS,
            permittedRegions: PRODUCER_UNITS.PERMITTED_REGIONS,
          }
        : null,
      viewerState,
    })
  );
});
