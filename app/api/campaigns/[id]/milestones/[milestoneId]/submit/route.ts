import { NextRequest } from "next/server";
import { requireCreator } from "@/lib/auth";
import { submitMilestoneProof } from "@/lib/ledger/campaigns";
import { milestoneSubmitSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(
  async (req: NextRequest, { params }: { params: { id: string; milestoneId: string } }) => {
    const { creator } = await requireCreator();
    const { milestoneId } = params;
    const body = milestoneSubmitSchema.parse(await req.json());
    const milestone = await submitMilestoneProof(creator.id, milestoneId, body.proofUrl, body.proofNote);
    return ok({ milestone });
  }
);
