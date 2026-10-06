import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { VerificationStatus } from "@/lib/constants";

export const POST = withApiErrors(async (_req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const { id } = params;
  const creator = await prisma.creator.update({
    where: { id },
    data: { verificationStatus: VerificationStatus.APPROVED, verificationNote: null },
  });
  return ok({ creator });
});
