import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { KycStatus, PRODUCER_UNITS } from "@/lib/constants";

/**
 * Demo stand-in for handing off to a licensed KYC partner. Real identity
 * verification never happens here — this just opens a PENDING request for
 * an admin to approve, the same two-step pattern as creator verification,
 * so "KYC-gated" stays server-enforced rather than a client-side toggle.
 */
export const POST = withApiErrors(async () => {
  const user = await requireUser();
  if (!PRODUCER_UNITS.PERMITTED_REGIONS.includes(user.region)) {
    return ok({ error: "Producer Units (and their KYC requirement) aren't offered in your region yet" }, 400);
  }
  if (user.kycStatus === KycStatus.VERIFIED) return ok({ error: "You're already verified" }, 400);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { kycStatus: KycStatus.PENDING },
  });
  return ok({ user: { kycStatus: updated.kycStatus } });
});
