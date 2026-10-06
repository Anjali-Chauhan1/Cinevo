import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  signSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { sanitizeUser } from "@/lib/serialize";

// Demo-mode convenience: the same signup bonus /api/auth/signup grants, so
// logging in with a brand-new email behaves identically to signing up.
const AUTO_SIGNUP_GRANT_PAISE = 50000; // ₹500

export const POST = withApiErrors(async (req: NextRequest) => {
  const body = loginSchema.parse(await req.json());

  let user = await prisma.user.findUnique({ where: { email: body.email } });

  if (!user) {
    // No account for this email yet — this demo accepts ANY email/password
    // combo and creates the account on first use instead of forcing a
    // separate signup step first.
    const passwordHash = await hashPassword(body.password);
    const displayName = body.email.split("@")[0];

    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: body.email, passwordHash, displayName },
      });
      const account = await tx.ledgerAccount.create({
        data: { userId: created.id, balancePaise: AUTO_SIGNUP_GRANT_PAISE },
      });
      await tx.ledgerTransaction.create({
        data: {
          accountId: account.id,
          type: "GRANT",
          amountPaise: AUTO_SIGNUP_GRANT_PAISE,
          balanceAfter: AUTO_SIGNUP_GRANT_PAISE,
          meta: JSON.stringify({ reason: "auto-signup on first login" }),
        },
      });
      return created;
    });
  } else {
    if (user.suspended) return ok({ error: "This account has been suspended" }, 403);

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) return ok({ error: "Invalid email or password" }, 401);
  }

  const token = signSession(user.id);
  const res = ok({ user: sanitizeUser(user) });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
});
