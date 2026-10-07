import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { submitKyc, KycError } from "@/lib/kyc";
import { KYC, KycIdType } from "@/lib/constants";

/** Current verification status plus the latest attempt (without file keys),
 * so the /verify page can show "under review" or a rejection reason. */
export const GET = withApiErrors(async () => {
  const user = await requireUser();
  const latest = await prisma.kycSubmission.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      legalName: true,
      country: true,
      idType: true,
      idNumberLast4: true,
      status: true,
      rejectionReason: true,
      createdAt: true,
      reviewedAt: true,
    },
  });
  return ok({ kycStatus: user.kycStatus, region: user.region, latest });
});

const COUNTRY_CODES = KYC.COUNTRIES.map((c) => c.code) as [string, ...string[]];

const fieldsSchema = z.object({
  legalName: z.string().trim().min(2, "Enter your full legal name").max(120),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth"),
  country: z.enum(COUNTRY_CODES),
  idType: z.enum([KycIdType.PASSPORT, KycIdType.DRIVERS_LICENSE, KycIdType.NATIONAL_ID]),
  idNumber: z.string().trim().min(4, "Enter your full ID number").max(40),
});

/**
 * Demo stand-in for handing off to a licensed KYC partner: collects identity
 * details and documents for manual admin review. Multipart form, because the
 * ID document and selfie are uploaded in the same request.
 */
export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const form = await req.formData();

  const parsed = fieldsSchema.safeParse({
    legalName: form.get("legalName"),
    dateOfBirth: form.get("dateOfBirth"),
    country: form.get("country"),
    idType: form.get("idType"),
    idNumber: form.get("idNumber"),
  });
  // Surface the specific field problem instead of a generic "Invalid input".
  if (!parsed.success) throw new KycError(parsed.error.issues[0]?.message ?? "Check the form and try again");
  const fields = parsed.data;
  const document = form.get("document");
  const selfie = form.get("selfie");
  if (!(document instanceof File)) throw new KycError("Upload a photo or scan of your ID");
  if (!(selfie instanceof File)) throw new KycError("Upload a selfie holding your ID");

  const submission = await submitKyc(user.id, { ...fields, document, selfie });
  return ok({ kycStatus: "PENDING", submittedAt: submission.createdAt }, 201);
});
