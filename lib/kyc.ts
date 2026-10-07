import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { KYC, KycStatus, KycSubmissionStatus, Region } from "@/lib/constants";

export class KycError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KycError";
  }
}

// Outside public/ on purpose: identity documents must only ever be served
// through the admin-only file route, never as a static asset.
const KYC_STORAGE_DIR = path.join(process.cwd(), "storage", "kyc");

const FILE_SIGNATURES: Array<{ ext: string; contentType: string; magic: number[] }> = [
  { ext: "jpg", contentType: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { ext: "png", contentType: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "pdf", contentType: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
];

/** Identifies a file by its leading bytes rather than trusting the
 * client-supplied MIME type or extension. */
function sniffFileType(bytes: Buffer) {
  return FILE_SIGNATURES.find((sig) => sig.magic.every((b, i) => bytes[i] === b)) ?? null;
}

async function storeKycFile(file: File, label: string, allowPdf: boolean): Promise<string> {
  if (file.size === 0) throw new KycError(`${label} is empty`);
  if (file.size > KYC.MAX_FILE_BYTES) {
    throw new KycError(`${label} must be under ${KYC.MAX_FILE_BYTES / (1024 * 1024)} MB`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffFileType(bytes);
  if (!type || (!allowPdf && type.ext === "pdf")) {
    throw new KycError(`${label} must be a ${allowPdf ? "JPG, PNG or PDF" : "JPG or PNG"} file`);
  }
  await mkdir(KYC_STORAGE_DIR, { recursive: true });
  const key = `${randomUUID()}.${type.ext}`;
  await writeFile(path.join(KYC_STORAGE_DIR, key), bytes);
  return key;
}

export async function readKycFile(key: string) {
  // Keys are generated server-side, but never let a stored value escape the
  // storage directory regardless.
  if (!/^[0-9a-f-]{36}\.(jpg|png|pdf)$/.test(key)) throw new KycError("Invalid file reference");
  const bytes = await readFile(path.join(KYC_STORAGE_DIR, key));
  const type = FILE_SIGNATURES.find((sig) => key.endsWith(`.${sig.ext}`))!;
  return { bytes, contentType: type.contentType };
}

/** Verified country of residence → the region the Producer Units gate uses. */
export function regionForCountry(country: string): string {
  if (country === "US") return Region.US;
  if (country === "IN") return Region.IN;
  return Region.OTHER;
}

function ageInYears(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export interface KycSubmissionInput {
  legalName: string;
  dateOfBirth: string; // YYYY-MM-DD
  country: string;
  idType: string;
  idNumber: string;
  document: File;
  selfie: File;
}

export async function submitKyc(userId: string, input: KycSubmissionInput) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.kycStatus === KycStatus.VERIFIED) throw new KycError("Your identity is already verified");
  if (user.kycStatus === KycStatus.PENDING) throw new KycError("Your verification is already under review");

  const dob = new Date(`${input.dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) throw new KycError("Enter a valid date of birth");
  if (ageInYears(dob) < KYC.MIN_AGE) throw new KycError(`You must be at least ${KYC.MIN_AGE} to verify`);

  const idNumber = input.idNumber.replace(/\s+/g, "");
  if (idNumber.length < 4) throw new KycError("Enter your full ID number");

  // Files are written before the DB row; a failed insert only leaves an
  // orphaned file in private storage, never a submission without documents.
  const documentKey = await storeKycFile(input.document, "ID document", true);
  const selfieKey = await storeKycFile(input.selfie, "Selfie", false);

  return prisma.$transaction(async (tx) => {
    const submission = await tx.kycSubmission.create({
      data: {
        userId,
        legalName: input.legalName.trim(),
        dateOfBirth: dob,
        country: input.country,
        idType: input.idType,
        idNumberLast4: idNumber.slice(-4),
        documentKey,
        selfieKey,
      },
    });
    await tx.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.PENDING } });
    return submission;
  });
}

async function latestPendingSubmission(userId: string) {
  const submission = await prisma.kycSubmission.findFirst({
    where: { userId, status: KycSubmissionStatus.PENDING },
    orderBy: { createdAt: "desc" },
  });
  if (!submission) throw new KycError("This user has no verification awaiting review");
  return submission;
}

export async function approveKyc(adminId: string, userId: string) {
  const submission = await latestPendingSubmission(userId);
  return prisma.$transaction(async (tx) => {
    await tx.kycSubmission.update({
      where: { id: submission.id },
      data: { status: KycSubmissionStatus.APPROVED, reviewedBy: adminId, reviewedAt: new Date() },
    });
    // Identity, not the signup dropdown, decides region from here on —
    // this is what the Producer Units gate in lib/ledger/campaigns.ts trusts.
    return tx.user.update({
      where: { id: userId },
      data: { kycStatus: KycStatus.VERIFIED, region: regionForCountry(submission.country) },
    });
  });
}

export async function rejectKyc(adminId: string, userId: string, reason: string) {
  const submission = await latestPendingSubmission(userId);
  return prisma.$transaction(async (tx) => {
    await tx.kycSubmission.update({
      where: { id: submission.id },
      data: {
        status: KycSubmissionStatus.REJECTED,
        rejectionReason: reason,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });
    return tx.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.REJECTED } });
  });
}
