import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { KycStatus } from "@/lib/constants";

export const POST = withApiErrors(async (_req: Request, { params }: { params: { userId: string } }) => {
  await requireAdmin();
  const { userId } = params;
  const user = await prisma.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.REJECTED } });
  return ok({ user: { id: user.id, kycStatus: user.kycStatus } });
});
