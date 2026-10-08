import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "@/lib/chain/config";

/**
 * Server-side chain access: a read client, and the Cinova operator account
 * (the deployer key) that publishes creators' setup, verifies creators and
 * KYC, releases milestones, settles vouchers and pays faucet top-ups.
 * Never import this from client components.
 */
export class ChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainError";
  }
}

const rpcUrl = process.env.CHAIN_RPC_URL || chain.rpcUrls.default.http[0];
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

let operator: ReturnType<typeof createOperator> | null = null;
function createOperator() {
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!key) throw new ChainError("OPERATOR_PRIVATE_KEY is not set — onchain mode needs the operator account.");
  const account = privateKeyToAccount(key as Hex);
  return { account, wallet: createWalletClient({ account, chain, transport: http(rpcUrl) }) };
}
export function getOperator() {
  operator ??= createOperator();
  return operator;
}

// Operator transactions run one at a time: two concurrent sends from the same
// account would race for the same nonce.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Sends a transaction from the operator and waits for it to be mined.
 * Simulates first, so a revert surfaces as a readable error before any gas
 * is spent.
 */
export function operatorWrite<
  const abi extends Abi,
  functionName extends ContractFunctionName<abi, "nonpayable" | "payable">,
  args extends ContractFunctionArgs<abi, "nonpayable" | "payable", functionName>,
>(params: { address: Address; abi: abi; functionName: functionName; args: args }): Promise<TransactionReceipt> {
  const run = async () => {
    const { account, wallet } = getOperator();
    try {
      // viem's generic simulate/write signatures don't line up with a fully
      // generic wrapper; the public signature above keeps callers type-safe.
      const { request } = await publicClient.simulateContract({ ...params, account } as never);
      const hash = await wallet.writeContract(request as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new ChainError(`Transaction ${hash} reverted`);
      return receipt;
    } catch (err) {
      throw toChainError(err);
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Waits for a transaction the user's wallet sent and checks it succeeded. */
export async function waitForUserTx(hash: Hex): Promise<TransactionReceipt> {
  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  } catch (err) {
    throw toChainError(err);
  }
  if (receipt.status !== "success") throw new ChainError("That transaction failed onchain");
  return receipt;
}

/** Decodes the events `abi` emitted by `address` in a receipt. */
export function eventsFrom<const abi extends Abi>(receipt: TransactionReceipt, abi: abi, address: Address) {
  return parseEventLogs({ abi, logs: receipt.logs.filter((l) => l.address.toLowerCase() === address.toLowerCase()) });
}

/** Turns viem's long errors into one readable line (custom error names when reverted). */
function toChainError(err: unknown): ChainError {
  if (err instanceof ChainError) return err;
  const e = err as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string } } };
  const errorName = e.cause?.data?.errorName;
  if (errorName) return new ChainError(`The contract refused: ${errorName}`);
  return new ChainError(e.shortMessage || e.message?.split("\n")[0] || "Chain request failed");
}
