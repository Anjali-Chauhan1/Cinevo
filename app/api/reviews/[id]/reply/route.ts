import { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { replyToReview } from "@/lib/ledger/reviews";
import { ok, withApiErrors } from "@/lib/api";

const schema = z.object({ reply: z.string().min(1).max(500) });

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { creator } = await requireCreator();
  const { id } = params;
  const body = schema.parse(await req.json());
  const review = await replyToReview(creator.id, id, body.reply);
  return ok({ review });
});
