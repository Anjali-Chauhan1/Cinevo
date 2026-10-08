import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";

// No ids = mark everything read.
const schema = z.object({ ids: z.array(z.string()).max(100).optional() });

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const { ids } = schema.parse(await req.json().catch(() => ({})));
  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return ok({ marked: count });
});
