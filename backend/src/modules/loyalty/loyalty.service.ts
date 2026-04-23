import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async getByPhone(orgId: string, phone: string) {
    const cleaned = phone.trim();
    const customer = await this.prisma.customer.findFirst({
      where: { orgId, phone: cleaned },
      select: { id: true, fullName: true, phone: true }
    });
    if (!customer) throw new ForbiddenException('Customer not found');

    const agg = await this.prisma.loyaltyLedger.aggregate({
      where: { orgId, customerId: customer.id },
      _sum: { pointsDelta: true }
    });
    const pointsBalance = agg._sum.pointsDelta ?? 0;

    const ledger = await this.prisma.loyaltyLedger.findMany({
      where: { orgId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, sourceType: true, sourceId: true, pointsDelta: true, createdAt: true }
    });

    const purchases = await this.prisma.salesInvoice.findMany({
      where: { orgId, customerId: customer.id, status: 'ISSUED' },
      orderBy: { invoiceDate: 'desc' },
      take: 20,
      select: { id: true, invoiceNo: true, invoiceDate: true, grandTotalPaise: true }
    });

    return { customer, pointsBalance, ledger, purchases };
  }
}

