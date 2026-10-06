import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";

const schema = z.object({ email: z.string().email() });

export const POST = withApiErrors(async (req: NextRequest) => {
  const { creator } = await requireCreator();
  const body = schema.parse(await req.json());

  const target = await prisma.user.findUnique({ where: { email: body.email } });
  if (!target) return ok({ error: "No account with that email" }, 404);

  const assignment = await prisma.moderatorAssignment.upsert({
    where: { creatorId_userId: { creatorId: creator.id, userId: target.id } },
    create: { creatorId: creator.id, userId: target.id },
    update: {},
  });

  return ok({ assignment }, 201);
});

export const GET = withApiErrors(async () => {
  const { creator } = await requireCreator();
  const assignments = await prisma.moderatorAssignment.findMany({
    where: { creatorId: creator.id },
    include: { user: { select: { id: true, displayName: true, email: true } } },
  });
  return ok({ moderators: assignments });
});
