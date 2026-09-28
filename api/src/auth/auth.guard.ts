import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../config';
import { AuthService, SessionUser } from './auth.service';

export const SESSION_COOKIE = 'fa_session';

const ROLES_KEY = 'roles';
const PENDING_OK_KEY = 'allowPasswordChangePending';

/** Limits a controller or a route to these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Marks the few routes someone may use before changing a temporary password. */
export const AllowPasswordChangePending = () =>
  SetMetadata(PENDING_OK_KEY, true);

type AuthedRequest = Request & { user?: SessionUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const user =
      typeof token === 'string' ? await this.auth.userForToken(token) : null;
    if (!user) throw new UnauthorizedException('Sign in to continue.');

    const targets = [context.getHandler(), context.getClass()];
    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(PENDING_OK_KEY, targets)
    ) {
      throw new ForbiddenException({
        message: 'Change your password before you continue.',
        code: 'password_change_required',
      });
    }

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles && !roles.includes(user.role as Role)) {
      throw new ForbiddenException('Your account cannot open this page.');
    }

    req.user = user;
    return true;
  }
}

/** For pages open to everyone that show more to someone who is signed in. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const user =
      typeof token === 'string' ? await this.auth.userForToken(token) : null;
    // Someone with a starting password is treated as a visitor until they change it.
    req.user = user && !user.mustChangePassword ? user : undefined;
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthedRequest>().user,
);
