const { createServer } = require("node:http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const MATCH_DURATION_MS = 5 * 60 * 1000;
const rooms = new Map();

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      players: [],
      queue: [],
      snapshots: {},
      activeMatch: null,
      round: 0,
    });
  }
  return rooms.get(roomId);
}

function getPublicState(room) {
  return {
    id: room.id,
    players: room.players,
    queue: room.queue,
    snapshots: room.snapshots,
    activeMatch: room.activeMatch,
    round: room.round,
  };
}

function startNextMatch(room) {
  if (room.activeMatch || room.queue.length < 2) return;
  room.round += 1;
  room.activeMatch = {
    round: room.round,
    defenderId: room.queue[0],
    challengerId: room.queue[1],
    startedAt: Date.now(),
    durationMs: MATCH_DURATION_MS,
  };
}

function resolveMatch(room, winnerId, reason) {
  if (!room.activeMatch) return;
  const { defenderId, challengerId } = room.activeMatch;
  const loserId = winnerId === defenderId ? challengerId : defenderId;
  const middle = room.queue.filter((id) => id !== winnerId && id !== loserId);
  room.queue = [winnerId, ...middle, loserId];
  room.activeMatch = null;
  startNextMatch(room);
  return { winnerId, loserId, reason };
}

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId, player }) => {
    const room = ensureRoom(roomId);
    const existing = room.players.find((entry) => entry.id === player.id);
    if (existing) {
      existing.name = player.name;
      existing.avatar = player.avatar;
    } else {
      room.players.push(player);
      room.queue.push(player.id);
    }

    socket.data.roomId = roomId;
    socket.data.playerId = player.id;
    socket.join(roomId);

    startNextMatch(room);
    io.to(roomId).emit("room:state", getPublicState(room));
  });

  socket.on("player:rename", ({ roomId, playerId, name }) => {
    const room = ensureRoom(roomId);
    const target = room.players.find((player) => player.id === playerId);
    if (!target) return;
    target.name = name;
    io.to(roomId).emit("room:state", getPublicState(room));
  });

  socket.on("match:snapshot", ({ roomId, playerId, snapshot }) => {
    const room = ensureRoom(roomId);
    room.snapshots[playerId] = { ...snapshot, timestamp: Date.now() };
    socket.to(roomId).emit("match:snapshot", { playerId, snapshot: room.snapshots[playerId] });
  });

  socket.on("match:resolve", ({ roomId, winnerId, reason }) => {
    const room = ensureRoom(roomId);
    const result = resolveMatch(room, winnerId, reason);
    if (!result) return;
    io.to(roomId).emit("match:resolved", result);
    io.to(roomId).emit("room:state", getPublicState(room));
  });

  socket.on("disconnect", () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const room = ensureRoom(roomId);
    room.players = room.players.filter((player) => player.id !== playerId);
    room.queue = room.queue.filter((id) => id !== playerId);
    delete room.snapshots[playerId];
    if (room.activeMatch && [room.activeMatch.defenderId, room.activeMatch.challengerId].includes(playerId)) {
      room.activeMatch = null;
    }
    startNextMatch(room);
    io.to(roomId).emit("room:state", getPublicState(room));
  });
});

httpServer.listen(3001, () => {
  console.log("socket server listening on http://127.0.0.1:3001");
});
