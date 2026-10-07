/**
 * Promotes an existing account to platform admin (creator verification, KYC,
 * milestone approvals, reports). There is deliberately no in-app way to do
 * this — admin rights are granted by someone with server access.
 *
 *   npm run make-admin -- you@example.com
 *   npm run make-admin -- you@example.com --revoke
 */
import { PrismaClient } from "@prisma/client";
import { PLATFORM_LEDGER_EMAIL, PlatformRole } from "../lib/constants";

const prisma = new PrismaClient();

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: npm run make-admin -- <email> [--revoke]");
    process.exit(1);
  }
  if (email === PLATFORM_LEDGER_EMAIL) {
    console.error("That's the internal fee-collection account, not a person. Pick a real user.");
    process.exit(1);
  }
  const revoke = flag === "--revoke";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account with email ${email}. Sign up first, then run this again.`);
    process.exit(1);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { platformRole: revoke ? PlatformRole.VIEWER : PlatformRole.ADMIN },
  });
  console.log(revoke ? `${email} is no longer an admin.` : `${email} is now an admin. Reload the site and open /admin.`);
}

main().finally(() => prisma.$disconnect());
