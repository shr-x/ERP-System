import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listStores(orgId: string) {
    return this.prisma.store.findMany({
      where: { orgId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        phone: true,
        stateCode: true,
        gstin: true,
        footerNote: true,
        isActive: true
      }
    });
  }

  async createStore(orgId: string, input: { code: string; name: string; address: string; stateCode: string }) {
    try {
      return await this.prisma.store.create({
        data: {
          orgId,
          code: input.code,
          name: input.name,
          address: input.address,
          stateCode: input.stateCode
        },
        select: { id: true, code: true, name: true, address: true, phone: true, stateCode: true, gstin: true, footerNote: true }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('Store code already exists');
      }
      throw err;
    }
  }

  async updateStore(
    orgId: string,
    storeId: string,
    input: { name?: string; phone?: string; address?: string; gstin?: string; footerNote?: string }
  ) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, orgId },
      select: { id: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        name: input.name ?? undefined,
        phone: input.phone ?? undefined,
        address: input.address ?? undefined,
        gstin: input.gstin ?? undefined,
        footerNote: input.footerNote ?? undefined
      },
      select: { id: true, code: true, name: true, address: true, phone: true, stateCode: true, gstin: true, footerNote: true }
    });
  }

  async createWarehouse(orgId: string, input: { storeId: string; name: string }) {
    const store = await this.prisma.store.findFirst({
      where: { id: input.storeId, orgId },
      select: { id: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    try {
      return await this.prisma.warehouse.create({
        data: { orgId, storeId: input.storeId, name: input.name },
        select: { id: true, storeId: true, name: true }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('Warehouse name already exists for this store');
      }
      throw err;
    }
  }

  async listWarehouses(orgId: string, storeId: string, opts?: { includeInactiveWithStock?: boolean }) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, orgId },
      select: { id: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    const includeInactiveWithStock = !!opts?.includeInactiveWithStock;

    return this.prisma.warehouse.findMany({
      where: includeInactiveWithStock
        ? {
            orgId,
            storeId,
            OR: [
              { isActive: true },
              { batches: { some: { qtyAvailable: { gt: new Prisma.Decimal(0) } } } }
            ]
          }
        : { orgId, storeId, isActive: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, isActive: true }
    });
  }

  async deleteStore(orgId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, orgId },
      select: { id: true }
    });
    if (!store) throw new ForbiddenException('Invalid store');

    await this.prisma.store.update({
      where: { id: storeId },
      data: { isActive: false }
    });
  }

  async deleteWarehouse(orgId: string, warehouseId: string) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, orgId },
      select: { id: true }
    });
    if (!wh) throw new ForbiddenException('Invalid warehouse');

    await this.prisma.warehouse.update({
      where: { id: warehouseId },
      data: { isActive: false }
    });
  }
}
