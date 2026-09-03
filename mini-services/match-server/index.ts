// ─────────────────────────────────────────────────────────────
// PAPER STORM · Match Server (mini-service)
// Socket.io server hosting authoritative multiplayer matches.
// Uses the REAL game engine (ServerGame) — same Unit, InkEconomy,
// EnemyCommander, ProjectileSystem, VisionSystem as the client.
// Port: 3030 (exposed via Caddy `?XTransformPort=3030`)
// ─────────────────────────────────────────────────────────────

import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { MatchServer } from './MatchServer';

const PORT = 3030;

const httpServer = createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'paper-storm-match-server', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const io = new IOServer(httpServer, {
  // CRITICAL: when credentials:true, origin CANNOT be '*'.
  // Browsers reject the response otherwise. Reflect the request origin.
  cors: {
    origin: (_origin, cb) => { cb(null, true); },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e6,
  // Engine-level ping/pong for connection health.
  // 5s interval, 15s timeout — detects dead connections without
  // falsely disconnecting high-latency clients.
  pingInterval: 5000,
  pingTimeout: 15000,
  allowEIO3: true,
});

const matchServer = new MatchServer(io);

io.on('connection', (socket) => {
  matchServer.handleConnection(socket);
  // Timestamped PING/PONG for RTT measurement.
  // Server echoes the client timestamp back — client computes RTT.
  socket.on('ping_ts', (clientTimestamp: number) => {
    socket.emit('pong_ts', clientTimestamp);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[paper-storm-match-server] listening on :${PORT} — REAL engine`);
});

// Graceful shutdown
const shutdown = (sig: string) => {
  console.log(`[paper-storm-match-server] ${sig} received, shutting down`);
  matchServer.dispose();
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
