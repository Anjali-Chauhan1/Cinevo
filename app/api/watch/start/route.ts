import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { startWatchSession } from "@/lib/ledger/vault";
import { ok, withApiErrors } from "@/lib/api";

const schema = z.object({ episodeId: z.string().min(1) });

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const { episodeId } = schema.parse(await req.json());
  const session = await startWatchSession(user.id, episodeId);
  return ok({ session });
});
