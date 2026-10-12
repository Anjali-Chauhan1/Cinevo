import { prisma } from "@/lib/db";
import { requireCreator, ForbiddenError } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";

export const DELETE = withApiErrors(async (_req: Request, { params }: { params: { id: string } }) => {
  const { creator } = await requireCreator();
  const emote = await prisma.emote.findUniqueOrThrow({ where: { id: params.id } });
  if (emote.creatorId !== creator.id) throw new ForbiddenError("That isn't your emote");
  await prisma.emote.delete({ where: { id: emote.id } });
  return ok({ deleted: true });
});
