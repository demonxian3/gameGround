"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RoomGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const room_state_service_1 = require("./room-state.service");
let RoomGateway = RoomGateway_1 = class RoomGateway {
    constructor(roomStateService) {
        this.roomStateService = roomStateService;
        this.logger = new common_1.Logger(RoomGateway_1.name);
    }
    handleConnection(client) {
        this.logger.debug(`socket connected: ${client.id}`);
    }
    handleDisconnect(client) {
        const { roomId, playerId } = client.data;
        if (!roomId || !playerId)
            return;
        const room = this.roomStateService.removePlayer(roomId, playerId);
        if (room.players.length > 0) {
            this.server.to(room.id).emit('room:state', this.roomStateService.getPublicState(room));
        }
    }
    handleJoin(payload, client) {
        const room = this.roomStateService.joinRoom(payload);
        client.data.roomId = room.id;
        client.data.playerId = payload.player.id;
        void client.join(room.id);
        this.server.to(room.id).emit('room:state', this.roomStateService.getPublicState(room));
    }
    handleRename(payload) {
        const room = this.roomStateService.renamePlayer(payload);
        if (!room)
            return;
        this.server.to(room.id).emit('room:state', this.roomStateService.getPublicState(room));
    }
    handleSnapshot(payload, client) {
        const { room, snapshot } = this.roomStateService.updateSnapshot(payload.roomId, payload.playerId, payload.snapshot);
        client.to(room.id).emit('match:snapshot', { playerId: payload.playerId, snapshot });
    }
    handleResolve(payload) {
        const resolved = this.roomStateService.resolveMatch(payload.roomId, payload.winnerId, payload.reason);
        if (!resolved)
            return;
        this.server.to(resolved.room.id).emit('match:resolved', resolved.result);
        this.server.to(resolved.room.id).emit('room:state', this.roomStateService.getPublicState(resolved.room));
    }
};
exports.RoomGateway = RoomGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RoomGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:join'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:rename'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "handleRename", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('match:snapshot'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "handleSnapshot", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('match:resolve'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "handleResolve", null);
exports.RoomGateway = RoomGateway = RoomGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    __metadata("design:paramtypes", [room_state_service_1.RoomStateService])
], RoomGateway);
//# sourceMappingURL=room.gateway.js.map