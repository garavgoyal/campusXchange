import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard.js';
import {
  SupabaseAuthGuard,
  type AuthedUser,
} from '../../common/guards/supabase-auth.guard.js';
import { CreateListingDto } from './dto/create-listing.dto.js';
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
  ) {
    return this.listingsService.findLive({ type, category, search }, !!req.user);
  }

  /** The caller's own listings, including ones still pending review. */
  @Get('mine')
  @UseGuards(SupabaseAuthGuard)
  async findMine(@CurrentUser() user: AuthedUser) {
    return this.listingsService.findMine(user.id);
  }

  /** Upload one photo, get back a public URL to include in the create call. */
  @Post('images')
  @UseGuards(SupabaseAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.listingsService.uploadImage(user.id, file);
  }

  /** Public, same location rule as the feed. */
  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  async findOne(@Param('id') id: string, @Req() req: { user?: AuthedUser }) {
    return this.listingsService.findOne(id, !!req.user);
  }

  @Post()
  @UseGuards(SupabaseAuthGuard)
  async create(@Body() dto: CreateListingDto, @CurrentUser() user: AuthedUser) {
    return this.listingsService.create(user.id, dto);
  }

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    return this.listingsService.remove(id, user.id);
  }
}
