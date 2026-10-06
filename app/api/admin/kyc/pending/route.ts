import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { KycStatus } from "@/lib/constants";

export const GET = withApiErrors(async () => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    where: { kycStatus: KycStatus.PENDING },
    select: { id: true, email: true, displayName: true, region: true, createdAt: true },
  });
  return ok({ users });
});
