import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RoomStateService } from './room-state.service';
import { JoinRoomPayload, MatchResolvePayload, MatchSnapshotPayload, RenamePlayerPayload } from './room.types';

type RoomSocket = Socket & {
  data: {
    roomId?: string;
    playerId?: string;
  };
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RoomGateway.name);

  constructor(private readonly roomStateService: RoomStateService) {}

  handleConnection(client: RoomSocket) {
    this.logger.debug(`socket connected: ${client.id}`);
  }

  handleDisconnect(client: RoomSocket) {
    const { roomId, playerId } = client.data;
    if (!roomId || !playerId) return;

    const room = this.roomStateService.removePlayer(roomId, playerId);
    if (room.players.length > 0) {
      this.server.to(room.id).emit('room:state', this.roomStateService.getPublicState(room));
    }
  }

  @SubscribeMessage('room:join')
  handleJoin(@MessageBody() payload: JoinRoomPayload, @ConnectedSocket() client: RoomSocket) {
    const room = this.roomStateService.joinRoom(payload);
    client.data.roomId = room.id;
    client.data.playerId = payload.player.id;
    void client.join(room.id);
    this.server.to(room.id).emit('room:state', this.roomStateService.getPublicState(room));
  }

  @SubscribeMessage('player:rename')
  handleRename(@MessageBody() payload: RenamePlayerPayload) {
    const room = this.roomStateService.renamePlayer(payload);
    if (!room) return;
    this.server.to(room.id).emit('room:state', this.roomStateService.getPublicState(room));
  }

  @SubscribeMessage('match:snapshot')
  handleSnapshot(@MessageBody() payload: MatchSnapshotPayload, @ConnectedSocket() client: RoomSocket) {
    const { room, snapshot } = this.roomStateService.updateSnapshot(payload.roomId, payload.playerId, payload.snapshot);
    client.to(room.id).emit('match:snapshot', { playerId: payload.playerId, snapshot });
  }

  @SubscribeMessage('match:resolve')
  handleResolve(@MessageBody() payload: MatchResolvePayload) {
    const resolved = this.roomStateService.resolveMatch(payload.roomId, payload.winnerId, payload.reason);
    if (!resolved) return;

    this.server.to(resolved.room.id).emit('match:resolved', resolved.result);
    this.server.to(resolved.room.id).emit('room:state', this.roomStateService.getPublicState(resolved.room));
  }
}
