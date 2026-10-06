import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { ReportStatus } from "@/lib/constants";

export const GET = withApiErrors(async () => {
  await requireAdmin();
  const reports = await prisma.report.findMany({
    where: { status: ReportStatus.OPEN },
    include: { reporter: { select: { displayName: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok({ reports });
});
