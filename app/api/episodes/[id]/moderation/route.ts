import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { deleteMessage, timeoutUser, banUser, setSlowMode } from "@/lib/chat";
import { ok, withApiErrors } from "@/lib/api";
import { prisma } from "@/lib/db";
import { emitToEpisode } from "@/lib/realtime";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("DELETE"), messageId: z.string().min(1), reason: z.string().optional() }),
  z.object({
    action: z.literal("TIMEOUT"),
    targetUserId: z.string().min(1),
    minutes: z.number().int().min(1).max(1440),
    reason: z.string().optional(),
  }),
  z.object({ action: z.literal("BAN"), targetUserId: z.string().min(1), reason: z.string().optional() }),
  z.object({ action: z.literal("SLOW_MODE"), seconds: z.number().int().min(0).max(120) }),
]);

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const { id } = params;
  const body = schema.parse(await req.json());

  // Every action is pushed to the premiere room so all viewers see it at once.
  switch (body.action) {
    case "DELETE": {
      const message = await deleteMessage(user.id, body.messageId, body.reason);
      await emitToEpisode(id, "message_deleted", { messageId: message.id });
      return ok({ message });
    }
    case "TIMEOUT":
    case "BAN": {
      const result =
        body.action === "TIMEOUT"
          ? await timeoutUser(user.id, id, body.targetUserId, body.minutes, body.reason)
          : await banUser(user.id, id, body.targetUserId, body.reason);
      const target = await prisma.user.findUnique({ where: { id: body.targetUserId }, select: { displayName: true } });
      await emitToEpisode(id, "user_moderated", {
        userId: body.targetUserId,
        displayName: target?.displayName ?? "A viewer",
        action: body.action,
        minutes: body.action === "TIMEOUT" ? body.minutes : null,
        clearedMessageIds: result.clearedMessageIds,
      });
      return ok({ action: result.action });
    }
    case "SLOW_MODE":
      await setSlowMode(user.id, id, body.seconds);
      await emitToEpisode(id, "slow_mode", { seconds: body.seconds });
      return ok({ success: true });
  }
});
