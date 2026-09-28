import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ACTIONS, KINDS, REACTIONS, SHARE_CHANNELS } from './journal.shared';

const KEY = /^[a-z][a-z0-9_]{1,39}$/;

export class ScriptureDto {
  @IsString()
  @Length(3, 80, { message: 'Enter the reference, like Matthew 6:3-4.' })
  ref: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;
}

export class ArticleDto {
  @IsString()
  @Length(3, 160, { message: 'Enter a title of 3 to 160 characters.' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60_000, { message: 'The article is too long.' })
  body?: string;

  @IsIn(KINDS, { message: 'Choose what kind of article this is.' })
  kind: (typeof KINDS)[number];

  @Matches(KEY, { message: 'Choose a category.' })
  categoryKey: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: 'Use up to 8 tags.' })
  @IsString({ each: true })
  @Length(2, 30, { each: true, message: 'Each tag is 2 to 30 characters.' })
  tags?: string[];

  @IsOptional()
  @ValidateIf((dto: ArticleDto) => dto.coverMediaId !== null)
  @IsUUID('4')
  coverMediaId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  coverAlt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'Use up to 12 scripture references.' })
  @ValidateNested({ each: true })
  @Type(() => ScriptureDto)
  scripture?: ScriptureDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6, { message: 'Use up to 6 questions.' })
  @IsString({ each: true })
  @Length(5, 300, { each: true, message: 'Each question is 5 to 300 characters.' })
  reflection?: string[];

  @IsOptional()
  @IsIn(ACTIONS, { message: 'Choose how the article ends.' })
  action?: (typeof ACTIONS)[number];

  @IsOptional()
  @ValidateIf((dto: ArticleDto) => dto.seriesId !== null)
  @IsUUID('4')
  seriesId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  seriesPosition?: number;

  @IsOptional()
  @IsBoolean()
  allowComments?: boolean;

  // A few words on what changed, kept with the revision.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ReviewDto {
  @IsIn(['approve', 'changes'], { message: 'Choose approve or ask for changes.' })
  action: 'approve' | 'changes';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class PublishDto {
  // Leave empty to publish now. A later time schedules it.
  @IsOptional()
  @IsDateString({}, { message: 'Enter the date and time to publish.' })
  publishAt?: string;
}

export class FeatureDto {
  @IsBoolean()
  featured: boolean;
}

export class CorrectionDto {
  @IsString()
  @Length(10, 1000, { message: 'Say what was corrected, in 10 to 1,000 characters.' })
  body: string;
}

export class SeriesDto {
  @IsString()
  @Length(3, 120, { message: 'Enter a title of 3 to 120 characters.' })
  title: string;

  @IsString()
  @Length(10, 600, { message: 'Describe the series in 10 to 600 characters.' })
  description: string;
}

export class CategoryDto {
  @IsString()
  @Length(2, 40, { message: 'Enter a name of 2 to 40 characters.' })
  label: string;

  @IsString()
  @Length(5, 200, { message: 'Enter a short description.' })
  description: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sort?: number;
}

export class AuthorDto {
  @IsString()
  @Length(2, 80, { message: 'Enter the name to show on your articles.' })
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  bio?: string;

  @IsOptional()
  @ValidateIf((dto: AuthorDto) => dto.photoMediaId !== null)
  @IsUUID('4')
  photoMediaId?: string | null;
}

export class ReactionDto {
  @IsIn(REACTIONS, { message: 'Choose a reaction.' })
  kind: (typeof REACTIONS)[number];
}

export class CommentDto {
  @IsString()
  @Length(2, 1500, { message: 'Write 2 to 1,500 characters.' })
  body: string;

  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}

export class CommentReportDto {
  @IsString()
  @Length(5, 300, { message: 'Tell us what is wrong in a few words.' })
  reason: string;
}

export class CommentModerateDto {
  @IsIn(['approve', 'hide'], { message: 'Choose show or hide.' })
  action: 'approve' | 'hide';
}

export class NoteDto {
  @IsString()
  @MaxLength(5000, { message: 'Keep your note under 5,000 characters.' })
  body: string;
}

export class ShareDto {
  @IsIn(SHARE_CHANNELS, { message: 'Choose where it was shared.' })
  channel: (typeof SHARE_CHANNELS)[number];
}

export class TokenDto {
  @IsString()
  @Length(20, 300)
  token: string;
}
