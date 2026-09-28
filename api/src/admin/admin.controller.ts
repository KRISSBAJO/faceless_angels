import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, Roles } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import {
  InviteDto,
  PublishPolicyDto,
  UpdateCategoryDto,
  UpdateUserDto,
} from './admin.dto';
import { AdminService } from './admin.service';
import {
  PatveroError,
  PatveroService,
  type PatveroMeeting,
  type PatveroProblem,
} from '../patvero/patvero.service';

@Controller('admin')
@UseGuards(AuthGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly patvero: PatveroService,
  ) {}

  /**
   * Whether the Patvero key works, and the workspace's coming meetings.
   * Only facts about the connection are returned, never the key.
   */
  @Get('connections/patvero')
  async patveroConnection() {
    const problemOf = (err: unknown): PatveroProblem => {
      if (err instanceof PatveroError) return err.problem;
      throw err;
    };
    if (!this.patvero.configured) {
      return { configured: false, problem: 'not_configured' as const };
    }
    let workspace;
    try {
      workspace = await this.patvero.workspace();
    } catch (err) {
      return { configured: true, problem: problemOf(err) };
    }
    let meetings: PatveroMeeting[] | null = null;
    let meetingsProblem: PatveroProblem | null = null;
    try {
      const soon = Date.now() - 60 * 60 * 1000;
      meetings = (await this.patvero.meetings())
        .filter((m) => m.startsAt && Date.parse(m.startsAt) >= soon)
        .filter((m) => m.status === 'scheduled' || m.status === 'active')
        .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!))
        .slice(0, 10);
    } catch (err) {
      meetingsProblem = problemOf(err);
    }
    return {
      configured: true,
      problem: null,
      workspace: {
        name: workspace.name,
        status: workspace.status,
        keyName: workspace.keyName,
        scopes: workspace.scopes,
      },
      meetings,
      meetingsProblem,
    };
  }

  @Get('overview')
  @Roles('admin', 'auditor')
  overview() {
    return this.admin.overview();
  }

  @Get('audit')
  @Roles('admin', 'auditor')
  auditLog(
    @Query('action') action?: string,
    @Query('before', new ParseIntPipe({ optional: true })) before?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.admin.auditLog({ action, before, limit });
  }

  @Get('users')
  users(@Query('q') search?: string, @Query('role') role?: string) {
    return this.admin.users(search, role);
  }

  @Patch('users/:id')
  @HttpCode(204)
  async updateUser(
    @CurrentUser() admin: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    await this.admin.updateUser(admin, id, dto);
  }

  @Get('invites')
  invites() {
    return this.admin.invites();
  }

  @Post('invites')
  invite(@CurrentUser() admin: SessionUser, @Body() dto: InviteDto) {
    return this.admin.invite(admin, dto);
  }

  @Post('invites/:id/revoke')
  @HttpCode(204)
  async revokeInvite(
    @CurrentUser() admin: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.admin.revokeInvite(admin, id);
  }

  @Get('categories')
  categories() {
    return this.admin.categories();
  }

  @Patch('categories/:key')
  @HttpCode(204)
  async updateCategory(
    @CurrentUser() admin: SessionUser,
    @Param('key') key: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    await this.admin.updateCategory(admin, key, dto);
  }

  @Get('policy-texts')
  policyTexts() {
    return this.admin.policyTexts();
  }

  @Post('policy-texts')
  @HttpCode(204)
  async publishPolicy(
    @CurrentUser() admin: SessionUser,
    @Body() dto: PublishPolicyDto,
  ) {
    await this.admin.publishPolicy(admin, dto);
  }
}
