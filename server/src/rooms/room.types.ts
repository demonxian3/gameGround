export const MATCH_DURATION_MS = 5 * 60 * 1000;

export interface Player {
  id: string;
  name: string;
  avatar?: string;
  color?: string;
  joinedAt?: number;
  lastSeen?: number;
}

export interface Snapshot {
  [key: string]: unknown;
  timestamp?: number;
}

export interface ActiveMatch {
  round: number;
  defenderId: string;
  challengerId: string;
  startedAt: number;
  durationMs: number;
}

export interface RoomState {
  id: string;
  players: Player[];
  queue: string[];
  snapshots: Record<string, Snapshot>;
  activeMatch: ActiveMatch | null;
  round: number;
}

export interface JoinRoomPayload {
  roomId: string;
  player: Player;
}

export interface RenamePlayerPayload {
  roomId: string;
  playerId: string;
  name: string;
}

export interface MatchSnapshotPayload {
  roomId: string;
  playerId: string;
  snapshot: Snapshot;
}

export interface MatchResolvePayload {
  roomId: string;
  winnerId: string;
  reason: string;
}

export interface MatchResolution {
  winnerId: string;
  loserId: string;
  reason: string;
}
