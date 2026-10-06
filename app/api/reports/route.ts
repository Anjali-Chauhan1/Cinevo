import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { reportSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const body = reportSchema.parse(await req.json());
  const report = await prisma.report.create({
    data: { targetType: body.targetType, targetId: body.targetId, reason: body.reason, reporterId: user.id },
  });
  return ok({ report }, 201);
});
