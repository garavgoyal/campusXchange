import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  /** Thapar roll numbers are 9-10 digits (e.g. 1024030098). */
  @IsOptional()
  @Matches(/^\d{9,10}$/, { message: 'Roll number must be 9 or 10 digits' })
  roll_number?: string;
}
