-- One person, one verified account: a keyed fingerprint of the ID document.
-- Additive and nullable: existing rows are untouched.
ALTER TABLE "KycSubmission" ADD COLUMN "idFingerprint" TEXT;

CREATE INDEX "KycSubmission_idFingerprint_idx" ON "KycSubmission"("idFingerprint");
