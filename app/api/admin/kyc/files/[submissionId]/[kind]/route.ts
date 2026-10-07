import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { withApiErrors } from "@/lib/api";
import { readKycFile } from "@/lib/kyc";

/** Streams a KYC document or selfie to an admin. These files are never
 * public: they live outside public/ and are only reachable through here. */
export const GET = withApiErrors(
  async (_req: Request, { params }: { params: { submissionId: string; kind: string } }) => {
    await requireAdmin();
    if (params.kind !== "document" && params.kind !== "selfie") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const submission = await prisma.kycSubmission.findUniqueOrThrow({ where: { id: params.submissionId } });
    const { bytes, contentType } = await readKycFile(
      params.kind === "document" ? submission.documentKey : submission.selfieKey
    );
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        // Identity documents must not linger in browser or proxy caches.
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  }
);
