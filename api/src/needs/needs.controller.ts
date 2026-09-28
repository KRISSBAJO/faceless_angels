import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, Matches, Max, Min } from 'class-validator';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
} from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { NeedsService } from './needs.service';

class PledgeDto {
  @IsInt()
  @Min(100, { message: 'Pledge at least $1.00.' })
  @Max(100_000_000)
  amountCents: number;
}

class RefParam {
  @Matches(/^FA-\d{1,10}$/, { message: 'We could not find that need.' })
  ref: string;
}

@Controller()
export class NeedsController {
  constructor(private readonly needs: NeedsService) {}

  @Get('needs')
  @UseGuards(OptionalAuthGuard)
  list(
    @CurrentUser() viewer: SessionUser | undefined,
    @Query('category') category?: string,
  ) {
    return this.needs.list(viewer, category);
  }

  @Get('needs/:ref')
  @UseGuards(OptionalAuthGuard)
  get(
    @CurrentUser() viewer: SessionUser | undefined,
    @Param() params: RefParam,
  ) {
    return this.needs.get(viewer, params.ref);
  }

  @Post('needs/:ref/pledges')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  pledge(
    @CurrentUser() angel: SessionUser,
    @Param() params: RefParam,
    @Body() dto: PledgeDto,
  ) {
    return this.needs.pledge(angel, params.ref, dto.amountCents);
  }

  @Get('giving')
  @UseGuards(AuthGuard)
  giving(@CurrentUser() angel: SessionUser) {
    return this.needs.giving(angel);
  }

  @Post('giving/:id/withdraw')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async withdraw(
    @CurrentUser() angel: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.needs.withdrawPledge(angel, id);
  }
}
