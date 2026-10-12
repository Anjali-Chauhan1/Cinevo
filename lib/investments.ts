import type { Address } from "viem";
import { prisma } from "@/lib/db";
import { BackingStatus, BackingType, LedgerTxType } from "@/lib/constants";
import { isOnchain, unitsToCents } from "@/lib/chain/config";
import { publicClient } from "@/lib/chain/server";
import { filmCampaignAbi } from "@/lib/chain/abis";

/**
 * Producer Unit revenue a holder could claim right now, in cents — the same
 * figure a claim would pay. Onchain mode reads the campaign contract; the
 * demo ledger uses the same accumulator maths as claimRevenue().
 */
export async function claimableRevenueCents(userId: string, campaignId: string): Promise<number> {
  const [holding, campaign, user] = await Promise.all([
    prisma.producerUnitHolding.findUnique({ where: { campaignId_userId: { campaignId, userId } } }),
    prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
  ]);
  if (!holding) return 0;

  if (isOnchain) {
    if (!campaign.contractAddress || !user.walletAddress) return 0;
    const units = await publicClient.readContract({
      address: campaign.contractAddress as Address,
      abi: filmCampaignAbi,
      functionName: "claimableRevenue",
      args: [user.walletAddress as Address],
    });
    return unitsToCents(units);
  }

  const deltaScaled = campaign.accRevenuePerUnitScaled - holding.lastClaimedAccRevenuePerUnitScaled;
  return Number((BigInt(holding.units) * deltaScaled) / 1_000_000n);
}

/** Everything the "Your investments" view shows, one entry per film. */
export async function listInvestments(userId: string) {
  const holdings = await prisma.producerUnitHolding.findMany({
    where: { userId },
    include: { campaign: { select: { id: true, filmTitle: true, status: true, creator: { select: { channelName: true } } } } },
    orderBy: { mintedAt: "desc" },
  });

  return Promise.all(
    holdings.map(async (h) => {
      const [invested, received, claimableCents] = await Promise.all([
        prisma.backing.aggregate({
          where: { userId, campaignId: h.campaignId, type: BackingType.PRODUCER_UNIT, status: BackingStatus.ACTIVE },
          _sum: { amountCents: true },
        }),
        prisma.ledgerTransaction.aggregate({
          where: {
            account: { userId },
            type: LedgerTxType.REVENUE_CLAIM_IN,
            refType: "CAMPAIGN",
            refId: h.campaignId,
          },
          _sum: { amountCents: true },
        }),
        // A chain read can fail (RPC hiccup); show the rest of the row anyway.
        claimableRevenueCents(userId, h.campaignId).catch(() => null),
      ]);
      return {
        campaignId: h.campaignId,
        filmTitle: h.campaign.filmTitle,
        channelName: h.campaign.creator.channelName,
        campaignStatus: h.campaign.status,
        units: h.units,
        investedCents: invested._sum.amountCents ?? 0,
        receivedCents: received._sum.amountCents ?? 0,
        claimableCents,
        lockUntil: h.lockUntil,
      };
    })
  );
}
