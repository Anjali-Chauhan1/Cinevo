import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/auth";
import { creatorSettingsSchema, rupeesToPaiseInt } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { VerificationStatus } from "@/lib/constants";
import { isOnchain } from "@/lib/chain/config";
import { setSubscriptionPriceOnchain } from "@/lib/chain/operator";

export const PATCH = withApiErrors(async (req: NextRequest) => {
  const { creator } = await requireCreator();
  const body = creatorSettingsSchema.parse(await req.json());

  const updated = await prisma.creator.update({
    where: { id: creator.id },
    data: {
      bio: body.bio,
      bannerUrl: body.bannerUrl || undefined,
      socialLinks: body.socialLinks ? JSON.stringify(body.socialLinks) : undefined,
      subPriceRupeesPaise:
        body.subPriceRupees !== undefined ? rupeesToPaiseInt(body.subPriceRupees) : undefined,
    },
  });

  if (isOnchain && body.subPriceRupees !== undefined && updated.verificationStatus === VerificationStatus.APPROVED) {
    await setSubscriptionPriceOnchain(updated.id);
  }
  return ok({ creator: updated });
});
