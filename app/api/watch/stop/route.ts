import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, ForbiddenError } from "@/lib/auth";
import { settleSession } from "@/lib/ledger/vault";
import { ok, withApiErrors } from "@/lib/api";

const schema = z.object({ sessionToken: z.string().min(1) });

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const { sessionToken } = schema.parse(await req.json());

  const session = await prisma.watchSession.findUnique({ where: { sessionToken } });
  if (!session || session.viewerId !== user.id) throw new ForbiddenError("Not your session");

  const settled = await settleSession(session.id, "VIEWER_STOP");
  return ok({ session: settled });
});
