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
      idFingerprint: true,
      user: { select: { email: true, displayName: true, region: true } },
    },
  });
  // Previous rejections help the reviewer spot repeat attempts.
  const priorRejections = await prisma.kycSubmission.groupBy({
    by: ["userId"],
    where: { userId: { in: submissions.map((s) => s.userId) }, status: KycSubmissionStatus.REJECTED },
    _count: { _all: true },
  });
  // The same ID document seen on a different account (any outcome) — the
  // reviewer should know before approving.
  const fingerprints = submissions.map((s) => s.idFingerprint).filter((f): f is string => !!f);
  const sameIdRows = fingerprints.length
    ? await prisma.kycSubmission.findMany({
        where: { idFingerprint: { in: fingerprints } },
        select: { idFingerprint: true, userId: true },
      })
    : [];
  return ok({
    submissions: submissions.map(({ idFingerprint, ...s }) => ({
      ...s,
      priorRejections: priorRejections.find((r) => r.userId === s.userId)?._count._all ?? 0,
      sameIdOtherAccounts: new Set(
        sameIdRows.filter((r) => r.idFingerprint === idFingerprint && r.userId !== s.userId).map((r) => r.userId)
      ).size,
    })),
  });
});
