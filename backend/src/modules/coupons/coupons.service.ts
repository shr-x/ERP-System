import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { rupeesToPaise } from '../products/money';
import { randomBytes } from 'node:crypto';

type Tx = Prisma.TransactionClient;

function normalizeCode(input: string) {
  const code = input.trim().toUpperCase().replaceAll(' ', '-');
  if (!/^[A-Z0-9_-]{4,32}$/.test(code)) throw new BadRequestException('Invalid coupon code');
  return code;
}

function parseOptionalDateOnly(v?: string) {
  const s = v?.trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date');
  return d;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCoupon(
    orgId: string,
    createdByUserId: string,
    input: { code?: string; title?: string; amountRupees: number; usesTotal: number; validFrom?: string; validTo?: string }
  ) {
    const title = input.title?.trim() ? input.title.trim() : null;
    const code = input.code?.trim() ? normalizeCode(input.code) : `CPN-${randomBytes(3).toString('hex').toUpperCase()}`;
    const amountPaise = rupeesToPaise(input.amountRupees);
    if (amountPaise <= 0n) throw new BadRequestException('Coupon amount must be positive');

    const validFrom = parseOptionalDateOnly(input.validFrom) ?? new Date();
    const validTo = parseOptionalDateOnly(input.validTo);
    if (validTo && validTo.getTime() < validFrom.getTime()) throw new BadRequestException('validTo must be >= validFrom');

    try {
      return await this.prisma.coupon.create({
        data: {
          orgId,
          code,
          title,
          amountPaise,
          usesTotal: input.usesTotal,
          usesRemaining: input.usesTotal,
          validFrom,
          validTo,
          createdByUserId
        },
        select: {
          id: true,
          code: true,
          title: true,
          amountPaise: true,
          usesTotal: true,
          usesRemaining: true,
          validFrom: true,
          validTo: true,
          isActive: true,
          createdAt: true
        }
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Coupon code already exists');
      throw e;
    }
  }

  async listCoupons(orgId: string) {
    return this.prisma.coupon.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        title: true,
        amountPaise: true,
        usesTotal: true,
        usesRemaining: true,
        validFrom: true,
        validTo: true,
        isActive: true,
        createdAt: true,
        _count: { select: { redemptions: true } }
      }
    });
  }

  async disableCoupon(orgId: string, id: string) {
    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true }
    });
  }

  async validateCoupon(orgId: string, codeInput: string, now = new Date()) {
    const code = normalizeCode(codeInput);
    const coupon = await this.prisma.coupon.findFirst({
      where: { orgId, code },
      select: { id: true, code: true, title: true, amountPaise: true, usesRemaining: true, validFrom: true, validTo: true, isActive: true }
    });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid coupon');
    if (coupon.usesRemaining <= 0) throw new BadRequestException('Coupon fully used');
    if (coupon.validFrom.getTime() > now.getTime()) throw new BadRequestException('Coupon not active yet');
    if (coupon.validTo && coupon.validTo.getTime() < now.getTime()) throw new BadRequestException('Coupon expired');
    return coupon;
  }

  async redeemCouponInTx(
    tx: Tx,
    args: { orgId: string; storeId: string; invoiceId: string; redeemedByUserId: string; codeInput: string; applyPaise: bigint }
  ) {
    const code = normalizeCode(args.codeInput);
    const coupon = await tx.coupon.findFirst({
      where: { orgId: args.orgId, code },
      select: { id: true, amountPaise: true, usesRemaining: true, validFrom: true, validTo: true, isActive: true }
    });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid coupon');
    if (coupon.usesRemaining <= 0) throw new BadRequestException('Coupon fully used');
    const now = new Date();
    if (coupon.validFrom.getTime() > now.getTime()) throw new BadRequestException('Coupon not active yet');
    if (coupon.validTo && coupon.validTo.getTime() < now.getTime()) throw new BadRequestException('Coupon expired');

    const applied = args.applyPaise > coupon.amountPaise ? coupon.amountPaise : args.applyPaise;
    if (applied <= 0n) throw new BadRequestException('Invalid coupon amount');

    const upd = await tx.coupon.updateMany({
      where: { id: coupon.id, usesRemaining: { gt: 0 }, isActive: true },
      data: { usesRemaining: { decrement: 1 } }
    });
    if (upd.count !== 1) throw new BadRequestException('Coupon is not redeemable');

    await tx.couponRedemption.create({
      data: {
        orgId: args.orgId,
        storeId: args.storeId,
        couponId: coupon.id,
        invoiceId: args.invoiceId,
        redeemedByUserId: args.redeemedByUserId,
        amountAppliedPaise: applied
      }
    });

    return { couponId: coupon.id, code, appliedPaise: applied };
  }
}

