import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { BASIC_EMOTES, MAX_CREATOR_EMOTES, normalizeEmoteCode } from "@/lib/emotes";

const schema = z.object({ code: z.string().min(1).max(30), glyph: z.string().trim().min(1).max(8) });

export const POST = withApiErrors(async (req: NextRequest) => {
  const { creator } = await requireCreator();
  const body = schema.parse(await req.json());

  const code = normalizeEmoteCode(body.code);
  if (!code) return ok({ error: "Emote codes are 2–24 letters, numbers or underscores, like :hype:" }, 400);
  if (BASIC_EMOTES.some((e) => e.code.toLowerCase() === code.toLowerCase())) {
    return ok({ error: `${code} is one of the free emotes everyone already has — pick another name` }, 400);
  }

  const existing = await prisma.emote.findMany({ where: { creatorId: creator.id } });
  if (existing.length >= MAX_CREATOR_EMOTES) {
    return ok({ error: `You can have up to ${MAX_CREATOR_EMOTES} channel emotes — remove one first` }, 400);
  }
  if (existing.some((e) => e.code.toLowerCase() === code.toLowerCase())) {
    return ok({ error: `You already have ${code}` }, 400);
  }

  const emote = await prisma.emote.create({ data: { creatorId: creator.id, code, glyph: body.glyph } });
  return ok({ emote }, 201);
});
