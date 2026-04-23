import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { env } from '../env/env';

@Injectable()
export class PortalGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const accessKey = env.PORTAL_ACCESS_KEY?.trim();
    if (!accessKey) throw new ForbiddenException('Portal is disabled');
    const req = context.switchToHttp().getRequest();
    const key = (req?.headers?.['x-sutra-portal-key'] || req?.headers?.['X-SUTRA-PORTAL-KEY']) as string | undefined;
    if (!key || key.trim() !== accessKey) throw new ForbiddenException('Invalid portal key');
    return true;
  }
}
