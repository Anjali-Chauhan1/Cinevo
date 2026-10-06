import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { deleteMessage, timeoutUser, banUser, setSlowMode } from "@/lib/chat";
import { ok, withApiErrors } from "@/lib/api";

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

  switch (body.action) {
    case "DELETE":
      return ok({ message: await deleteMessage(user.id, body.messageId, body.reason) });
    case "TIMEOUT":
      return ok({ action: await timeoutUser(user.id, id, body.targetUserId, body.minutes, body.reason) });
    case "BAN":
      return ok({ action: await banUser(user.id, id, body.targetUserId, body.reason) });
    case "SLOW_MODE":
      await setSlowMode(user.id, id, body.seconds);
      return ok({ success: true });
  }
});
