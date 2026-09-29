import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Put,
  Query,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  Roles,
} from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { FINANCE_ROLES, FINANCE_WRITERS } from '../config';
import {
  CheckoutDto,
  EntityDto,
  LedgerDecisionDto,
  LedgerEntryDto,
  SendStatementsDto,
} from './giving.dto';
import { GivingService } from './giving.service';
import { LedgerService } from './ledger.service';
import { ReceiptsService } from './receipts.service';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

/** Open to everyone: giving, the thank-you page, and the public record. */
@Controller()
export class GivingPublicController {
  constructor(
    private readonly giving: GivingService,
    private readonly ledger: LedgerService,
    private readonly receipts: ReceiptsService,
  ) {}

  // A receipt: for the giver, for money staff, or through its emailed link.
  @Get('giving/receipts/:id')
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Header('Cache-Control', 'no-store')
  receipt(
    @CurrentUser() user: SessionUser | undefined,
    @Param('id') id: string,
    @Query('t') token?: string,
  ) {
    return this.receipts.receipt(id, user, token);
  }

  // A yearly statement opened from its emailed link.
  @Get('giving/statement-links/:id')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Header('Cache-Control', 'no-store')
  statementLink(@Param('id') id: string, @Query('t') token?: string) {
    return this.receipts.statementByLink(id, token);
  }

  @Get('giving/options')
  options() {
    return this.giving.options();
  }

  @Post('giving/checkout')
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  checkout(
    @CurrentUser() user: SessionUser | undefined,
    @Body() dto: CheckoutDto,
  ) {
    return this.giving.startCheckout(user ?? null, dto);
  }

  @Get('giving/checkouts/:id')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  checkoutStatus(@Param('id') id: string) {
    return this.giving.checkoutStatus(id);
  }

  // Payment companies call these. They prove themselves by signature.
  @Post('giving/webhooks/stripe')
  @HttpCode(200)
  @SkipThrottle()
  async stripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    await this.giving.stripeWebhook(req.rawBody, signature);
    return { received: true };
  }

  @Post('giving/webhooks/paystack')
  @HttpCode(200)
  @SkipThrottle()
  async paystack(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string | undefined,
  ) {
    await this.giving.paystackWebhook(req.rawBody, signature);
    return { received: true };
  }

  @Get('transparency')
  transparency() {
    return this.ledger.transparency();
  }
}

/** A signed-in giver's own gifts. */
@Controller('giving')
@UseGuards(AuthGuard)
export class GivingMemberController {
  constructor(
    private readonly giving: GivingService,
    private readonly receipts: ReceiptsService,
  ) {}

  @Get('mine')
  mine(@CurrentUser() user: SessionUser) {
    return this.giving.mine(user);
  }

  @Get('statements')
  statements(@CurrentUser() user: SessionUser) {
    return this.receipts.myStatements(user);
  }

  @Get('statements/:year')
  @Header('Cache-Control', 'no-store')
  statement(
    @CurrentUser() user: SessionUser,
    @Param('year', ParseIntPipe) year: number,
    @Query('currency') currency: string,
  ) {
    return this.receipts.myStatement(user, year, currency);
  }

  @Post('monthly/:id/stop')
  @HttpCode(204)
  async stop(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.giving.stopMonthly(user, id);
  }
}

/** Gifts received, and money going out, for staff. */
@Controller('finance')
@UseGuards(AuthGuard)
@Roles(...FINANCE_ROLES)
export class FinanceController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly receipts: ReceiptsService,
  ) {}

  @Get('overview')
  overview() {
    return this.ledger.overview();
  }

  @Get('entities')
  entities() {
    return this.receipts.entities();
  }

  // Only an administrator changes what receipts say in law.
  @Put('entities/:currency')
  @HttpCode(204)
  @Roles('admin')
  async updateEntity(
    @CurrentUser() user: SessionUser,
    @Param('currency') currency: string,
    @Body() dto: EntityDto,
  ) {
    if (currency !== 'usd' && currency !== 'ngn') throw new NotFoundException();
    await this.receipts.updateEntity(user, currency, dto);
  }

  @Post('gifts/:id/resend')
  @Roles(...FINANCE_WRITERS)
  resend(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.receipts.resend(user, id);
  }

  @Post('statements')
  @Roles(...FINANCE_WRITERS)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  sendStatements(
    @CurrentUser() user: SessionUser,
    @Body() dto: SendStatementsDto,
  ) {
    return this.receipts.sendStatements(dto.year, user);
  }

  @Post('entries')
  @Roles(...FINANCE_WRITERS)
  @UseInterceptors(
    FileInterceptor('receipt', {
      limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
    }),
  )
  propose(
    @CurrentUser() user: SessionUser,
    @Body() dto: LedgerEntryDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.ledger.propose(user, dto, file);
  }

  @Post('entries/:id/decision')
  @HttpCode(204)
  @Roles(...FINANCE_WRITERS)
  async decide(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LedgerDecisionDto,
  ) {
    await this.ledger.decide(user, id, dto.outcome, dto.note);
  }

  @Get('entries/:id/receipt')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async receipt(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await this.ledger.receipt(user, id);
    return new StreamableFile(file.bytes, {
      type: file.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    });
  }
}
