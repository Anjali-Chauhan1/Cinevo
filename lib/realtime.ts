/**
 * The realtime server (realtime-server.ts) runs as a SEPARATE process from
 * the Next.js app — see that file for why. A REST route here (e.g. POST
 * /api/tips) pushes a live update into a premiere room over a tiny internal
 * HTTP hook instead of sharing in-process state. This is always best-effort:
 * if the realtime server is down, the money/data operation that triggered
 * this call has already succeeded and must not be rolled back for it.
 */
const REALTIME_URL = process.env.REALTIME_SERVER_URL || "http://localhost:3002";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "cinevo-dev-internal-secret";

export async function emitToEpisode(episodeId: string, event: string, payload: unknown) {
  try {
    await fetch(`${REALTIME_URL}/internal/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET },
      body: JSON.stringify({ episodeId, event, payload }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Realtime push failed or timed out — swallow it. The caller's primary
    // operation already committed; a missed live-UI update is not worth
    // failing the request over.
  }
}
