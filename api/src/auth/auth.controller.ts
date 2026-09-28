import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import type { Request, Response } from 'express';
import {
  AllowPasswordChangePending,
  AuthGuard,
  CurrentUser,
  SESSION_COOKIE,
} from './auth.guard';
import { AuthService, SESSION_DAYS, SessionUser } from './auth.service';

const STRICT = { default: { ttl: 60_000, limit: 10 } };
const EMAIL = { message: 'Enter a valid email address.' };
const NAME = { message: 'Enter your full name.' };
const PASSWORD = { message: 'Enter a password.' };

class SignUpDto {
  @IsEmail({}, EMAIL)
  @MaxLength(254)
  email: string;

  // Strength is checked in the service, which knows the email too.
  @IsString()
  @Length(1, 200, PASSWORD)
  password: string;

  @IsString()
  @Length(2, 120, NAME)
  fullName: string;

  // What brought them here. Either kind of account can both ask and give.
  @IsOptional()
  @IsIn(['ask', 'give'])
  intent?: 'ask' | 'give';
}

class SignInDto {
  @IsEmail({}, EMAIL)
  email: string;

  @IsString()
  @Length(1, 200, { message: 'Enter your password.' })
  password: string;
}

class EmailDto {
  @IsEmail({}, EMAIL)
  email: string;
}

class TokenDto {
  @IsString()
  @Length(20, 200, { message: 'This link is not valid.' })
  token: string;
}

class ResetPasswordDto extends TokenDto {
  @IsString()
  @Length(1, 200, PASSWORD)
  password: string;
}

class AcceptInviteDto extends ResetPasswordDto {
  @IsString()
  @Length(2, 120, NAME)
  fullName: string;
}

class ChangePasswordDto {
  @IsString()
  @Length(1, 200, { message: 'Enter your current password.' })
  currentPassword: string;

  @IsString()
  @Length(1, 200, { message: 'Enter a new password.' })
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sign-up')
  @Throttle(STRICT)
  async signUp(
    @Body() dto: SignUpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.signUp(
      dto.email,
      dto.password,
      dto.fullName,
      dto.intent === 'give' ? 'angel' : 'requester',
    );
    await this.startSession(user, res);
    return user;
  }

  @Post('sign-in')
  @HttpCode(200)
  @Throttle(STRICT)
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.signIn(dto.email, dto.password);
    await this.startSession(user, res);
    return user;
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await this.auth.endSession(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @AllowPasswordChangePending()
  me(@CurrentUser() user: SessionUser) {
    return user;
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @AllowPasswordChangePending()
  @Throttle(STRICT)
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword(
      user,
      dto.currentPassword,
      dto.newPassword,
      String(req.cookies[SESSION_COOKIE]),
    );
  }

  @Post('resend-verification')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async resendVerification(@CurrentUser() user: SessionUser) {
    await this.auth.resendVerification(user);
  }

  @Post('verify-email')
  @HttpCode(204)
  @Throttle(STRICT)
  async verifyEmail(@Body() dto: TokenDto) {
    await this.auth.verifyEmail(dto.token);
  }

  @Post('forgot-password')
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async forgotPassword(@Body() dto: EmailDto) {
    await this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(204)
  @Throttle(STRICT)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('invite-info')
  @HttpCode(200)
  @Throttle(STRICT)
  inviteInfo(@Body() dto: TokenDto) {
    return this.auth.inviteInfo(dto.token);
  }

  @Post('accept-invite')
  @Throttle(STRICT)
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.acceptInvite(
      dto.token,
      dto.fullName,
      dto.password,
    );
    await this.startSession(user, res);
    return user;
  }

  private async startSession(user: SessionUser, res: Response) {
    const token = await this.auth.createSession(user.id);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
  }
}
