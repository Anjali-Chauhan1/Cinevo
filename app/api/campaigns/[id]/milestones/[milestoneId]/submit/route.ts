import { NextRequest } from "next/server";
import { requireCreator } from "@/lib/auth";
import { submitMilestoneProof } from "@/lib/ledger/campaigns";
import { milestoneSubmitSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { prisma } from "@/lib/db";
import { MilestoneStatus } from "@/lib/constants";
import { isOnchain } from "@/lib/chain/config";
import { submitMilestoneProofOnchain } from "@/lib/chain/operator";

export const POST = withApiErrors(
  async (req: NextRequest, { params }: { params: { id: string; milestoneId: string } }) => {
    const { creator } = await requireCreator();
    const { milestoneId } = params;
    const body = milestoneSubmitSchema.parse(await req.json());
    const before = await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId } });
    const milestone = await submitMilestoneProof(creator.id, milestoneId, body.proofUrl, body.proofNote);
    if (isOnchain) {
      try {
        await submitMilestoneProofOnchain(milestoneId);
      } catch (err) {
        await prisma.milestone.update({ where: { id: milestoneId }, data: { status: before.status ?? MilestoneStatus.PENDING } });
        throw err;
      }
    }
    return ok({ milestone });
  }
);
