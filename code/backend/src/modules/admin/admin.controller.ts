import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import type { AuthedUser } from '../../common/guards/supabase-auth.guard.js';
import { AdminService } from './admin.service.js';

class RejectDto {
  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}

class IdDecisionDto {
  @IsIn(['verified', 'rejected'])
  decision: 'verified' | 'rejected';
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('moderation')
  pendingListings() {
    return this.adminService.pendingListings();
  }

  @Post('moderation/:listingId/approve')
  approve(@Param('listingId') listingId: string, @CurrentUser() admin: AuthedUser) {
    return this.adminService.approveListing(listingId, admin.id);
  }

  @Post('moderation/:listingId/reject')
  reject(
    @Param('listingId') listingId: string,
    @Body() dto: RejectDto,
    @CurrentUser() admin: AuthedUser,
  ) {
    return this.adminService.rejectListing(listingId, admin.id, dto.reason ?? 'Not specified');
  }

  @Get('id-verifications')
  pendingIds() {
    return this.adminService.pendingIdVerifications();
  }

  @Post('id-verifications/:userId')
  decideId(@Param('userId') userId: string, @Body() dto: IdDecisionDto) {
    return this.adminService.decideIdVerification(userId, dto.decision);
  }
}
