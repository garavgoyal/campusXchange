import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return { status: 'ok', service: 'campusxchange-backend', time: new Date().toISOString() };
  }
}
