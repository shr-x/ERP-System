import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '.prisma/client';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { CouponsService } from './coupons.service';
import { createCouponPipe, validateCouponQueryPipe } from './coupons.schemas';

@Controller('coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get('validate')
  async validate(@CurrentUser() user: any, @Query(validateCouponQueryPipe) query: any) {
    const coupon = await this.coupons.validateCoupon(user.orgId, query.code);
    return {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        amountPaise: coupon.amountPaise.toString(),
        usesRemaining: coupon.usesRemaining,
        validFrom: coupon.validFrom.toISOString(),
        validTo: coupon.validTo ? coupon.validTo.toISOString() : null,
        isActive: coupon.isActive
      }
    };
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async list(@CurrentUser() user: any) {
    return { coupons: await this.coupons.listCoupons(user.orgId) };
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(@CurrentUser() user: any, @Body(createCouponPipe) body: any) {
    return { coupon: await this.coupons.createCoupon(user.orgId, user.sub, body) };
  }

  @Patch(':id/disable')
  @Roles(UserRole.ADMIN)
  async disable(@CurrentUser() user: any, @Param('id') id: string) {
    return { coupon: await this.coupons.disableCoupon(user.orgId, id) };
  }
}

