import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { InsufficientBalanceError } from "@/lib/ledger/core";
import { EpisodeAccessDeniedError, VoucherRejectedError, WithdrawError } from "@/lib/ledger/vault";
import { SubscriptionError } from "@/lib/ledger/subscriptions";
import { TipError } from "@/lib/ledger/tips";
import { CampaignError } from "@/lib/ledger/campaigns";
import { ReviewError } from "@/lib/ledger/reviews";
import { ChatError } from "@/lib/chat";
import { KycError } from "@/lib/kyc";

/**
 * Wraps a route handler so every domain error class defined across the
 * ledger/auth modules maps to a sensible HTTP status and a consistent
 * `{ error: string }` body, instead of every route hand-rolling try/catch.
 */
export function withApiErrors<T extends (...args: never[]) => Promise<NextResponse>>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorToResponse(err);
    }
  }) as T;
}

export function errorToResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid input", details: err.flatten() }, { status: 400 });
  }
  if (
    err instanceof InsufficientBalanceError ||
    err instanceof EpisodeAccessDeniedError ||
    err instanceof VoucherRejectedError ||
    err instanceof WithdrawError ||
    err instanceof SubscriptionError ||
    err instanceof TipError ||
    err instanceof CampaignError ||
    err instanceof ReviewError ||
    err instanceof ChatError ||
    err instanceof KycError
  ) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2025") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
