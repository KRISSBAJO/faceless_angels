import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard, CurrentUser, Roles } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { PRAYER_MODERATOR_ROLES, PRAYER_TEAM_ROLES } from '../config';
import { PrayerGroupsService } from './groups.service';
import { PrayerModerationService } from './moderation.service';
import {
  AnsweredDto,
  AttendDto,
  BlockDto,
  CreateGroupDto,
  CreatePrayerDto,
  EditPrayerDto,
  GroupDecisionDto,
  GroupDto,
  InviteMemberDto,
  JoinDto,
  MemberActionDto,
  ModerateDto,
  ReportDto,
  ResolveReportDto,
  ResponseDto,
  SessionDto,
} from './prayer.dto';
import {
  CRISIS_RESOURCES,
  PLATFORM_CODE_OF_CONDUCT,
} from './prayer.shared';
import { PrayerRequestsService } from './requests.service';
import { PrayerSessionsService } from './sessions.service';
import {
  CampaignDto,
  ChainDto,
  PrayerTogetherService,
  SlotDto,
} from './together.service';

const WRITES = { default: { ttl: 60_000, limit: 20 } };
const Id = (name = 'id') => Param(name, ParseUUIDPipe);

/** Published testimonies are the one part of prayer open to visitors. */
@Controller('prayer')
export class PrayerPublicController {
  constructor(
    private readonly requests: PrayerRequestsService,
    private readonly sessions: PrayerSessionsService,
    private readonly groups: PrayerGroupsService,
  ) {}

  /** For the home page. */
  @Get('overview')
  async overview() {
    const [groups, testimonies] = await Promise.all([
      this.groups.publicList(),
      this.requests.testimonies(),
    ]);
    return { ...groups, testimonies: testimonies.slice(0, 3) };
  }

  @Get('testimonies')
  testimonies() {
    return this.requests.testimonies();
  }

  @Get('about')
  about() {
    return {
      codeOfConduct: PLATFORM_CODE_OF_CONDUCT,
      crisisResources: CRISIS_RESOURCES,
      providers: this.sessions.providers(),
    };
  }
}

@Controller('prayer')
@UseGuards(AuthGuard)
export class PrayerController {
  constructor(
    private readonly requests: PrayerRequestsService,
    private readonly groups: PrayerGroupsService,
    private readonly sessions: PrayerSessionsService,
    private readonly moderation: PrayerModerationService,
    private readonly together: PrayerTogetherService,
  ) {}

  // ---- Requests

  @Get('network')
  network(@CurrentUser() user: SessionUser) {
    return this.requests.network(user);
  }

  @Get('requests/mine')
  mine(@CurrentUser() user: SessionUser) {
    return this.requests.mine(user);
  }

  @Post('requests')
  @Throttle(WRITES)
  create(@CurrentUser() user: SessionUser, @Body() dto: CreatePrayerDto) {
    return this.requests.create(user, dto);
  }

  @Get('requests/:id')
  get(@CurrentUser() user: SessionUser, @Id() id: string) {
    return this.requests.get(user, id);
  }

  @Patch('requests/:id')
  edit(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: EditPrayerDto,
  ) {
    return this.requests.edit(user, id, dto);
  }

  @Delete('requests/:id')
  @HttpCode(204)
  async withdraw(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.requests.withdraw(user, id);
  }

  @Put('requests/:id/prayed')
  @HttpCode(204)
  async prayed(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.requests.prayed(user, id, true);
  }

  @Delete('requests/:id/prayed')
  @HttpCode(204)
  async notPrayed(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.requests.prayed(user, id, false);
  }

  @Put('requests/:id/follow')
  @HttpCode(204)
  async follow(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.requests.follow(user, id, true);
  }

  @Delete('requests/:id/follow')
  @HttpCode(204)
  async unfollow(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.requests.follow(user, id, false);
  }

  @Post('requests/:id/responses')
  @Throttle(WRITES)
  respond(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: ResponseDto,
  ) {
    return this.requests.respond(user, id, dto.body);
  }

  @Post('requests/:id/answered')
  @HttpCode(200)
  answered(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: AnsweredDto,
  ) {
    return this.requests.answered(user, id, dto);
  }

  @Post('requests/:id/forward')
  @HttpCode(204)
  async forward(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.requests.forward(user, id);
  }

  @Post('requests/:id/report')
  @HttpCode(204)
  @Throttle(WRITES)
  async reportRequest(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: ReportDto,
  ) {
    await this.requests.report(user, 'request', id, dto.reason);
  }

  @Post('responses/:id/report')
  @HttpCode(204)
  @Throttle(WRITES)
  async reportResponse(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: ReportDto,
  ) {
    await this.requests.report(user, 'response', id, dto.reason);
  }

  @Get('blocks')
  blocks(@CurrentUser() user: SessionUser) {
    return this.requests.blocks(user);
  }

  @Post('blocks')
  @HttpCode(204)
  async block(@CurrentUser() user: SessionUser, @Body() dto: BlockDto) {
    await this.requests.block(user, dto.type, dto.id);
  }

  @Delete('blocks')
  @HttpCode(204)
  async clearBlocks(@CurrentUser() user: SessionUser) {
    await this.requests.clearBlocks(user);
  }

  // ---- Groups

  @Get('groups')
  directory(
    @CurrentUser() user: SessionUser,
    @Query('q') q?: string,
    @Query('language') language?: string,
    @Query('region') region?: string,
    @Query('theme') theme?: string,
    @Query('church') church?: string,
    @Query('online') online?: string,
  ) {
    return this.groups.directory(user, {
      q,
      language,
      region,
      theme,
      church,
      online,
    });
  }

  @Get('groups/mine')
  myGroups(@CurrentUser() user: SessionUser) {
    return this.groups.mine(user);
  }

  @Post('groups')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  createGroup(@CurrentUser() user: SessionUser, @Body() dto: CreateGroupDto) {
    return this.groups.create(user, dto);
  }

  @Get('groups/:id')
  group(@CurrentUser() user: SessionUser, @Id() id: string) {
    return this.groups.get(user, id);
  }

  @Patch('groups/:id')
  @HttpCode(204)
  async updateGroup(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: GroupDto,
  ) {
    await this.groups.update(user, id, dto);
  }

  @Post('groups/:id/join')
  @HttpCode(200)
  join(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() _dto: JoinDto,
  ) {
    return this.groups.join(user, id);
  }

  @Post('groups/:id/leave')
  @HttpCode(204)
  async leave(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.groups.leave(user, id);
  }

  @Post('groups/:id/members/:userId')
  @HttpCode(204)
  async memberAction(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Id('userId') memberId: string,
    @Body() dto: MemberActionDto,
  ) {
    await this.groups.memberAction(user, id, memberId, dto);
  }

  @Post('groups/:id/invite')
  @HttpCode(204)
  @Throttle(WRITES)
  async invite(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: InviteMemberDto,
  ) {
    await this.groups.invite(user, id, dto.email);
  }

  @Get('groups/:id/requests')
  async groupWall(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.groups.assertMember(user, id);
    return this.requests.groupWall(user, id);
  }

  @Get('groups/:id/reports')
  groupReports(@CurrentUser() user: SessionUser, @Id() id: string) {
    return this.moderation.groupReports(user, id);
  }

  @Post('reports/:id/resolve')
  @HttpCode(204)
  async resolveReport(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: ResolveReportDto,
  ) {
    await this.moderation.resolveReport(user, id, dto.action);
  }

  // ---- Sessions

  @Get('sessions/upcoming')
  upcoming(@CurrentUser() user: SessionUser) {
    return this.sessions.upcoming(user);
  }

  @Get('groups/:id/sessions')
  groupSessions(@CurrentUser() user: SessionUser, @Id() id: string) {
    return this.sessions.forGroup(user, id);
  }

  @Post('groups/:id/sessions')
  @Throttle(WRITES)
  createSession(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: SessionDto,
  ) {
    return this.sessions.create(user, id, dto);
  }

  @Put('sessions/:id/attend')
  @HttpCode(204)
  async attend(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() _dto: AttendDto,
  ) {
    await this.sessions.attend(user, id, true);
  }

  @Delete('sessions/:id/attend')
  @HttpCode(204)
  async notAttend(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.sessions.attend(user, id, false);
  }

  @Get('sessions/:id/join')
  joinLink(@CurrentUser() user: SessionUser, @Id() id: string) {
    return this.sessions.joinLink(user, id);
  }

  @Get('sessions/:id/attendees')
  attendees(@CurrentUser() user: SessionUser, @Id() id: string) {
    return this.sessions.attendees(user, id);
  }

  @Post('sessions/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Query('series') series?: string,
  ) {
    return this.sessions.cancel(user, id, series === 'yes');
  }

  // ---- Campaigns and chains

  @Get('groups/:id/campaigns')
  campaigns(@CurrentUser() user: SessionUser, @Id() id: string) {
    return this.together.campaigns(user, id);
  }

  @Post('groups/:id/campaigns')
  @Throttle(WRITES)
  createCampaign(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: CampaignDto,
  ) {
    return this.together.createCampaign(user, id, dto);
  }

  @Put('campaigns/:id/member')
  @HttpCode(204)
  async joinCampaign(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.together.joinCampaign(user, id, true);
  }

  @Delete('campaigns/:id/member')
  @HttpCode(204)
  async leaveCampaign(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.together.joinCampaign(user, id, false);
  }

  @Put('campaigns/:id/today')
  @HttpCode(204)
  async prayedToday(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.together.prayedToday(user, id, true);
  }

  @Delete('campaigns/:id/today')
  @HttpCode(204)
  async notPrayedToday(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.together.prayedToday(user, id, false);
  }

  @Post('campaigns/:id/cancel')
  @HttpCode(204)
  async cancelCampaign(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.together.cancelCampaign(user, id);
  }

  @Get('groups/:id/chains')
  chains(@CurrentUser() user: SessionUser, @Id() id: string) {
    return this.together.chains(user, id);
  }

  @Post('groups/:id/chains')
  @Throttle(WRITES)
  createChain(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: ChainDto,
  ) {
    return this.together.createChain(user, id, dto);
  }

  @Put('chains/:id/turn')
  @HttpCode(204)
  async takeTurn(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: SlotDto,
  ) {
    await this.together.takeSlot(user, id, dto.slotStart, true);
  }

  @Post('chains/:id/turn/release')
  @HttpCode(204)
  async releaseTurn(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: SlotDto,
  ) {
    await this.together.takeSlot(user, id, dto.slotStart, false);
  }

  @Post('chains/:id/cancel')
  @HttpCode(204)
  async cancelChain(@CurrentUser() user: SessionUser, @Id() id: string) {
    await this.together.cancelChain(user, id);
  }

  // ---- The prayer team and moderators

  @Get('team/inbox')
  @Roles(...PRAYER_TEAM_ROLES)
  inbox(@CurrentUser() user: SessionUser) {
    return this.moderation.inbox(user);
  }

  @Get('team/queue')
  @Roles(...PRAYER_MODERATOR_ROLES)
  queue(@CurrentUser() user: SessionUser) {
    return this.moderation.queue(user);
  }

  @Post('team/requests/:id')
  @HttpCode(204)
  @Roles(...PRAYER_MODERATOR_ROLES)
  async moderateRequest(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: ModerateDto,
  ) {
    await this.moderation.moderateRequest(user, id, dto);
  }

  @Post('team/responses/:id')
  @HttpCode(204)
  @Roles(...PRAYER_MODERATOR_ROLES)
  async moderateResponse(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: ModerateDto,
  ) {
    await this.moderation.moderateResponse(user, id, dto);
  }

  @Post('team/testimonies/:id')
  @HttpCode(204)
  @Roles(...PRAYER_MODERATOR_ROLES)
  async moderateTestimony(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: ModerateDto,
  ) {
    await this.moderation.moderateTestimony(user, id, dto);
  }

  @Post('team/groups/:id')
  @HttpCode(204)
  @Roles(...PRAYER_MODERATOR_ROLES)
  async decideGroup(
    @CurrentUser() user: SessionUser,
    @Id() id: string,
    @Body() dto: GroupDecisionDto,
  ) {
    await this.moderation.decideGroup(user, id, dto);
  }
}
