import { Injectable } from '@nestjs/common';
import {
  JoinRoomPayload,
  MATCH_DURATION_MS,
  MatchResolution,
  Player,
  RenamePlayerPayload,
  RoomState,
  Snapshot,
} from './room.types';

@Injectable()
export class RoomStateService {
  private readonly rooms = new Map<string, RoomState>();

  ensureRoom(roomId: string): RoomState {
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

    return this.rooms.get(normalizedRoomId)!;
  }

  getPublicState(room: RoomState): RoomState {
    return {
      id: room.id,
      players: [...room.players],
      queue: [...room.queue],
      snapshots: { ...room.snapshots },
      activeMatch: room.activeMatch ? { ...room.activeMatch } : null,
      round: room.round,
    };
  }

  joinRoom({ roomId, player }: JoinRoomPayload): RoomState {
    const room = this.ensureRoom(roomId);
    const existing = room.players.find((entry) => entry.id === player.id);

    if (existing) {
      existing.name = player.name;
      existing.avatar = player.avatar;
      existing.color = player.color;
      existing.lastSeen = Date.now();
    } else {
      const nextPlayer: Player = {
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

  renamePlayer({ roomId, playerId, name }: RenamePlayerPayload): RoomState | null {
    const room = this.ensureRoom(roomId);
    const target = room.players.find((player) => player.id === playerId);
    if (!target) return null;

    target.name = name;
    target.lastSeen = Date.now();
    return room;
  }

  updateSnapshot(roomId: string, playerId: string, snapshot: Snapshot): { room: RoomState; snapshot: Snapshot } {
    const room = this.ensureRoom(roomId);
    room.snapshots[playerId] = {
      ...snapshot,
      timestamp: Date.now(),
    };

    const player = room.players.find((entry) => entry.id === playerId);
    if (player) player.lastSeen = Date.now();

    return {
      room,
      snapshot: room.snapshots[playerId],
    };
  }

  resolveMatch(roomId: string, winnerId: string, reason: string): { room: RoomState; result: MatchResolution } | null {
    const room = this.ensureRoom(roomId);
    if (!room.activeMatch) return null;

    const { defenderId, challengerId } = room.activeMatch;
    if (![defenderId, challengerId].includes(winnerId)) return null;

    const loserId = winnerId === defenderId ? challengerId : defenderId;
    const middle = room.queue.filter((id) => id !== winnerId && id !== loserId);
    room.queue = [winnerId, ...middle, loserId];
    room.activeMatch = null;

    const result: MatchResolution = { winnerId, loserId, reason };
    this.startNextMatch(room);
    return { room, result };
  }

  removePlayer(roomId: string, playerId: string): RoomState {
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

  private startNextMatch(room: RoomState) {
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
}
