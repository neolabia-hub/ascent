import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators.js';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'neo-pulse-api', time: new Date().toISOString() };
  }
}
