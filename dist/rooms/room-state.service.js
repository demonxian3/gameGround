"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomStateService = void 0;
const common_1 = require("@nestjs/common");
const room_types_1 = require("./room.types");
let RoomStateService = class RoomStateService {
    constructor() {
        this.rooms = new Map();
    }
    ensureRoom(roomId) {
        const normalizedRoomId = roomId.trim().toUpperCase();
        if (!this.rooms.has(normalizedRoomId)) {
            this.rooms.set(normalizedRoomId, {
                id: normalizedRoomId,
                players: [],
                queue: [],
                snapshots: {},
                activeMatch: null,
                round: 0,
            });
        }
        return this.rooms.get(normalizedRoomId);
    }
    getPublicState(room) {
        return {
            id: room.id,
            players: [...room.players],
            queue: [...room.queue],
            snapshots: { ...room.snapshots },
            activeMatch: room.activeMatch ? { ...room.activeMatch } : null,
            round: room.round,
        };
    }
    joinRoom({ roomId, player }) {
        const room = this.ensureRoom(roomId);
        const existing = room.players.find((entry) => entry.id === player.id);
        if (existing) {
            existing.name = player.name;
            existing.avatar = player.avatar;
            existing.color = player.color;
            existing.lastSeen = Date.now();
        }
        else {
            const nextPlayer = {
                ...player,
                joinedAt: player.joinedAt ?? Date.now(),
                lastSeen: Date.now(),
            };
            room.players.push(nextPlayer);
            room.queue.push(nextPlayer.id);
        }
        this.startNextMatch(room);
        return room;
    }
    renamePlayer({ roomId, playerId, name }) {
        const room = this.ensureRoom(roomId);
        const target = room.players.find((player) => player.id === playerId);
        if (!target)
            return null;
        target.name = name;
        target.lastSeen = Date.now();
        return room;
    }
    updateSnapshot(roomId, playerId, snapshot) {
        const room = this.ensureRoom(roomId);
        room.snapshots[playerId] = {
            ...snapshot,
            timestamp: Date.now(),
        };
        const player = room.players.find((entry) => entry.id === playerId);
        if (player)
            player.lastSeen = Date.now();
        return {
            room,
            snapshot: room.snapshots[playerId],
        };
    }
    resolveMatch(roomId, winnerId, reason) {
        const room = this.ensureRoom(roomId);
        if (!room.activeMatch)
            return null;
        const { defenderId, challengerId } = room.activeMatch;
        if (![defenderId, challengerId].includes(winnerId))
            return null;
        const loserId = winnerId === defenderId ? challengerId : defenderId;
        const middle = room.queue.filter((id) => id !== winnerId && id !== loserId);
        room.queue = [winnerId, ...middle, loserId];
        room.activeMatch = null;
        const result = { winnerId, loserId, reason };
        this.startNextMatch(room);
        return { room, result };
    }
    removePlayer(roomId, playerId) {
        const room = this.ensureRoom(roomId);
        room.players = room.players.filter((player) => player.id !== playerId);
        room.queue = room.queue.filter((id) => id !== playerId);
        delete room.snapshots[playerId];
        if (room.activeMatch && [room.activeMatch.defenderId, room.activeMatch.challengerId].includes(playerId)) {
            room.activeMatch = null;
        }
        this.startNextMatch(room);
        if (room.players.length === 0) {
            this.rooms.delete(room.id);
        }
        return room;
    }
    startNextMatch(room) {
        if (room.activeMatch || room.queue.length < 2)
            return;
        room.round += 1;
        room.activeMatch = {
            round: room.round,
            defenderId: room.queue[0],
            challengerId: room.queue[1],
            startedAt: Date.now(),
            durationMs: room_types_1.MATCH_DURATION_MS,
        };
    }
};
exports.RoomStateService = RoomStateService;
exports.RoomStateService = RoomStateService = __decorate([
    (0, common_1.Injectable)()
], RoomStateService);
//# sourceMappingURL=room-state.service.js.map