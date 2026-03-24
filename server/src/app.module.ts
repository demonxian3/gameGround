import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { RoomGateway } from './rooms/room.gateway';
import { RoomStateService } from './rooms/room-state.service';

@Module({
  controllers: [AppController],
  providers: [RoomGateway, RoomStateService],
})
export class AppModule {}
