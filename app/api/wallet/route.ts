import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { getOrCreateLedgerAccountId } from "@/lib/ledger/core";

export const GET = withApiErrors(async () => {
  const user = await requireUser();
  const accountId = await getOrCreateLedgerAccountId(prisma, user.id);
  const account = await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });
  const transactions = await prisma.ledgerTransaction.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const activeSubscriptions = await prisma.subscription.findMany({
    where: { fanId: user.id, active: true },
    include: { creator: { select: { handle: true, channelName: true } } },
  });
  const backerPasses = await prisma.backerPass.findMany({
    where: { userId: user.id, revoked: false },
    include: { campaign: { select: { filmTitle: true } } },
  });

  return ok({ account, transactions, activeSubscriptions, backerPasses });
});
