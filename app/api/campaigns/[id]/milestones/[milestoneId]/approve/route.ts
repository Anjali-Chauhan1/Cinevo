import { requireAdmin } from "@/lib/auth";
import { approveMilestone } from "@/lib/ledger/campaigns";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";

export const POST = withApiErrors(
  async (_req: Request, { params }: { params: { id: string; milestoneId: string } }) => {
    const admin = await requireAdmin();
    const { milestoneId } = params;
    const milestone = await approveMilestone(admin.id, milestoneId);
    return ok(toJSONSafe({ milestone }));
  }
);
