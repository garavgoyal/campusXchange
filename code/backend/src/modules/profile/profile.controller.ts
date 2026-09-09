import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SupabaseAuthGuard, type AuthedUser } from '../../common/guards/supabase-auth.guard.js';
import { ProfileService } from './profile.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { ProfileMeDto, UploadIdCardResponseDto } from './dto/upload-id-card.dto.js';

@Controller('profile')
@UseGuards(SupabaseAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /** POST /profile/id-card — multipart form field name: "file" */
  @Post('id-card')
  @UseInterceptors(FileInterceptor('file'))
  async uploadIdCard(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthedUser,
  ): Promise<UploadIdCardResponseDto> {
    return this.profileService.uploadIdCard(user.id, file);
  }

  /** PATCH /profile — name and/or roll number */
  @Patch()
  async updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: AuthedUser) {
    return this.profileService.updateProfile(user.id, dto);
  }

  /** GET /profile/me */
  @Get('me')
  async getMe(@CurrentUser() user: AuthedUser): Promise<ProfileMeDto> {
    return this.profileService.getMe(user.id);
  }
}
