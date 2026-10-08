import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { NotificationType, VerificationStatus } from "@/lib/constants";
import { notify } from "@/lib/notifications";

const schema = z.object({ note: z.string().max(500).optional() });

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const { id } = params;
  const { note } = schema.parse(await req.json().catch(() => ({})));
  const creator = await prisma.creator.update({
    where: { id },
    data: { verificationStatus: VerificationStatus.REJECTED, verificationNote: note },
  });
  await notify(creator.userId, {
    type: NotificationType.CREATOR_REJECTED,
    title: "Your channel verification wasn't approved",
    body: note || "Check your verification link and contact support to try again.",
    link: "/studio",
  });
  return ok({ creator });
});
