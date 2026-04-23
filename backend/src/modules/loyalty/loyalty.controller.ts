import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { LoyaltyService } from './loyalty.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('loyalty')
  async getByPhone(@CurrentUser() user: any, @Query('phone') phone?: string) {
    if (!phone?.trim()) return { customer: null, pointsBalance: 0, ledger: [], purchases: [] };
    return this.loyalty.getByPhone(user.orgId, phone);
  }
}

