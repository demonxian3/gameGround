import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return {
      ok: true,
      service: 'arcadia-grid-room-server',
      timestamp: Date.now(),
    };
  }
}
