import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { ReportStatus } from "@/lib/constants";

const schema = z.object({ status: z.enum([ReportStatus.REVIEWED, ReportStatus.ACTIONED, ReportStatus.DISMISSED]) });

export const PATCH = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const { id } = params;
  const { status } = schema.parse(await req.json());
  const report = await prisma.report.update({ where: { id }, data: { status } });
  return ok({ report });
});
