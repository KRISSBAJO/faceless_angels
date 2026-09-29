import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CheckoutDto {
  @IsIn(['usd', 'ngn'], { message: 'Choose US dollars or naira.' })
  currency!: 'usd' | 'ngn';

  @IsIn(['one_time', 'monthly'], { message: 'Choose once or monthly.' })
  kind!: 'one_time' | 'monthly';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter an amount, like 25 or 25.50.' })
  @Min(0.01, { message: 'Enter an amount.' })
  amount!: number;

  @IsEmail({}, { message: 'Enter the email address for your receipt.' })
  @MaxLength(254)
  email!: string;
}

export class LedgerEntryDto {
  @IsIn(['expense', 'help'])
  kind!: 'expense' | 'help';

  @IsString()
  @MaxLength(40)
  category!: string;

  @IsString()
  @MinLength(3, { message: 'Say what the money was for.' })
  @MaxLength(300)
  description!: string;

  @IsString()
  @MinLength(2, { message: 'Say who was paid.' })
  @MaxLength(120)
  payee!: string;

  @IsIn(['usd', 'ngn'], { message: 'Choose US dollars or naira.' })
  currency!: 'usd' | 'ngn';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter the amount paid.' })
  @Min(0.01, { message: 'Enter the amount paid.' })
  amount!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter the date it was paid.' })
  paidOn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  caseRef?: string;
}

export class LedgerDecisionDto {
  @IsIn(['approved', 'rejected'])
  outcome!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
