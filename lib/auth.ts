import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "cinevo_session";
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail loudly at boot rather than silently signing tokens with `undefined`.
  throw new Error("JWT_SECRET is not set. Add it to .env before starting the app.");
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET!, { expiresIn: SESSION_MAX_AGE_SECONDS });
}

function verifySession(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

/** Exposed for contexts without access to next/headers' cookies() — e.g. the
 * Socket.IO handshake in server.ts, which has to parse the cookie header
 * itself. */
export function verifySessionToken(token: string): string | null {
  return verifySession(token);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;

/** Reads the session cookie (server components, route handlers, server actions). */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/**
 * Full current user, including creator profile and ledger balance, for
 * server components that need to render account-aware UI. Returns null if
 * not signed in OR if the account has been suspended (suspended accounts are
 * logged out effectively everywhere without needing to revoke every token).
 */
export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { creator: true, ledgerAccount: true },
  });

  if (!user || user.suspended) return null;
  return user;
}

/** Throws a typed error API routes can catch and turn into a 401. */
export class UnauthorizedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireCreator() {
  const user = await requireUser();
  if (!user.creator) throw new ForbiddenError("A creator profile is required for this action");
  return { user, creator: user.creator };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.platformRole !== "ADMIN") throw new ForbiddenError("Admin access required");
  return user;
}
