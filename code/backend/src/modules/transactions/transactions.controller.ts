import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { SupabaseAuthGuard, type AuthedUser } from '../../common/guards/supabase-auth.guard.js';
import { VerifiedStudentGuard } from '../../common/guards/verified-student.guard.js';
import { DisputesService } from './disputes.service.js';
import {
  CreateTransactionDto,
  PhotoStageDto,
  RaiseDisputeDto,
  ResolveDisputeDto,
  ReviewDisputeDto,
  ScanQrDto,
} from './dto/transaction.dto.js';
import { TransactionsService } from './transactions.service.js';

/**
 * Deals. Reading needs a session; every action that moves a deal forward needs
 * a verified student ID (VerifiedStudentGuard). Each service method also checks
 * that the caller is the buyer or seller of that specific deal.
 */
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @UseGuards(SupabaseAuthGuard)
  listMine(@CurrentUser() user: AuthedUser) {
    return this.transactions.listMine(user.id);
  }

  @Get('by-chat/:chatId')
  @UseGuards(SupabaseAuthGuard)
  forChat(@Param('chatId', ParseUUIDPipe) chatId: string, @CurrentUser() user: AuthedUser) {
    return this.transactions.forChat(chatId, user.id);
  }

  @Get(':id')
  @UseGuards(SupabaseAuthGuard)
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthedUser) {
    return this.transactions.detail(id, user.id);
  }

  @Post()
  @UseGuards(VerifiedStudentGuard)
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: AuthedUser) {
    return this.transactions.create(user.id, dto);
  }

  @Post(':id/pay')
  @UseGuards(VerifiedStudentGuard)
  pay(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthedUser) {
    return this.transactions.pay(id, user.id);
  }

  @Post(':id/qr')
  @UseGuards(VerifiedStudentGuard)
  issueQr(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthedUser) {
    return this.transactions.issueQr(id, user.id);
  }

  /** multipart/form-data: field "file" (image) + field "stage" (handoff | return). */
  @Post(':id/photos')
  @UseGuards(VerifiedStudentGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PhotoStageDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.transactions.uploadPhoto(id, user.id, dto.stage, file);
  }

  @Post(':id/scan')
  @UseGuards(VerifiedStudentGuard)
  scan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScanQrDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.transactions.scan(id, user.id, dto.token);
  }

  @Post(':id/cancel')
  @UseGuards(VerifiedStudentGuard)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthedUser) {
    return this.transactions.cancel(id, user.id);
  }

  @Post(':id/dispute')
  @UseGuards(VerifiedStudentGuard)
  dispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RaiseDisputeDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.transactions.raiseDispute(id, user.id, dto.reason);
  }
}

/** Admin dispute queue. AdminGuard re-reads the role from the database every request. */
@Controller('admin/disputes')
@UseGuards(AdminGuard)
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  list() {
    return this.disputes.listOpen();
  }

  @Post(':id/review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDisputeDto,
    @CurrentUser() admin: AuthedUser,
  ) {
    return this.disputes.review(id, admin.id, dto.note);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() admin: AuthedUser,
  ) {
    return this.disputes.resolve(id, admin.id, dto);
  }
}
