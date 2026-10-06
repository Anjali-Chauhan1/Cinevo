import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { rejectMilestone } from "@/lib/ledger/campaigns";
import { ok, withApiErrors } from "@/lib/api";

const schema = z.object({ reason: z.string().min(3).max(500) });

export const POST = withApiErrors(
  async (req: NextRequest, { params }: { params: { id: string; milestoneId: string } }) => {
    const admin = await requireAdmin();
    const { milestoneId } = params;
    const { reason } = schema.parse(await req.json());
    const milestone = await rejectMilestone(admin.id, milestoneId, reason);
    return ok({ milestone });
  }
);
