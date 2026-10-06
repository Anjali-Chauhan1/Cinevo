import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { VerificationStatus } from "@/lib/constants";

export const GET = withApiErrors(async () => {
  await requireAdmin();
  const creators = await prisma.creator.findMany({
    where: { verificationStatus: VerificationStatus.PENDING },
    include: { user: { select: { email: true, displayName: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  return ok({ creators });
});
