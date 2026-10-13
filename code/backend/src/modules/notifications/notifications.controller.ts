import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SupabaseAuthGuard, type AuthedUser } from '../../common/guards/supabase-auth.guard.js';
import { NotificationsService } from './notifications.service.js';

class SubscriptionsDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true })
  categories: string[];
}

/** Your own inbox only — every query is scoped to the caller's id. */
@Controller('notifications')
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthedUser) {
    return this.notifications.list(user.id);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthedUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  read(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthedUser) {
    return this.notifications.markRead(user.id, id);
  }

  @Get('subscriptions')
  subscriptions(@CurrentUser() user: AuthedUser) {
    return this.notifications.getSubscriptions(user.id);
  }

  @Put('subscriptions')
  setSubscriptions(@Body() dto: SubscriptionsDto, @CurrentUser() user: AuthedUser) {
    return this.notifications.setSubscriptions(user.id, dto.categories);
  }
}
