import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  Roles,
} from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { JOURNAL_STAFF_ROLES } from '../config';
import {
  ArticleDto,
  AuthorDto,
  CategoryDto,
  CommentDto,
  CommentModerateDto,
  CommentReportDto,
  CorrectionDto,
  FeatureDto,
  NoteDto,
  PublishDto,
  ReactionDto,
  ReviewDto,
  SeriesDto,
  ShareDto,
  TokenDto,
} from './journal.dto';
import { JournalReaderService } from './reader.service';
import { JournalStudioService } from './studio.service';

const WRITES = { default: { ttl: 60_000, limit: 30 } };
const Id = (name = 'id') => Param(name, ParseUUIDPipe);

/** What anyone can read, signed in or not. */
@Controller('journal')
export class JournalController {
  constructor(
    private readonly reader: JournalReaderService,
    private readonly studio: JournalStudioService,
  ) {}

  @Get()
  home() {
    return this.reader.home();
  }

  @Get('articles')
  list(
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('series') series?: string,
    @Query('author') author?: string,
    @Query('kind') kind?: string,
    @Query('q') q?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ) {
    return this.reader.list({ category, tag, series, author, kind, q, page });
  }

  @Get('categories')
  categories() {
    return this.reader.categories();
  }

  @Get('series/:slug')
  series(@Param('slug') slug: string) {
    return this.reader.series(slug);
  }

  @Get('authors/:id')
  author(@Id() id: string) {
    return this.reader.author(id);
  }

  @Get('articles/:slug')
  @UseGuards(OptionalAuthGuard)
  article(
    @CurrentUser() viewer: SessionUser | undefined,
    @Param('slug') slug: string,
  ) {
    return this.reader.article(viewer, slug);
  }

  @Get('articles/:id/comments')
  @UseGuards(OptionalAuthGuard)
  comments(@CurrentUser() viewer: SessionUser | undefined, @Id() id: string) {
    return this.reader.comments(viewer, id);
  }

  @Post('articles/:id/view')
  @HttpCode(204)
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async viewed(
    @CurrentUser() viewer: SessionUser | undefined,
    @Id() id: string,
  ) {
    await this.reader.viewed(viewer, id);
  }

  @Get('everything')
  everything() {
    return this.reader.everything();
  }

  @Post('articles/:id/share')
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async shared(@Id() id: string, @Body() dto: ShareDto) {
    await this.reader.shared(id, dto.channel);
  }

  @Get('media/:id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async media(@Id() id: string) {
    const picture = await this.studio.media(id);
    return new StreamableFile(picture.bytes, { type: picture.mimeType });
  }

  @Post('unsubscribe')
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async unsubscribe(@Body() dto: TokenDto) {
    await this.reader.unsubscribe(dto.token);
  }
}

/** What a signed-in reader can do. */
@Controller('journal')
@UseGuards(AuthGuard)
export class JournalMemberController {
  constructor(private readonly reader: JournalReaderService) {}

  @Get('library')
  library(@CurrentUser() viewer: SessionUser) {
    return this.reader.library(viewer);
  }

  @Post('articles/:id/finished')
  @HttpCode(204)
  async finished(@CurrentUser() viewer: SessionUser, @Id() id: string) {
    await this.reader.finished(viewer, id);
  }

  @Put('articles/:id/reactions')
  react(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: ReactionDto,
  ) {
    return this.reader.react(viewer, id, dto.kind, true);
  }

  @Post('articles/:id/reactions/remove')
  @HttpCode(200)
  unreact(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: ReactionDto,
  ) {
    return this.reader.react(viewer, id, dto.kind, false);
  }

  @Put('articles/:id/saved')
  @HttpCode(204)
  async save(@CurrentUser() viewer: SessionUser, @Id() id: string) {
    await this.reader.save(viewer, id, true);
  }

  @Delete('articles/:id/saved')
  @HttpCode(204)
  async unsave(@CurrentUser() viewer: SessionUser, @Id() id: string) {
    await this.reader.save(viewer, id, false);
  }

  @Put('articles/:id/note')
  @HttpCode(204)
  async note(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: NoteDto,
  ) {
    await this.reader.note(viewer, id, dto.body);
  }

  @Post('articles/:id/comments')
  @Throttle(WRITES)
  comment(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: CommentDto,
  ) {
    return this.reader.comment(viewer, id, dto.body, dto.parentId);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  async removeComment(@CurrentUser() viewer: SessionUser, @Id() id: string) {
    await this.reader.removeComment(viewer, id);
  }

  @Post('comments/:id/report')
  @HttpCode(204)
  @Throttle(WRITES)
  async reportComment(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: CommentReportDto,
  ) {
    await this.reader.reportComment(viewer, id, dto.reason);
  }

  @Put('categories/:key/follow')
  @HttpCode(204)
  async follow(@CurrentUser() viewer: SessionUser, @Param('key') key: string) {
    await this.reader.follow(viewer, key, true);
  }

  @Delete('categories/:key/follow')
  @HttpCode(204)
  async unfollow(
    @CurrentUser() viewer: SessionUser,
    @Param('key') key: string,
  ) {
    await this.reader.follow(viewer, key, false);
  }
}

/** Where staff write, review, and publish. */
@Controller('journal/studio')
@UseGuards(AuthGuard)
@Roles(...JOURNAL_STAFF_ROLES)
export class JournalStudioController {
  constructor(private readonly studio: JournalStudioService) {}

  @Get('desk')
  desk(@CurrentUser() viewer: SessionUser) {
    return this.studio.desk(viewer);
  }

  @Get('articles')
  list(
    @CurrentUser() viewer: SessionUser,
    @Query('stage') stage?: string,
    @Query('mine') mine?: string,
    @Query('q') q?: string,
  ) {
    return this.studio.list(viewer, { stage, mine, q });
  }

  @Post('articles')
  @Throttle(WRITES)
  create(@CurrentUser() viewer: SessionUser, @Body() dto: ArticleDto) {
    return this.studio.create(viewer, dto);
  }

  @Get('articles/:id')
  get(@CurrentUser() viewer: SessionUser, @Id() id: string) {
    return this.studio.get(viewer, id);
  }

  @Patch('articles/:id')
  update(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: ArticleDto,
  ) {
    return this.studio.update(viewer, id, dto);
  }

  @Post('articles/:id/submit')
  @HttpCode(200)
  submit(@CurrentUser() viewer: SessionUser, @Id() id: string) {
    return this.studio.submit(viewer, id);
  }

  @Post('articles/:id/review')
  @HttpCode(200)
  review(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.studio.review(viewer, id, dto);
  }

  @Post('articles/:id/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: PublishDto,
  ) {
    return this.studio.publish(viewer, id, dto.publishAt);
  }

  @Post('articles/:id/unpublish')
  @HttpCode(200)
  unpublish(@CurrentUser() viewer: SessionUser, @Id() id: string) {
    return this.studio.unpublish(viewer, id);
  }

  @Post('articles/:id/archive')
  @HttpCode(200)
  archive(@CurrentUser() viewer: SessionUser, @Id() id: string) {
    return this.studio.archive(viewer, id, true);
  }

  @Post('articles/:id/restore')
  @HttpCode(200)
  restore(@CurrentUser() viewer: SessionUser, @Id() id: string) {
    return this.studio.archive(viewer, id, false);
  }

  @Put('articles/:id/featured')
  @HttpCode(204)
  async feature(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: FeatureDto,
  ) {
    await this.studio.feature(viewer, id, dto.featured);
  }

  @Post('articles/:id/corrections')
  @HttpCode(204)
  async correct(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: CorrectionDto,
  ) {
    await this.studio.correct(viewer, id, dto.body);
  }

  @Get('articles/:id/revisions/:revisionId')
  revision(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Id('revisionId') revisionId: string,
  ) {
    return this.studio.revision(viewer, id, revisionId);
  }

  @Post('articles/:id/revisions/:revisionId/restore')
  @HttpCode(200)
  restoreRevision(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Id('revisionId') revisionId: string,
  ) {
    return this.studio.restore(viewer, id, revisionId);
  }

  @Get('articles/:id/stats')
  stats(@Id() id: string) {
    return this.studio.stats(id);
  }

  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 6 * 1024 * 1024, files: 1 } }),
  )
  upload(
    @CurrentUser() viewer: SessionUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.studio.upload(viewer, file);
  }

  @Get('series')
  series() {
    return this.studio.seriesAll();
  }

  @Post('series')
  createSeries(@CurrentUser() viewer: SessionUser, @Body() dto: SeriesDto) {
    return this.studio.saveSeries(viewer, null, dto);
  }

  @Patch('series/:id')
  updateSeries(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: SeriesDto,
  ) {
    return this.studio.saveSeries(viewer, id, dto);
  }

  @Get('categories')
  categories() {
    return this.studio.categoriesAll();
  }

  @Post('categories')
  createCategory(@CurrentUser() viewer: SessionUser, @Body() dto: CategoryDto) {
    return this.studio.saveCategory(viewer, null, dto);
  }

  @Patch('categories/:key')
  updateCategory(
    @CurrentUser() viewer: SessionUser,
    @Param('key') key: string,
    @Body() dto: CategoryDto,
  ) {
    return this.studio.saveCategory(viewer, key, dto);
  }

  @Get('byline')
  byline(@CurrentUser() viewer: SessionUser) {
    return this.studio.byline(viewer);
  }

  @Put('byline')
  @HttpCode(204)
  async saveByline(@CurrentUser() viewer: SessionUser, @Body() dto: AuthorDto) {
    await this.studio.saveByline(viewer, dto);
  }

  @Get('comments')
  commentQueue() {
    return this.studio.commentQueue();
  }

  @Post('comments/:id')
  @HttpCode(204)
  async moderateComment(
    @CurrentUser() viewer: SessionUser,
    @Id() id: string,
    @Body() dto: CommentModerateDto,
  ) {
    await this.studio.moderateComment(viewer, id, dto.action);
  }
}
