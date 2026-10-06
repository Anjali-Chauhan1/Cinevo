import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";

export const DELETE = withApiErrors(async (_req: Request, { params }: { params: { userId: string } }) => {
  const { creator } = await requireCreator();
  const { userId } = params;
  await prisma.moderatorAssignment.deleteMany({ where: { creatorId: creator.id, userId } });
  return ok({ success: true });
});
