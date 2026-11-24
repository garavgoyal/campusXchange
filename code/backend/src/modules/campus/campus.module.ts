import { Global, Module } from '@nestjs/common';
import { CampusController } from './campus.controller.js';
import { CampusService } from './campus.service.js';

/** Global: profiles validate hostels and the feed measures distances with it. */
@Global()
@Module({
  controllers: [CampusController],
  providers: [CampusService],
  exports: [CampusService],
})
export class CampusModule {}
