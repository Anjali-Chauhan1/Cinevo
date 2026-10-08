import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { approveKyc } from "@/lib/kyc";
import { notify } from "@/lib/notifications";
import { NotificationType } from "@/lib/constants";
import { isOnchain } from "@/lib/chain/config";
import { setInvestorVerifiedOnchain } from "@/lib/chain/operator";

export const POST = withApiErrors(async (_req: Request, { params }: { params: { userId: string } }) => {
  const admin = await requireAdmin();
  const user = await approveKyc(admin.id, params.userId);
  // Producer Units onchain check the KYC partner's allowlist (permitted regions only).
  if (isOnchain) await setInvestorVerifiedOnchain(user.id);
  await notify(user.id, {
    type: NotificationType.KYC_APPROVED,
    title: "Your identity is verified",
    link: "/verify",
  });
  return ok({ user: { id: user.id, kycStatus: user.kycStatus, region: user.region } });
});
