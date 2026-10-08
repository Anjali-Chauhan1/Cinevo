import { NextRequest } from "next/server";
import type { Hex } from "viem";
import { requireUser } from "@/lib/auth";
import { backCampaign } from "@/lib/ledger/campaigns";
import { backCampaignSchema, rupeesToPaiseInt, txHashSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { isOnchain } from "@/lib/chain/config";
import { confirmBacking } from "@/lib/chain/confirm";

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const { id } = params;
  if (isOnchain) {
    // The backer's wallet already sent vault.backCampaign / vault.buyUnits.
    const { txHash } = txHashSchema.parse(await req.json());
    return ok(toJSONSafe({ backing: await confirmBacking(user.id, id, txHash as Hex) }), 201);
  }
  const body = backCampaignSchema.parse(await req.json());
  const input =
    body.type === "PERK"
      ? { type: "PERK" as const, tierId: body.tierId, riskAcknowledged: body.riskAcknowledged }
      : {
          type: "PRODUCER_UNIT" as const,
          amountPaise: rupeesToPaiseInt(body.amountRupees),
          riskAcknowledged: body.riskAcknowledged,
        };
  const backing = await backCampaign(user.id, id, input);
  return ok(toJSONSafe({ backing }), 201);
});
