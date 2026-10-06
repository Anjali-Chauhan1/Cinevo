import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";

const schema = z.object({ code: z.string().min(2).max(30), glyph: z.string().min(1).max(8) });

export const POST = withApiErrors(async (req: NextRequest) => {
  const { creator } = await requireCreator();
  const body = schema.parse(await req.json());

  const count = await prisma.emote.count({ where: { creatorId: creator.id } });
  if (count >= 5) {
    return ok({ error: "Creators can have at most 5 custom emotes (MVP limit)" }, 400);
  }

  const emote = await prisma.emote.create({ data: { creatorId: creator.id, code: body.code, glyph: body.glyph } });
  return ok({ emote }, 201);
});
