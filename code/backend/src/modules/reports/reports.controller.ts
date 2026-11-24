import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { SupabaseAuthGuard, type AuthedUser } from '../../common/guards/supabase-auth.guard.js';
import { CreateReportDto, ResolveReportDto, TakedownDto } from './dto/report.dto.js';
import { ReportsService } from './reports.service.js';

/** Any signed-in student can report what they have seen. */
@Controller('reports')
@UseGuards(SupabaseAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(@Body() dto: CreateReportDto, @CurrentUser() user: AuthedUser) {
    return this.reports.create(user.id, dto);
  }
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports')
  listOpen() {
    return this.reports.listOpen();
  }

  @Post('reports/:id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
    @CurrentUser() admin: AuthedUser,
  ) {
    return this.reports.resolve(id, admin.id, dto.outcome, dto.note.trim());
  }

  /** Take a listing off the feed, with or without a report. */
  @Post('listings/:id/takedown')
  takedown(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TakedownDto, @CurrentUser() admin: AuthedUser) {
    return this.reports.takedown(id, admin.id, dto.reason.trim());
  }
}
