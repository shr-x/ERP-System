import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StitchingCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, input: { q?: string; page: number; pageSize: number }) {
    const q = input.q?.trim();
    const whereCustomer: Prisma.CustomerWhereInput = {
      orgId,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: q, mode: Prisma.QueryMode.insensitive } }
            ]
          }
        : {})
    };

    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where: whereCustomer }),
      this.prisma.customer.findMany({
        where: whereCustomer,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: { id: true, fullName: true, phone: true, isWalkIn: true, createdAt: true }
      })
    ]);

    const ids = customers.map((c) => c.id);
    const profiles = ids.length
      ? await this.prisma.stitchingCustomerProfile.findMany({
          where: { orgId, erpCustomerId: { in: ids } },
          select: { id: true, erpCustomerId: true, notes: true, updatedAt: true }
        })
      : [];
    const profileByErpId = new Map(profiles.map((p: any) => [p.erpCustomerId, p]));

    return {
      total,
      page: input.page,
      pageSize: input.pageSize,
      customers: customers.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        profile: profileByErpId.get(c.id) ?? null
      }))
    };
  }

  async sync(orgId: string, erpCustomerId: string, input?: { notes?: string }) {
    const erpCustomer = await this.prisma.customer.findFirst({
      where: { id: erpCustomerId, orgId },
      select: { id: true }
    });
    if (!erpCustomer) throw new ForbiddenException('Invalid ERP customer');

    const profile = await this.prisma.stitchingCustomerProfile.upsert({
      where: { orgId_erpCustomerId: { orgId, erpCustomerId } },
      create: { orgId, erpCustomerId, notes: input?.notes?.trim() ? input.notes.trim() : null },
      update: { notes: input?.notes?.trim() ? input.notes.trim() : undefined },
      include: { erpCustomer: { select: { id: true, fullName: true, phone: true, isWalkIn: true } } }
    });

    return profile;
  }

  async getProfile(orgId: string, erpCustomerId: string) {
    const profile = await this.prisma.stitchingCustomerProfile.findFirst({
      where: { orgId, erpCustomerId },
      include: { erpCustomer: { select: { id: true, fullName: true, phone: true, isWalkIn: true } } }
    });
    if (!profile) throw new ForbiddenException('Customer profile not found. Sync first.');

    const loyaltyAgg = await this.prisma.loyaltyLedger.aggregate({
      where: { orgId, customerId: erpCustomerId },
      _sum: { pointsDelta: true }
    });
    const loyaltyPoints = loyaltyAgg._sum.pointsDelta ?? 0;

    const orders = await this.prisma.stitchingOrder.findMany({
      where: { orgId, customerProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        orderCode: true,
        status: true,
        deliveryDate: true,
        createdAt: true,
        productTemplate: { select: { id: true, name: true, category: true } },
        measurements: true,
        measurementProfileName: true
      }
    });

    const orderHistory = orders.map((o: any) => ({
      id: o.id,
      orderCode: o.orderCode,
      status: o.status,
      deliveryDate: o.deliveryDate.toISOString(),
      createdAt: o.createdAt.toISOString(),
      productTemplate: o.productTemplate,
      measurementProfileName: o.measurementProfileName,
      measurements: o.measurements
    }));

    return {
      profile: {
        id: profile.id,
        notes: profile.notes,
        updatedAt: profile.updatedAt.toISOString()
      },
      erpCustomer: profile.erpCustomer,
      loyaltyPoints,
      measurementHistory: orderHistory.map((o: any) => ({
        orderId: o.id,
        orderCode: o.orderCode,
        createdAt: o.createdAt,
        measurementProfileName: o.measurementProfileName,
        measurements: o.measurements
      })),
      orderHistory
    };
  }
}
