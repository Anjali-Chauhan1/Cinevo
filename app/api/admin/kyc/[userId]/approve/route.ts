import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { approveKyc } from "@/lib/kyc";

export const POST = withApiErrors(async (_req: Request, { params }: { params: { userId: string } }) => {
  const admin = await requireAdmin();
  const user = await approveKyc(admin.id, params.userId);
  return ok({ user: { id: user.id, kycStatus: user.kycStatus, region: user.region } });
});
