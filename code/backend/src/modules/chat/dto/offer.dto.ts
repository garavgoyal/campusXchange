import { IsNumber, Min } from 'class-validator';

export class CreateOfferDto {
  @IsNumber() @Min(0)
  offered_price: number;
}
