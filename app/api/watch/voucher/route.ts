import { NextRequest } from "next/server";
import { z } from "zod";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { submitVoucher, VoucherRejectedError } from "@/lib/ledger/vault";
import { voucherSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { FreeReason } from "@/lib/constants";
import { getAddresses, isOnchain, paiseToUnits, toChainId, VOUCHER_TYPES, voucherDomain } from "@/lib/chain/config";
import { syncBalance } from "@/lib/chain/mirror";

const onchainSchema = z.object({ signature: z.string().startsWith("0x").optional() });

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const { sessionToken, cumulativeAmountPaise, playedSeconds } = voucherSchema.parse(body);

  if (!isOnchain) {
    return ok({ session: await submitVoucher(sessionToken, user.id, cumulativeAmountPaise, playedSeconds) });
  }

  // Onchain mode: a voucher that raises the amount owed must carry the
  // viewer's wallet signature over exactly that amount — that signature is
  // what lets the vault charge them later. Plain heartbeats don't need one.
  const session = await prisma.watchSession.findUnique({ where: { sessionToken } });
  if (!session || session.viewerId !== user.id) throw new VoucherRejectedError("Unknown session");
  const raisesAmount = session.freeReason === FreeReason.NONE && cumulativeAmountPaise > session.cumulativeAmountPaise;
  if (!raisesAmount) {
    return ok({ session: await submitVoucher(sessionToken, user.id, cumulativeAmountPaise, playedSeconds) });
  }

  const { signature } = onchainSchema.parse(body);
  if (!signature) throw new VoucherRejectedError("This voucher needs your wallet's signature");
  if (!user.walletAddress || !session.voucherExpiry) throw new VoucherRejectedError("This session isn't set up for onchain payment");
  const voucherUnits = paiseToUnits(cumulativeAmountPaise);
  const signer = await recoverTypedDataAddress({
    domain: voucherDomain(getAddresses().vault),
    types: VOUCHER_TYPES,
    primaryType: "Voucher",
    message: {
      viewer: user.walletAddress as Address,
      episodeId: toChainId(session.episodeId),
      sessionId: toChainId(sessionToken),
      cumulativeAmount: voucherUnits,
      expiry: BigInt(session.voucherExpiry),
    },
    signature: signature as Hex,
  });
  if (signer.toLowerCase() !== user.walletAddress.toLowerCase()) {
    throw new VoucherRejectedError("Voucher signature doesn't match your wallet");
  }

  const freeBalancePaise = await syncBalance(user.id);
  return ok({
    session: await submitVoucher(sessionToken, user.id, cumulativeAmountPaise, playedSeconds, {
      voucherUnits: voucherUnits.toString(),
      voucherSignature: signature,
      freeBalancePaise,
    }),
  });
});
