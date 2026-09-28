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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, Roles } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { REVIEW_ROLES } from '../config';
import {
  AddCheckDto,
  DecisionDto,
  MessageDto,
  PublishDto,
} from './review.dto';
import { ReviewService } from './review.service';

@Controller('review/cases')
@UseGuards(AuthGuard)
@Roles(...REVIEW_ROLES)
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get()
  queue(@CurrentUser() user: SessionUser) {
    return this.review.queue(user);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.review.detail(user, id);
  }

  @Get(':id/evidence/:evidenceId/file')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async file(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    const doc = await this.review.openEvidence(user, id, evidenceId);
    return new StreamableFile(doc.bytes, {
      type: doc.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    });
  }

  @Post(':id/claim')
  @HttpCode(200)
  claim(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.review.claim(user, id);
  }

  @Post(':id/release')
  @HttpCode(200)
  release(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.review.release(user, id);
  }

  @Post(':id/checks')
  @HttpCode(204)
  addCheck(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCheckDto,
  ) {
    return this.review.addCheck(user, id, dto);
  }

  @Post(':id/request-info')
  @HttpCode(200)
  requestInfo(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageDto,
  ) {
    return this.review.requestInfo(user, id, dto.message);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
  ) {
    return this.review.publish(user, id, dto);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageDto,
  ) {
    return this.review.unpublish(user, id, dto.message);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.review.decide(user, id, dto);
  }
}
