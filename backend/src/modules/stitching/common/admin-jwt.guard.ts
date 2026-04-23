import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { JwtPayload } from '../../auth/jwt.strategy';

@Injectable()
export class AdminJwtGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    _info: any,
    _context: ExecutionContext,
    _status?: any
  ): TUser {
    if (err || !user) throw new UnauthorizedException('Invalid or missing token');
    const payload = user as JwtPayload;
    if (payload.role !== 'ADMIN') throw new ForbiddenException('Admin access required');
    return payload as unknown as TUser;
  }

  getRequest(context: ExecutionContext) {
    return context.switchToHttp().getRequest();
  }
}
