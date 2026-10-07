import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { rejectKyc } from "@/lib/kyc";

// The reason is shown to the user on /verify so they know what to fix.
const schema = z.object({ reason: z.string().trim().min(5, "Give the user a reason they can act on").max(300) });

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { userId: string } }) => {
  const admin = await requireAdmin();
  const { reason } = schema.parse(await req.json());
  const user = await rejectKyc(admin.id, params.userId, reason);
  return ok({ user: { id: user.id, kycStatus: user.kycStatus } });
});
