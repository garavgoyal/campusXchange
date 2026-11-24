import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * One negotiation step.
 *
 *   Sell     offered_price = the price
 *   Lend     offered_price = the rate per day/week (the listing's rent_unit)
 *   Exchange offered_price = the cash top-up (0 = straight swap), and the
 *            person asking to swap describes and photographs their own item.
 *            When the listing owner counters, the item is carried over from
 *            the last item offer — they only change the top-up.
 */
export class CreateOfferDto {
  @IsNumber() @Min(0)
  offered_price: number;

  /** Exchange only — what the person asking to swap is putting up. */
  @IsOptional() @IsString() @MaxLength(120)
  item_title?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  item_description?: string;

  /** Public URLs from POST /listings/images. */
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsString({ each: true })
  item_images?: string[];

  /** Exchange only — who adds the top-up. Required when offered_price > 0. */
  @IsOptional() @IsIn(['initiator', 'owner'])
  topup_payer?: 'initiator' | 'owner';
}
