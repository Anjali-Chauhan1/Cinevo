import { prisma } from "@/lib/db";
import { BackingStatus, LedgerTxType } from "@/lib/constants";

/** Ledger credit types that count as creator income, and how to label them. */
export const INCOME_SOURCES = [
  { type: LedgerTxType.VOUCHER_SETTLE, key: "payPerMinute", label: "Pay-per-minute" },
  { type: LedgerTxType.TIP_IN, key: "tips", label: "Tips" },
  { type: LedgerTxType.SUB_STREAM_IN, key: "subscriptions", label: "Subscriptions" },
  { type: LedgerTxType.MILESTONE_RELEASE_IN, key: "backing", label: "Film backing" },
] as const;

type SourceKey = (typeof INCOME_SOURCES)[number]["key"];
const INCOME_TYPES: string[] = INCOME_SOURCES.map((s) => s.type);
const DAY_MS = 86_400_000;

/**
 * Everything the studio earnings panel shows. Income figures are what landed
 * in the creator's balance (after the platform fee); supporter figures are
 * what each fan paid in total.
 */
export async function getCreatorEarnings(creatorId: string, userId: string) {
  const account = await prisma.ledgerAccount.findUnique({ where: { userId } });
  const since30 = new Date(Date.now() - 30 * DAY_MS);

  const income = account
    ? await prisma.ledgerTransaction.findMany({
        where: { accountId: account.id, type: { in: INCOME_TYPES }, amountCents: { gt: 0 } },
        select: { type: true, amountCents: true, createdAt: true, refType: true, refId: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const empty = () => Object.fromEntries(INCOME_SOURCES.map((s) => [s.key, 0])) as Record<SourceKey, number>;
  const allTime = empty();
  const last30 = empty();
  const keyOf = (type: string) => INCOME_SOURCES.find((s) => s.type === type)!.key;
  // One bucket per day for the last 30 days, oldest first.
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * DAY_MS);
    return { date: day.toISOString().slice(0, 10), totalCents: 0 };
  });
  for (const tx of income) {
    const key = keyOf(tx.type);
    allTime[key] += tx.amountCents;
    if (tx.createdAt >= since30) {
      last30[key] += tx.amountCents;
      const bucket = daily.find((d) => d.date === tx.createdAt.toISOString().slice(0, 10));
      if (bucket) bucket.totalCents += tx.amountCents;
    }
  }

  const [episodes, subscriptions, campaigns] = await Promise.all([
    prisma.episode.findMany({ where: { creatorId }, select: { id: true, title: true } }),
    prisma.subscription.findMany({ where: { creatorId }, select: { id: true, fanId: true, active: true } }),
    prisma.campaign.findMany({ where: { creatorId }, select: { id: true } }),
  ]);
  const episodeIds = episodes.map((e) => e.id);

  // What each fan has paid this creator, across every way to support them.
  const [tips, sessions, subPayments, backings, viewerGroups] = await Promise.all([
    prisma.tip.groupBy({ by: ["fanId"], where: { creatorId }, _sum: { amountCents: true } }),
    prisma.watchSession.groupBy({
      by: ["viewerId"],
      where: { episodeId: { in: episodeIds }, settledAmountCents: { gt: 0 } },
      _sum: { settledAmountCents: true },
    }),
    prisma.ledgerTransaction.findMany({
      where: { type: LedgerTxType.SUB_STREAM_OUT, refType: "SUBSCRIPTION", refId: { in: subscriptions.map((s) => s.id) } },
      select: { amountCents: true, refId: true },
    }),
    prisma.backing.groupBy({
      by: ["userId"],
      where: { campaignId: { in: campaigns.map((c) => c.id) }, status: BackingStatus.ACTIVE },
      _sum: { amountCents: true },
    }),
    prisma.watchSession.groupBy({ by: ["viewerId"], where: { episodeId: { in: episodeIds } } }),
  ]);

  const supporters = new Map<string, { tips: number; payPerMinute: number; subscriptions: number; backing: number }>();
  const add = (fanId: string, key: "tips" | "payPerMinute" | "subscriptions" | "backing", amount: number) => {
    const entry = supporters.get(fanId) ?? { tips: 0, payPerMinute: 0, subscriptions: 0, backing: 0 };
    entry[key] += amount;
    supporters.set(fanId, entry);
  };
  for (const t of tips) add(t.fanId, "tips", t._sum.amountCents ?? 0);
  for (const s of sessions) add(s.viewerId, "payPerMinute", s._sum.settledAmountCents ?? 0);
  const fanOfSubscription = new Map(subscriptions.map((s) => [s.id, s.fanId]));
  for (const p of subPayments) {
    const fanId = fanOfSubscription.get(p.refId!);
    if (fanId) add(fanId, "subscriptions", Math.abs(p.amountCents)); // debits are stored negative
  }
  for (const b of backings) add(b.userId, "backing", b._sum.amountCents ?? 0);

  const ranked = [...supporters.entries()]
    .map(([fanId, parts]) => ({ fanId, ...parts, totalCents: parts.tips + parts.payPerMinute + parts.subscriptions + parts.backing }))
    .filter((s) => s.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 10);
  const names = await prisma.user.findMany({
    where: { id: { in: ranked.map((r) => r.fanId) } },
    select: { id: true, displayName: true },
  });
  const topSupporters = ranked.map((r) => ({
    ...r,
    displayName: names.find((n) => n.id === r.fanId)?.displayName ?? "A supporter",
  }));

  const episodeTitle = new Map(episodes.map((e) => [e.id, e.title]));
  const recent = income.slice(0, 10).map((tx) => ({
    label: INCOME_SOURCES.find((s) => s.type === tx.type)!.label,
    detail: tx.refType === "EPISODE" ? episodeTitle.get(tx.refId ?? "") ?? null : null,
    amountCents: tx.amountCents,
    createdAt: tx.createdAt,
  }));

  const sum = (r: Record<SourceKey, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  return {
    sources: INCOME_SOURCES.map((s) => ({ key: s.key, label: s.label, last30Cents: last30[s.key], allTimeCents: allTime[s.key] })),
    totals: { last30Cents: sum(last30), allTimeCents: sum(allTime) },
    daily,
    topSupporters,
    recent,
    stats: {
      activeSubscribers: subscriptions.filter((s) => s.active).length,
      uniqueViewers: viewerGroups.length,
      balanceCents: account?.balanceCents ?? 0,
    },
  };
}
