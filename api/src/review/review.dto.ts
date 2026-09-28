import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const POLICY_VERSION = 'pilot-draft-1';

export const CLAIMS = [
  'identity',
  'document',
  'obligation_owner',
  'current_balance',
  'provider_payment',
  'other_assistance',
] as const;

// How strongly each fact is supported, from weakest to strongest.
export const RESULTS = [
  'unverified',
  'self_reported',
  'document_supported',
  'independently_confirmed',
] as const;

export const DECLINE_REASONS = [
  'outside_service_area',
  'outside_mission',
  'need_not_documented',
  'balance_not_outstanding',
  'already_covered',
  'could_not_verify',
  'other',
] as const;

export const VISIBILITIES = ['public', 'angels_only'] as const;

export class PublishDto {
  @IsString()
  @Length(30, 300, {
    message: 'Write a summary of 30 to 300 characters.',
  })
  summary: string;

  @IsIn(VISIBILITIES, { message: 'Choose who can see this need.' })
  visibility: (typeof VISIBILITIES)[number];
}

export class AddCheckDto {
  @IsIn(CLAIMS, { message: 'Choose what you checked.' })
  claim: (typeof CLAIMS)[number];

  @IsIn(RESULTS, { message: 'Choose what you found.' })
  result: (typeof RESULTS)[number];

  @IsString()
  @Length(3, 300, { message: 'Say how you checked it.' })
  method: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class MessageDto {
  @IsString()
  @Length(10, 2000, { message: 'Write at least 10 characters.' })
  message: string;
}

export class DecisionDto {
  @IsIn(['approved', 'declined'], { message: 'Choose approve or decline.' })
  outcome: 'approved' | 'declined';

  @IsString()
  @Length(20, 2000, {
    message: 'Give the reason in plain words, at least 20 characters.',
  })
  rationale: string;

  @ValidateIf((d: DecisionDto) => d.outcome === 'approved')
  @IsInt()
  @Min(1, { message: 'Enter the approved amount.' })
  approvedAmountCents?: number;

  @ValidateIf((d: DecisionDto) => d.outcome === 'approved')
  @IsString()
  @Length(2, 200, { message: 'Enter who will be paid.' })
  paymentDestination?: string;

  @ValidateIf((d: DecisionDto) => d.outcome === 'approved')
  @IsDateString({}, { message: 'Enter the date this approval expires.' })
  expiresOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  restrictions?: string;

  @ValidateIf((d: DecisionDto) => d.outcome === 'declined')
  @IsIn(DECLINE_REASONS, { message: 'Choose a reason for the decline.' })
  reasonCode?: (typeof DECLINE_REASONS)[number];
}
