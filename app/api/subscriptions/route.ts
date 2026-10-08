import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { subscribe } from "@/lib/ledger/subscriptions";
import { ok, withApiErrors } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { NotificationType } from "@/lib/constants";
import type { Hex } from "viem";
import { isOnchain } from "@/lib/chain/config";
import { confirmSubscribe } from "@/lib/chain/confirm";

const schema = z.object({ creatorId: z.string().min(1), txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional() });

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const { creatorId, txHash } = schema.parse(await req.json());
  if (isOnchain && !txHash) return ok({ error: "Missing transaction hash" }, 400);
  const subscription = isOnchain ? await confirmSubscribe(user.id, creatorId, txHash as Hex) : await subscribe(user.id, creatorId);
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  await notify(creator.userId, {
    type: NotificationType.NEW_SUBSCRIBER,
    title: `${user.displayName} subscribed to your channel`,
    link: "/studio",
  });
  return ok({ subscription });
});
