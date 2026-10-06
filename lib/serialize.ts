/**
 * NextResponse.json() (and JSON.stringify under it) throws on BigInt, which
 * Prisma returns for our accRevenuePerUnitScaled fields. Recursively
 * stringifies any BigInt before a route hands data back to the client.
 */
export function toJSONSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

/** Strips fields that should never leave the server (password hash, etc). */
export function sanitizeUser<T extends { passwordHash?: string }>(user: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it
  const { passwordHash, ...rest } = user;
  return rest;
}
