import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { submitReview } from "@/lib/ledger/reviews";
import { reviewSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const { id } = params;
  const body = reviewSchema.parse(await req.json());
  const review = await submitReview(user.id, id, body);
  return ok({ review }, 201);
});
