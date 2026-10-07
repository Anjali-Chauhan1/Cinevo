import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { KycSubmissionStatus } from "@/lib/constants";

export const GET = withApiErrors(async () => {
  await requireAdmin();
  const submissions = await prisma.kycSubmission.findMany({
    where: { status: KycSubmissionStatus.PENDING },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      legalName: true,
      dateOfBirth: true,
      country: true,
      idType: true,
      idNumberLast4: true,
      createdAt: true,
      user: { select: { email: true, displayName: true, region: true } },
    },
  });
  // Previous rejections help the reviewer spot repeat attempts.
  const priorRejections = await prisma.kycSubmission.groupBy({
    by: ["userId"],
    where: { userId: { in: submissions.map((s) => s.userId) }, status: KycSubmissionStatus.REJECTED },
    _count: { _all: true },
  });
  return ok({
    submissions: submissions.map((s) => ({
      ...s,
      priorRejections: priorRejections.find((r) => r.userId === s.userId)?._count._all ?? 0,
    })),
  });
});
