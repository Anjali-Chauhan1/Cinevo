import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { NotificationType, VerificationStatus } from "@/lib/constants";
import { notify } from "@/lib/notifications";
import { isOnchain } from "@/lib/chain/config";
import { registerCreatorOnchain } from "@/lib/chain/operator";

export const POST = withApiErrors(async (_req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const { id } = params;
  // Onchain first: if registering fails, the channel stays pending.
  if (isOnchain) await registerCreatorOnchain(id);
  const creator = await prisma.creator.update({
    where: { id },
    data: { verificationStatus: VerificationStatus.APPROVED, verificationNote: null },
  });
  await notify(creator.userId, {
    type: NotificationType.CREATOR_APPROVED,
    title: "Your channel is verified",
    body: "You can now publish episodes and run campaigns.",
    link: "/studio",
  });
  return ok({ creator });
});
