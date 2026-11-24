import { Controller, Get } from '@nestjs/common';
import { CampusService } from './campus.service.js';

@Controller('campus')
export class CampusController {
  constructor(private readonly campus: CampusService) {}

  /** Public — hostels (for the profile picker) and meeting points (for listings). */
  @Get('locations')
  async locations() {
    const rows = await this.campus.all();
    return rows.map(({ aliases: _aliases, sort_order: _order, ...rest }) => rest);
  }
}
