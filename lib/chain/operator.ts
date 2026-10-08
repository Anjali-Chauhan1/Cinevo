import { decodeEventLog, encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";
import { prisma } from "@/lib/db";
import { CampaignStatus, LedgerTxType, PRODUCER_UNITS } from "@/lib/constants";
import { getAddresses, paiseToUnits, toChainId, unitsToPaise } from "@/lib/chain/config";
import { ChainError, eventsFrom, operatorWrite, publicClient } from "@/lib/chain/server";
import { mirror } from "@/lib/chain/mirror";
import {
  campaignFactoryAbi,
  filmCampaignAbi,
  registryAbi,
  subscriptionsAbi,
  vaultAbi,
} from "@/lib/chain/abis";

/**
 * What the Cinova server does onchain with its operator account, on behalf
 * of creators (publishing setup they did in the app), admins (verifications,
 * milestone releases) and viewers (settling their signed vouchers, top-ups).
 * None of these can move a user's money without that user's signature.
 */

const wallet = (address: string | null | undefined, who: string): Address => {
  if (!address) throw new ChainError(`${who} has no wallet yet — they need to sign in once with the onchain login`);
  return address as Address;
};

// ---------------------------------------------------------------------------
// Creators
// ---------------------------------------------------------------------------

/** On admin approval: register the creator and their subscription price. */
export async function registerCreatorOnchain(creatorId: string) {
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, include: { user: true } });
  const address = wallet(creator.user.walletAddress, "This creator");
  const { registry } = getAddresses();
  const already = await publicClient.readContract({ address: registry, abi: registryAbi, functionName: "isCreator", args: [address] });
  if (!already) {
    await operatorWrite({ address: registry, abi: registryAbi, functionName: "registerCreator", args: [address] });
  }
  await setSubscriptionPriceOnchain(creatorId);
  await prisma.creator.update({ where: { id: creatorId }, data: { chainRegisteredAt: new Date() } });
}

export async function setSubscriptionPriceOnchain(creatorId: string) {
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, include: { user: true } });
  const address = wallet(creator.user.walletAddress, "This creator");
  const { subscriptions } = getAddresses();
  await operatorWrite({
    address: subscriptions,
    abi: subscriptionsAbi,
    functionName: "setMonthlyPriceFor",
    args: [address, paiseToUnits(creator.subPriceRupeesPaise)],
  });
}

// ---------------------------------------------------------------------------
// Episodes
// ---------------------------------------------------------------------------

/** Registers an episode (or updates its pricing) so vouchers can settle against it. */
export async function syncEpisodeOnchain(episodeId: string) {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId }, include: { creator: { include: { user: true } } } });
  const creatorWallet = wallet(episode.creator.user.walletAddress, "The episode's creator");
  const { registry } = getAddresses();
  const key = toChainId(episode.id);
  const rate = episode.isPaid ? paiseToUnits(episode.rateRupeesPaise) : 0n;
  const cap = episode.isPaid ? paiseToUnits(episode.capRupeesPaise) : 0n;
  const current = await publicClient.readContract({ address: registry, abi: registryAbi, functionName: "getEpisode", args: [key] });

  if (!current.exists) {
    await operatorWrite({
      address: registry,
      abi: registryAbi,
      functionName: "registerEpisodeFor",
      args: [creatorWallet, key, rate, episode.previewSeconds, cap, episode.isPaid],
    });
  } else if (
    current.isPaid !== episode.isPaid ||
    current.ratePerMinute !== rate ||
    current.cap !== cap ||
    current.previewSeconds !== episode.previewSeconds
  ) {
    await operatorWrite({
      address: registry,
      abi: registryAbi,
      functionName: "setPricingFor",
      args: [key, rate, episode.previewSeconds, cap, episode.isPaid],
    });
  }
  await prisma.episode.update({ where: { id: episode.id }, data: { chainSyncedAt: new Date() } });
}

/** Points an episode's revenue at a campaign's waterfall (or clears it). */
export async function setEpisodeRevenueRecipientOnchain(episodeId: string, campaignId: string | null) {
  const { registry } = getAddresses();
  let recipient: Address = "0x0000000000000000000000000000000000000000";
  if (campaignId) {
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    recipient = wallet(campaign.contractAddress, "This campaign") as Address;
  }
  await syncEpisodeOnchain(episodeId); // must exist onchain first
  await operatorWrite({
    address: registry,
    abi: registryAbi,
    functionName: "setRevenueRecipientFor",
    args: [toChainId(episodeId), recipient],
  });
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

/** Deploys the campaign's FilmCampaign escrow and stores its address. */
export async function createCampaignOnchain(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { creator: { include: { user: true } }, tiers: { orderBy: CHAIN_TIER_ORDER }, milestones: { orderBy: { order: "asc" } } },
  });
  const creatorWallet = wallet(campaign.creator.user.walletAddress, "This creator");
  const { campaignFactory } = getAddresses();
  const unitPrice = paiseToUnits(PRODUCER_UNITS.UNIT_PRICE_PAISE);
  const receipt = await operatorWrite({
    address: campaignFactory,
    abi: campaignFactoryAbi,
    functionName: "createCampaignFor",
    args: [
      creatorWallet,
      {
        goal: paiseToUnits(campaign.goalPaise),
        deadline: BigInt(Math.floor(campaign.deadline.getTime() / 1000)),
        deliveryDate: BigInt(Math.floor(campaign.deliveryDate.getTime() / 1000)),
        tierPrices: campaign.tiers.map((t) => paiseToUnits(t.pricePaise)),
        tierLimits: campaign.tiers.map((t) => t.backerLimit ?? 0),
        milestoneBps: campaign.milestones.map((m) => m.percentOfGoal * 100),
        unitsEnabled: campaign.producerUnitsEnabled,
        unitPrice,
        maxUnitSpendPerBacker: paiseToUnits(PRODUCER_UNITS.MAX_PAISE_PER_PERSON_PER_FILM),
        unitHardCap: 0n,
      },
    ],
  });
  const [created] = eventsFrom(receipt, campaignFactoryAbi, campaignFactory).filter((e) => e.eventName === "CampaignCreated");
  if (!created) throw new ChainError("Campaign was created but its address wasn't found in the receipt");
  const contractAddress = (created.args as { campaign: Address }).campaign.toLowerCase();
  await prisma.campaign.update({ where: { id: campaignId }, data: { contractAddress } });
  return contractAddress;
}

/** Tiers go onchain sorted by price, ties broken by id, so every part of the
 * app agrees which onchain tier index a database tier is. */
export const CHAIN_TIER_ORDER: { pricePaise?: "asc"; id?: "asc" }[] = [{ pricePaise: "asc" }, { id: "asc" }];

/** Onchain tier index for a DB tier. */
export async function tierIndexOf(campaignId: string, tierId: string): Promise<number> {
  const tiers = await prisma.campaignTier.findMany({ where: { campaignId }, orderBy: CHAIN_TIER_ORDER });
  const index = tiers.findIndex((t) => t.id === tierId);
  if (index < 0) throw new ChainError("Unknown tier");
  return index;
}

const proofHash = (proofUrl: string | null, note: string | null): Hex =>
  keccak256(toBytes(`${proofUrl ?? ""}\n${note ?? ""}`));

export async function submitMilestoneProofOnchain(milestoneId: string) {
  const milestone = await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { campaign: true } });
  const address = wallet(milestone.campaign.contractAddress, "This campaign") as Address;
  await operatorWrite({
    address,
    abi: filmCampaignAbi,
    functionName: "submitMilestoneProof",
    args: [milestone.order - 1, proofHash(milestone.proofUrl, milestone.proofNote)],
  });
}

export async function rejectMilestoneOnchain(milestoneId: string, reason: string) {
  const milestone = await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { campaign: true } });
  const address = wallet(milestone.campaign.contractAddress, "This campaign") as Address;
  await operatorWrite({
    address,
    abi: filmCampaignAbi,
    functionName: "rejectMilestoneProof",
    args: [milestone.order - 1, keccak256(toBytes(reason))],
  });
}

/**
 * Releases a milestone onchain and returns what the creator received (in
 * paise), mirrored into the creator's ledger history.
 */
export async function releaseMilestoneOnchain(milestoneId: string): Promise<{ amountPaise: number; netPaise: number; txHash: string }> {
  const milestone = await prisma.milestone.findUniqueOrThrow({
    where: { id: milestoneId },
    include: { campaign: { include: { creator: true } } },
  });
  const address = wallet(milestone.campaign.contractAddress, "This campaign") as Address;
  const receipt = await operatorWrite({
    address,
    abi: filmCampaignAbi,
    functionName: "releaseMilestone",
    args: [milestone.order - 1],
  });
  const event = eventsFrom(receipt, filmCampaignAbi, address).find((e) => e.eventName === "MilestoneReleased");
  const args = (event?.args ?? {}) as { amount?: bigint; toCreator?: bigint };
  const amountPaise = unitsToPaise(args.amount ?? 0n);
  const netPaise = unitsToPaise(args.toCreator ?? 0n);
  await mirror({
    userId: milestone.campaign.creator.userId,
    type: LedgerTxType.MILESTONE_RELEASE_IN,
    amountPaise: netPaise,
    txHash: receipt.transactionHash,
    refType: "MILESTONE",
    refId: milestone.id,
  });
  return { amountPaise, netPaise, txHash: receipt.transactionHash };
}

/** Applies a deadline/delivery-date transition onchain and returns the onchain state. */
export async function syncCampaignStateOnchain(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (!campaign.contractAddress) return null;
  const address = campaign.contractAddress as Address;
  const [current, written] = await Promise.all([
    publicClient.readContract({ address, abi: filmCampaignAbi, functionName: "currentState" }),
    publicClient.readContract({ address, abi: filmCampaignAbi, functionName: "state" }),
  ]);
  if (current !== written) await operatorWrite({ address, abi: filmCampaignAbi, functionName: "syncState", args: [] });
  return current; // 0 Active, 1 Funded, 2 Delivered, 3 Failed
}

export const ONCHAIN_STATE_TO_STATUS = [
  CampaignStatus.ACTIVE,
  CampaignStatus.FUNDED_PRODUCING,
  CampaignStatus.DELIVERED,
  CampaignStatus.FAILED_REFUNDING,
];

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

/** Producer Units are only for verified people in permitted regions. */
export async function setInvestorVerifiedOnchain(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.walletAddress) return;
  const eligible = user.kycStatus === "VERIFIED" && PRODUCER_UNITS.PERMITTED_REGIONS.includes(user.region);
  const { registry } = getAddresses();
  const current = await publicClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "isVerifiedInvestor",
    args: [user.walletAddress as Address],
  });
  if (current === eligible) return;
  await operatorWrite({
    address: registry,
    abi: registryAbi,
    functionName: "setInvestorVerified",
    args: [user.walletAddress as Address, eligible],
  });
}

// ---------------------------------------------------------------------------
// Money in: the testnet faucet (stands in for a card on-ramp)
// ---------------------------------------------------------------------------

export async function faucetTopUp(userId: string, amountPaise: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const address = wallet(user.walletAddress, "You");
  const receipt = await operatorWrite({
    address: getAddresses().vault,
    abi: vaultAbi,
    functionName: "depositFor",
    args: [address, paiseToUnits(amountPaise)],
  });
  await mirror({ userId, type: LedgerTxType.DEPOSIT, amountPaise, txHash: receipt.transactionHash, meta: { source: "testnet faucet" } });
  return receipt.transactionHash;
}

// ---------------------------------------------------------------------------
// Pay-per-minute settlement
// ---------------------------------------------------------------------------

/**
 * Submits the session's latest signed voucher to CinovaVault. Returns what
 * was actually charged (in paise) and the tx hash, or null if there was
 * nothing signed to settle.
 */
export async function settleVoucherOnchain(sessionId: string) {
  const session = await prisma.watchSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { viewer: true, episode: { include: { creator: true } } },
  });
  if (!session.voucherSignature || !session.voucherUnits || !session.voucherExpiry) return null;
  const vault = getAddresses().vault;
  const voucher = {
    viewer: wallet(session.viewer.walletAddress, "The viewer"),
    episodeId: toChainId(session.episodeId),
    sessionId: toChainId(session.sessionToken),
    cumulativeAmount: BigInt(session.voucherUnits),
    expiry: BigInt(session.voucherExpiry),
  };
  // Already settled up to this voucher (e.g. a retry after a crash)?
  // Same key as CinovaVault: keccak256(abi.encode(viewer, episodeId, sessionId)).
  const key = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }], [voucher.viewer, voucher.episodeId, voucher.sessionId])
  );
  const settled = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "sessionSettled", args: [key] });
  if (settled >= voucher.cumulativeAmount) return { paidPaise: 0, txHash: null as string | null };

  const receipt = await operatorWrite({
    address: vault,
    abi: vaultAbi,
    functionName: "settle",
    args: [voucher, session.voucherSignature as Hex],
  });
  const event = eventsFrom(receipt, vaultAbi, vault).find((e) => e.eventName === "Settled");
  const args = (event?.args ?? {}) as { amount?: bigint; toCreator?: bigint };
  const paidPaise = unitsToPaise(args.amount ?? 0n);
  const toCreatorPaise = unitsToPaise(args.toCreator ?? 0n);
  await mirror({
    userId: session.viewerId,
    type: LedgerTxType.VOUCHER_SETTLE,
    amountPaise: -paidPaise,
    txHash: receipt.transactionHash,
    refType: "EPISODE",
    refId: session.episodeId,
    meta: { sessionId: session.id },
  });
  await mirror({
    userId: session.episode.creator.userId,
    type: LedgerTxType.VOUCHER_SETTLE,
    amountPaise: toCreatorPaise,
    txHash: receipt.transactionHash,
    refType: "EPISODE",
    refId: session.episodeId,
  });
  return { paidPaise, txHash: receipt.transactionHash as string };
}

// ---------------------------------------------------------------------------
// Subscriptions: charging what has accrued
// ---------------------------------------------------------------------------

/**
 * Charges accrued subscription time onchain (callable for anyone) and
 * mirrors it. Returns whether the subscription is still active afterwards.
 */
export async function claimSubscriptionOnchain(subscriptionId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { fan: true, creator: { include: { user: true } } },
  });
  const fan = wallet(sub.fan.walletAddress, "The subscriber");
  const creator = wallet(sub.creator.user.walletAddress, "The creator");
  const { subscriptions } = getAddresses();
  const receipt = await operatorWrite({
    address: subscriptions,
    abi: subscriptionsAbi,
    functionName: "claimAccrued",
    args: [fan, creator],
  });
  await mirrorSubscriptionCharges(receipt.transactionHash, receipt.logs, sub.id);
  const active = await publicClient.readContract({ address: subscriptions, abi: subscriptionsAbi, functionName: "isActive", args: [fan, creator] });
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { lastAccruedAt: new Date(), active, pausedForLowBalance: !active && sub.active },
  });
  return active;
}

/** Mirrors every subscription Charged event in a receipt (from a claim, cancel, ...). */
export async function mirrorSubscriptionCharges(txHash: string, logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[], subscriptionId: string) {
  const { subscriptions } = getAddresses();
  for (const log of logs) {
    if (log.address.toLowerCase() !== subscriptions.toLowerCase()) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: subscriptionsAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    } catch {
      continue;
    }
    if (decoded.eventName !== "Charged") continue;
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { creator: true } });
    const { amount, toCreator } = decoded.args as { amount: bigint; toCreator: bigint };
    await mirror({ userId: sub.fanId, type: LedgerTxType.SUB_STREAM_OUT, amountPaise: -unitsToPaise(amount), txHash, refType: "SUBSCRIPTION", refId: sub.id });
    await mirror({ userId: sub.creator.userId, type: LedgerTxType.SUB_STREAM_IN, amountPaise: unitsToPaise(toCreator), txHash, refType: "SUBSCRIPTION", refId: sub.id });
  }
}
