import { prisma } from "@/lib/db";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";

export const GET = withApiErrors(async (_req: Request, { params }: { params: { id: string } }) => {
  const { id } = params;
  const messages = await prisma.chatMessage.findMany({
    where: { episodeId: id, deleted: false },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok(toJSONSafe({ messages: messages.reverse() }));
});
