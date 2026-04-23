import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async createCustomer(
    orgId: string,
    input: { fullName: string; phone?: string; gstin?: string; isBusiness?: boolean; stateCode?: string; address?: string; pincode?: string }
  ) {
    try {
      const gstin = input.gstin?.trim() ? input.gstin.trim().toUpperCase() : null;
      const isBusiness = input.isBusiness === true;
      return await this.prisma.customer.create({
        data: {
          orgId,
          fullName: input.fullName,
          phone: input.phone,
          gstin,
          isBusiness,
          stateCode: input.stateCode,
          address: input.address ?? null,
          pincode: input.pincode ?? null
        } as any,
        select: { id: true, fullName: true, phone: true, gstin: true, isBusiness: true, stateCode: true, address: true, pincode: true, isBlocked: true, isWalkIn: true } as any
      } as any);
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Customer already exists');
      throw err;
    }
  }

  async updateCustomer(orgId: string, id: string, input: any) {
    const existing = await this.prisma.customer.findFirst({ where: { id, orgId, isWalkIn: false }, select: { id: true } });
    if (!existing) throw new NotFoundException('Customer not found');

    const gstin = typeof input.gstin === 'string' ? (input.gstin.trim() ? input.gstin.trim().toUpperCase() : null) : undefined;

    try {
      return await this.prisma.customer.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(gstin !== undefined ? { gstin } : {}),
          ...(input.isBusiness !== undefined ? { isBusiness: input.isBusiness === true } : {}),
          ...(input.stateCode !== undefined ? { stateCode: input.stateCode } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.pincode !== undefined ? { pincode: input.pincode } : {})
        } as any,
        select: { id: true, fullName: true, phone: true, gstin: true, isBusiness: true, stateCode: true, address: true, pincode: true, isBlocked: true, isWalkIn: true } as any
      } as any);
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Customer already exists');
      throw err;
    }
  }

  async setBlocked(orgId: string, id: string, blocked: boolean) {
    const existing = await this.prisma.customer.findFirst({ where: { id, orgId, isWalkIn: false }, select: { id: true } });
    if (!existing) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({
      where: { id },
      data: { isBlocked: blocked, blockedAt: blocked ? new Date() : null } as any,
      select: { id: true, isBlocked: true, blockedAt: true } as any
    } as any);
  }

  async deleteCustomer(orgId: string, id: string) {
    const existing = await this.prisma.customer.findFirst({ where: { id, orgId, isWalkIn: false }, select: { id: true } });
    if (!existing) throw new NotFoundException('Customer not found');
    const invCount = await this.prisma.salesInvoice.count({ where: { orgId, customerId: id } });
    if (invCount > 0) throw new ConflictException('Cannot delete: customer has invoices');
    await this.prisma.customer.delete({ where: { id } });
    return { deleted: true };
  }

  async searchCustomers(orgId: string, q?: string) {
    const query = q?.trim();
    return this.prisma.customer.findMany({
      where: {
        orgId,
        isWalkIn: false,
        ...(query
          ? {
              OR: [
                { fullName: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query } },
                { gstin: { contains: query, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, fullName: true, phone: true, gstin: true, isBusiness: true, stateCode: true, address: true, pincode: true, isBlocked: true, blockedAt: true, creditBalancePaise: true, creditDuePaise: true, isWalkIn: true } as any
    } as any);
  }

  async upsertStitchingProfile(orgId: string, erpCustomerId: string, input: { notes?: string }) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: erpCustomerId, orgId, isWalkIn: false },
      select: { id: true }
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const notes = input.notes?.trim() ? input.notes.trim() : null;
    return this.prisma.stitchingCustomerProfile.upsert({
      where: { orgId_erpCustomerId: { orgId, erpCustomerId } },
      create: { orgId, erpCustomerId, notes },
      update: { notes },
      select: { id: true, notes: true, updatedAt: true }
    });
  }

  async getCustomerOrderHistory(orgId: string, erpCustomerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: erpCustomerId, orgId, isWalkIn: false },
      select: { id: true, fullName: true, phone: true } as any
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const loyaltyAgg = await this.prisma.loyaltyLedger.aggregate({
      where: { orgId, customerId: erpCustomerId },
      _sum: { pointsDelta: true }
    });
    const loyaltyPoints = loyaltyAgg._sum.pointsDelta ?? 0;

    const profile = await this.prisma.stitchingCustomerProfile.findFirst({
      where: { orgId, erpCustomerId },
      select: { id: true, notes: true, updatedAt: true }
    });

    const [salesInvoices, stitchingOrders] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: { orgId, customerId: erpCustomerId },
        orderBy: { invoiceDate: 'desc' },
        take: 50,
        select: { id: true, invoiceNo: true, invoiceDate: true, grandTotalPaise: true, status: true } as any
      }),
      this.prisma.stitchingOrder.findMany({
        where: { orgId, customerProfile: { erpCustomerId } } as any,
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          orderCode: true,
          status: true,
          deliveryDate: true,
          createdAt: true,
          erpInvoiceId: true,
          productTemplate: { select: { id: true, name: true, category: true } }
        } as any
      })
    ]);

    const linkedInvoiceIds = stitchingOrders.map((o: any) => o.erpInvoiceId).filter((x: any) => typeof x === 'string' && x.trim());
    const linkedInvoices = linkedInvoiceIds.length
      ? await this.prisma.salesInvoice.findMany({
          where: { orgId, id: { in: linkedInvoiceIds } } as any,
          select: { id: true, grandTotalPaise: true, invoiceNo: true } as any
        })
      : [];
    const invoiceById = new Map(linkedInvoices.map((i: any) => [i.id, i]));

    const orders = [
      ...salesInvoices.map((i: any) => ({
        type: 'ERP_SALE' as const,
        id: i.id,
        refNo: i.invoiceNo,
        date: i.invoiceDate.toISOString(),
        amountPaise: i.grandTotalPaise,
        status: i.status
      })),
      ...stitchingOrders.map((o: any) => ({
        type: 'STITCHING' as const,
        id: o.id,
        refNo: o.orderCode,
        date: o.createdAt.toISOString(),
        deliveryDate: o.deliveryDate.toISOString(),
        status: o.status,
        erpInvoiceId: o.erpInvoiceId,
        billedAmountPaise: o.erpInvoiceId ? invoiceById.get(o.erpInvoiceId)?.grandTotalPaise ?? null : null,
        billedInvoiceNo: o.erpInvoiceId ? invoiceById.get(o.erpInvoiceId)?.invoiceNo ?? null : null,
        template: o.productTemplate
      }))
    ].sort((a: any, b: any) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return {
      customer,
      loyaltyPoints,
      stitchingProfile: profile
        ? { id: profile.id, notes: profile.notes, updatedAt: profile.updatedAt.toISOString() }
        : null,
      orders
    };
  }
}
