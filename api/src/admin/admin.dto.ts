import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { POLICY_KINDS } from '../catalog/catalog.service';
import { ROLES, type Role } from '../config';

const MAX_CAP_CENTS = 100_000_000;

export class InviteDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email: string;

  @IsIn(ROLES, { message: 'Choose a role.' })
  role: Role;
}

export class UpdateUserDto {
  @IsOptional()
  @IsIn(ROLES, { message: 'Choose a role.' })
  role?: Role;

  @IsOptional()
  @IsIn(['active', 'disabled'], { message: 'Choose on or off.' })
  status?: 'active' | 'disabled';
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(2, 60, { message: 'Enter a name of 2 to 60 characters.' })
  label?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200, { message: 'Enter a short description.' })
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(100, { message: 'Set a limit of at least $1.00.' })
  @Max(MAX_CAP_CENTS)
  maxAmountCents?: number;

  // Null turns the short form off for this need type.
  @ValidateIf((dto: UpdateCategoryDto) => dto.quickMaxCents !== null)
  @IsOptional()
  @IsInt()
  @Min(100, { message: 'Set a small-request limit of at least $1.00.' })
  @Max(MAX_CAP_CENTS)
  quickMaxCents?: number | null;

  @IsOptional()
  @IsBoolean()
  requiresDocument?: boolean;
}

export class PublishPolicyDto {
  @IsIn(POLICY_KINDS, { message: 'Choose which agreement to change.' })
  kind: (typeof POLICY_KINDS)[number];

  @IsString()
  @Length(20, 2000, { message: 'Write at least 20 characters.' })
  body: string;
}
