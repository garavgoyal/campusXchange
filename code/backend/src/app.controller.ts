import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Health check — handy for confirming the phone can reach this server. */
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
