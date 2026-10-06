import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async () => {
  const res = ok({ success: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
});
