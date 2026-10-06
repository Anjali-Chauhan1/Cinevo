import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, ForbiddenError } from "@/lib/auth";
import { creatorOnboardSchema, rupeesToPaiseInt } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { VerificationStatus } from "@/lib/constants";

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const body = creatorOnboardSchema.parse(await req.json());

  const existingProfile = await prisma.creator.findUnique({ where: { userId: user.id } });
  if (existingProfile) throw new ForbiddenError("You already have a creator channel");

  const handleTaken = await prisma.creator.findUnique({ where: { handle: body.handle } });
  if (handleTaken) return ok({ error: "That handle is taken" }, 409);

  const creator = await prisma.creator.create({
    data: {
      userId: user.id,
      handle: body.handle,
      channelName: body.channelName,
      bio: body.bio,
      bannerUrl: body.bannerUrl || null,
      socialLinks: body.socialLinks ? JSON.stringify(body.socialLinks) : null,
      verificationDocUrl: body.verificationDocUrl,
      verificationStatus: VerificationStatus.PENDING,
      subPriceRupeesPaise: rupeesToPaiseInt(body.subPriceRupees),
    },
  });

  return ok({ creator }, 201);
});
