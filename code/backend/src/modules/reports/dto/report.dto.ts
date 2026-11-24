import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const REPORT_REASONS = ['prohibited', 'scam', 'fake', 'wrong_info', 'offensive', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** POST /reports — report a listing OR a person (exactly one). */
export class CreateReportDto {
  @IsOptional() @IsUUID()
  listing_id?: string;

  @IsOptional() @IsUUID()
  user_id?: string;

  @IsIn(REPORT_REASONS)
  reason: ReportReason;

  @IsOptional() @IsString() @MaxLength(1000)
  details?: string;
}

/** POST /admin/reports/:id/resolve */
export class ResolveReportDto {
  /** actioned: for a listing this takes it down; for a person it records that you dealt with it. */
  @IsIn(['actioned', 'dismissed'])
  outcome: 'actioned' | 'dismissed';

  @IsString() @MinLength(3) @MaxLength(300)
  note: string;
}

/** POST /admin/listings/:id/takedown */
export class TakedownDto {
  @IsString() @MinLength(3) @MaxLength(300)
  reason: string;
}
