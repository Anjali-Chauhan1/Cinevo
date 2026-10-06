import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { subscribe } from "@/lib/ledger/subscriptions";
import { ok, withApiErrors } from "@/lib/api";

const schema = z.object({ creatorId: z.string().min(1) });

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const { creatorId } = schema.parse(await req.json());
  const subscription = await subscribe(user.id, creatorId);
  return ok({ subscription });
});
