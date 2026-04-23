import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { z } from 'zod';
import { env } from '../env/env';

const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  orgId: z.string().uuid(),
  storeId: z.string().uuid().optional(),
  role: z.enum(['ADMIN', 'STAFF'])
});

export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_ACCESS_SECRET
    });
  }

  async validate(payload: unknown) {
    return jwtPayloadSchema.parse(payload);
  }
}

