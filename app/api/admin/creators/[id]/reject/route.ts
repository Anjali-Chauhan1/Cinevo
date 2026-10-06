import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { VerificationStatus } from "@/lib/constants";

const schema = z.object({ note: z.string().max(500).optional() });

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const { id } = params;
  const { note } = schema.parse(await req.json().catch(() => ({})));
  const creator = await prisma.creator.update({
    where: { id },
    data: { verificationStatus: VerificationStatus.REJECTED, verificationNote: note },
  });
  return ok({ creator });
});
