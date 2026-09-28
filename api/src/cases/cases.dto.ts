import {
  Equals,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const CASE_KINDS = ['standard', 'quick'] as const;
export const RECURRENCES = ['one_time', 'recurring'] as const;
export const LISTING_PREFERENCES = ['public', 'angels_only'] as const;
export const EVIDENCE_KINDS = [
  'bill',
  'notice',
  'invoice',
  'receipt',
  'other',
] as const;

// Guards the integer column only. The real limit is each need type's cap.
const MAX_STORABLE_CENTS = 100_000_000;

const isStandard = (dto: CreateCaseDto) => dto.kind === 'standard';

export class CreateCaseDto {
  @IsIn(CASE_KINDS, { message: 'Choose a full or a small request.' })
  kind: (typeof CASE_KINDS)[number];

  @IsString()
  @Matches(/^[a-z_]{2,40}$/, { message: 'Choose the kind of help you need.' })
  category: string;

  @IsString()
  @Length(10, 2000, {
    message: 'Tell us what you need in at least 10 characters.',
  })
  whatHappened: string;

  @IsInt()
  @Min(100, { message: 'Enter an amount of at least $1.00.' })
  @Max(MAX_STORABLE_CENTS)
  amountRequestedCents: number;

  @ValidateIf(isStandard)
  @IsDateString({}, { message: 'Enter the date the payment is due.' })
  dueDate?: string;

  @ValidateIf((dto: CreateCaseDto) => isStandard(dto) || !!dto.providerName)
  @IsString()
  @Length(2, 120, { message: 'Enter who the payment is owed to.' })
  providerName?: string;

  @ValidateIf(isStandard)
  @IsString()
  @Length(5, 1000, { message: 'Tell us what happens if this is not paid.' })
  consequence?: string;

  @ValidateIf(isStandard)
  @IsIn(RECURRENCES, {
    message: 'Tell us if this is a one-time or a recurring need.',
  })
  recurrence?: (typeof RECURRENCES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STORABLE_CENTS)
  alreadyPaidCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STORABLE_CENTS)
  otherAssistanceCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  otherAssistanceNote?: string;

  @IsOptional()
  @IsIn(LISTING_PREFERENCES, { message: 'Choose who may see your need.' })
  listingPreference?: (typeof LISTING_PREFERENCES)[number];

  @IsString()
  @Length(2, 80, { message: 'Enter your city.' })
  city: string;

  @IsString()
  @Length(2, 40, { message: 'Enter your state.' })
  region: string;
}

export class SubmitCaseDto {
  @Equals(true, {
    message: 'Give your consent for us to review this request.',
  })
  consent: boolean;

  @Equals(true, {
    message: 'Confirm that the information you gave is accurate.',
  })
  attest: boolean;
}
