import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { backCampaign } from "@/lib/ledger/campaigns";
import { backCampaignSchema, rupeesToPaiseInt } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const { id } = params;
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
