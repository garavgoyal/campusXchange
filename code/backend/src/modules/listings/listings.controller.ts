import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { LISTING_CREATE_LIMIT, UPLOAD_LIMIT } from '../../common/security/rate-limit.js';
import { IMAGE_UPLOAD_OPTIONS } from '../../common/uploads/image-file.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard.js';
import {
  SupabaseAuthGuard,
  type AuthedUser,
} from '../../common/guards/supabase-auth.guard.js';
import { VerifiedStudentGuard } from '../../common/guards/verified-student.guard.js';
import { CreateListingDto, UpdateListingDto } from './dto/create-listing.dto.js';
import { ListingsService } from './listings.service.js';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  /** Public — guests may browse, but meeting_location is stripped for them. */
  @Get()
  @UseGuards(OptionalAuthGuard)
  async findLive(
    @Req() req: { user?: AuthedUser },
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: string,
  ) {
    return this.listingsService.findLive(
      {
        type,
        category,
        search,
        limit: limit ? Number(limit) || undefined : undefined,
        offset: offset ? Number(offset) || 0 : 0,
        sort: sort === 'nearest' ? 'nearest' : 'newest',
      },
      req.user?.id ?? null,
    );
  }

  /** The caller's own listings, including ones still pending review. */
  @Get('mine')
  @UseGuards(SupabaseAuthGuard)
  async findMine(@CurrentUser() user: AuthedUser) {
    return this.listingsService.findMine(user.id);
  }

  /** Upload one photo, get back a public URL to include in the create call. */
  @Post('images')
  @Throttle(UPLOAD_LIMIT)
  @UseGuards(VerifiedStudentGuard)
  @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD_OPTIONS))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.listingsService.uploadImage(user.id, file);
  }

  /** Public, same location rule as the feed. */
  /** Exchange only: other students' live listings that fit what this one wants. */
  @Get(':id/matches')
  @UseGuards(OptionalAuthGuard)
  async matches(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user?: AuthedUser }) {
    return this.listingsService.matchesFor(id, req.user?.id ?? null);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  async findOne(@Param('id') id: string, @Req() req: { user?: AuthedUser }) {
    return this.listingsService.findOne(id, req.user?.id ?? null);
  }

  @Post()
  @Throttle(LISTING_CREATE_LIMIT)
  @UseGuards(VerifiedStudentGuard)
  async create(@Body() dto: CreateListingDto, @CurrentUser() user: AuthedUser) {
    return this.listingsService.create(user.id, dto);
  }

  /** Owner edits; the listing goes back to pending_review for moderation. */
  @Patch(':id')
  @UseGuards(VerifiedStudentGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.listingsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    return this.listingsService.remove(id, user.id);
  }
}
