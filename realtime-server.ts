/**
 * Standalone realtime server for the premiere room: live chat, reactions,
 * the hype bar, and viewer count. Deliberately a SEPARATE process from the
 * Next.js app (run on its own port) rather than a custom Next server — Next
 * wraps App Router internals in AsyncLocalStorage, which conflicts with
 * running the whole app through tsx's module loader. Keeping this process
 * free of any `next`/`next/headers` import sidesteps that entirely.
 *
 * All business logic (validation, moderation, rate limits) still lives in
 * lib/chat.ts and lib/hype.ts, shared verbatim with the REST API routes —
 * this file is just the transport layer.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";
import { prisma } from "./lib/db";
import { postMessage, deleteMessage, ChatError } from "./lib/chat";
import { registerReaction } from "./lib/hype";

const PORT = Number(process.env.REALTIME_PORT) || 3002;
const NEXT_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
const JWT_SECRET = process.env.JWT_SECRET;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "cinevo-dev-internal-secret";
const SESSION_COOKIE_NAME = "cinevo_session";

if (!JWT_SECRET) throw new Error("JWT_SECRET is not set. Add it to .env before starting the app.");

function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";").map((p) => p.trim())) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// A minimal internal HTTP hook so the Next app's API routes (running in a
// SEPARATE process — tips, milestone approvals, etc.) can push a realtime
// update into a premiere room without the two processes sharing memory.
// Guarded by a shared secret since it's otherwise an open broadcast endpoint.
function handleInternalEmit(req: IncomingMessage, res: ServerResponse, io: SocketIOServer) {
  readBody(req)
    .then((raw) => {
      if (req.headers["x-internal-secret"] !== INTERNAL_SECRET) {
        res.writeHead(401).end();
        return;
      }
      const { episodeId, event, payload } = JSON.parse(raw || "{}");
      if (!episodeId || !event) {
        res.writeHead(400).end();
        return;
      }
      io.to(`premiere:${episodeId}`).emit(event, payload);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
    })
    .catch(() => res.writeHead(500).end());
}

const httpServer = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/internal/emit") {
    return handleInternalEmit(req, res, io);
  }
  if (req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  res.writeHead(404).end();
});

const io = new SocketIOServer(httpServer, {
  path: "/socket.io",
  cors: { origin: NEXT_ORIGIN, credentials: true },
});

io.use((socket, next) => {
  const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);
  const userId = token ? verifyToken(token) : null;
  if (!userId) return next(new Error("unauthorized"));
  socket.data.userId = userId;
  next();
});

io.on("connection", (socket) => {
  const userId: string = socket.data.userId;
  let currentRoom: string | null = null;
  let currentEpisodeId: string | null = null;

  const broadcastViewerCount = async (episodeId: string) => {
    const room = io.sockets.adapter.rooms.get(`premiere:${episodeId}`);
    const count = room?.size ?? 0;
    io.to(`premiere:${episodeId}`).emit("viewer_count", { count });
    const premiere = await prisma.premiere.findUnique({ where: { episodeId } });
    if (premiere && count > premiere.viewerPeak) {
      await prisma.premiere.update({ where: { episodeId }, data: { viewerPeak: count } });
    }
  };

  socket.on("join_premiere", async ({ episodeId }: { episodeId: string }) => {
    if (currentRoom) {
      socket.leave(currentRoom);
      if (currentEpisodeId) await broadcastViewerCount(currentEpisodeId);
    }
    currentRoom = `premiere:${episodeId}`;
    currentEpisodeId = episodeId;
    socket.join(currentRoom);
    await broadcastViewerCount(episodeId);
  });

  socket.on("chat_message", async ({ episodeId, text }: { episodeId: string; text: string }) => {
    try {
      const message = await postMessage(userId, episodeId, text);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      io.to(`premiere:${episodeId}`).emit("chat_message", {
        id: message.id,
        text: message.text,
        type: message.type,
        badges: message.badges ? JSON.parse(message.badges) : null,
        pinned: message.pinned,
        createdAt: message.createdAt,
        user: { id: userId, displayName: user?.displayName, avatarUrl: user?.avatarUrl },
      });
    } catch (err) {
      socket.emit("chat_error", { message: err instanceof ChatError ? err.message : "Message failed" });
    }
  });

  socket.on("reaction", async ({ episodeId, emoji }: { episodeId: string; emoji: string }) => {
    const result = await registerReaction(episodeId, userId);
    if (result.counted) {
      io.to(`premiere:${episodeId}`).emit("reaction", { emoji, userId });
    }
    if (result.newLevel) {
      io.to(`premiere:${episodeId}`).emit("hype_update", { progress: result.progress, newLevel: result.newLevel });
    }
  });

  socket.on("mod_delete", async ({ messageId }: { messageId: string }) => {
    try {
      const message = await deleteMessage(userId, messageId);
      io.to(`premiere:${message.episodeId}`).emit("message_deleted", { messageId: message.id });
    } catch (err) {
      socket.emit("chat_error", { message: err instanceof ChatError ? err.message : "Action failed" });
    }
  });

  socket.on("disconnect", async () => {
    if (currentEpisodeId) await broadcastViewerCount(currentEpisodeId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`> Cinevo realtime server ready on http://localhost:${PORT}`);
});
