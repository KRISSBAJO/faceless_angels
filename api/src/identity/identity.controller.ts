import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard, CurrentUser, Roles } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { REVIEW_ROLES } from '../config';
import { IdentityService } from './identity.service';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

class IdentityDecisionDto {
  @IsIn(['verified', 'rejected'], { message: 'Choose accept or reject.' })
  outcome: 'verified' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller('identity')
@UseGuards(AuthGuard)
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  mine(@CurrentUser() user: SessionUser) {
    return this.identity.mine(user);
  }

  @Post('documents')
  @HttpCode(204)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }),
  )
  async upload(
    @CurrentUser() user: SessionUser,
    @Body('docType') docType: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    await this.identity.upload(user, docType, file);
  }

  @Get('review')
  @Roles(...REVIEW_ROLES)
  queue(@CurrentUser() user: SessionUser) {
    return this.identity.queue(user);
  }

  @Get('review/:id/file')
  @Roles(...REVIEW_ROLES)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async file(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const doc = await this.identity.open(user, id);
    return new StreamableFile(doc.bytes, {
      type: doc.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    });
  }

  @Post('review/:id/decision')
  @HttpCode(204)
  @Roles(...REVIEW_ROLES)
  async decide(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IdentityDecisionDto,
  ) {
    await this.identity.decide(user, id, dto.outcome, dto.note);
  }
}
