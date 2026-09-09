import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const LISTING_TYPES = ['sell', 'lend', 'exchange'] as const;
export const RENT_UNITS = ['day', 'week'] as const;

export class CreateListingDto {
  @IsIn(LISTING_TYPES)
  type: 'sell' | 'lend' | 'exchange';

  @IsString() @MinLength(3) @MaxLength(120)
  title: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsString() @MinLength(1) @MaxLength(60)
  category: string;

  @IsOptional() @IsString() @MaxLength(60)
  condition?: string;

  /** Sell only */
  @IsOptional() @IsNumber() @Min(0)
  price?: number;

  /** Lend only */
  @IsOptional() @IsNumber() @Min(0)
  rent_amount?: number;

  @IsOptional() @IsIn(RENT_UNITS)
  rent_unit?: 'day' | 'week';

  /** Exchange only */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true })
  want_tags?: string[];

  @IsOptional() @IsString() @MaxLength(120)
  meeting_location?: string;

  /** Public URLs returned by POST /listings/images */
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true })
  images?: string[];
}
