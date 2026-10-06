import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from "@/lib/auth";
import { signupSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { sanitizeUser } from "@/lib/serialize";

// New accounts get a small demo-token grant so the pay-per-minute, tips and
// subscriptions flows are immediately testable without a separate "top up"
// step getting in the way of a first-time demo.
const SIGNUP_GRANT_PAISE = 50000; // ₹500

export const POST = withApiErrors(async (req: NextRequest) => {
  const body = signupSchema.parse(await req.json());

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return ok({ error: "An account with this email already exists" }, 409);
  }

  const passwordHash = await hashPassword(body.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        region: body.region,
      },
    });
    const account = await tx.ledgerAccount.create({
      data: { userId: created.id, balancePaise: SIGNUP_GRANT_PAISE },
    });
    await tx.ledgerTransaction.create({
      data: {
        accountId: account.id,
        type: "GRANT",
        amountPaise: SIGNUP_GRANT_PAISE,
        balanceAfter: SIGNUP_GRANT_PAISE,
        meta: JSON.stringify({ reason: "signup bonus" }),
      },
    });
    return created;
  });

  const token = signSession(user.id);
  const res = ok({ user: sanitizeUser(user) }, 201);
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
});
