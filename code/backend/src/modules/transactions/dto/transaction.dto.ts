import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Seller picks the buyer from one negotiation thread and locks the deal. */
export class CreateTransactionDto {
  @IsUUID()
  chat_id: string;

  /** Lend only — first day the borrower has the item (YYYY-MM-DD). */
  @IsOptional() @IsDateString()
  start_date?: string;

  /** Lend only — day it must be back (YYYY-MM-DD). */
  @IsOptional() @IsDateString()
  end_date?: string;

  /** Lend only — refundable security deposit held alongside the rent. */
  @IsOptional() @IsNumber() @Min(0)
  deposit_amount?: number;

  /**
   * Where the handoff happens — a name from GET /campus/locations. Defaults to
   * the listing's meeting point. Shown to the buyer before they pay.
   */
  @IsOptional() @IsString() @MaxLength(120)
  meeting_location?: string;
}

export class ScanQrDto {
  /** The 8-character code (typed) or the full "CX:<txId>:<code>" QR payload (scanned). */
  @IsString() @MinLength(6) @MaxLength(80)
  @Matches(/^[A-Za-z0-9:-]+$/)
  token: string;
}

export class PhotoStageDto {
  @IsIn(['handoff', 'return'])
  stage: 'handoff' | 'return';
}

export class RaiseDisputeDto {
  @IsString() @MinLength(10) @MaxLength(1000)
  reason: string;
}

export class ReviewDisputeDto {
  @IsString() @MinLength(3) @MaxLength(1000)
  note: string;
}

export class ResolveDisputeDto {
  /** release = escrow goes to the seller · refund = escrow goes back to the buyer. */
  @IsIn(['release', 'refund'])
  outcome: 'release' | 'refund';

  @IsString() @MinLength(5) @MaxLength(1000)
  resolution: string;

  /** A fixed tier (see PENALTY_TIERS in disputes.service.ts) — not a free amount. */
  @IsOptional() @IsIn(['minor', 'moderate', 'severe'])
  penalty_tier?: 'minor' | 'moderate' | 'severe';

  @IsOptional() @IsIn(['buyer', 'seller'])
  penalty_party?: 'buyer' | 'seller';
}
