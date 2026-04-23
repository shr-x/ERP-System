import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateStitchingTailorDto, UpdateStitchingTailorDto } from './stitching-tailors.dtos';

@Injectable()
export class StitchingTailorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, input: { q?: string; page: number; pageSize: number }) {
    const q = input.q?.trim();
    const where: Prisma.StitchingTailorWhereInput = {
      orgId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: q, mode: Prisma.QueryMode.insensitive } }
            ]
          }
        : {})
    };

    const [total, tailors] = await Promise.all([
      this.prisma.stitchingTailor.count({ where }),
      this.prisma.stitchingTailor.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize
      })
    ]);

    return { total, page: input.page, pageSize: input.pageSize, tailors };
  }

  async get(orgId: string, id: string) {
    const tailor = await this.prisma.stitchingTailor.findFirst({ where: { id, orgId } });
    if (!tailor) throw new ForbiddenException('Invalid tailor');
    return tailor;
  }

  async create(orgId: string, dto: CreateStitchingTailorDto) {
    try {
      return await this.prisma.stitchingTailor.create({
        data: { orgId, name: dto.name, phone: dto.phone, isActive: dto.isActive ?? true }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Tailor phone already exists');
      throw err;
    }
  }

  async update(orgId: string, id: string, dto: UpdateStitchingTailorDto) {
    await this.get(orgId, id);
    try {
      return await this.prisma.stitchingTailor.update({
        where: { id },
        data: { name: dto.name, phone: dto.phone, isActive: dto.isActive }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Tailor phone already exists');
      throw err;
    }
  }

  async delete(orgId: string, id: string) {
    await this.get(orgId, id);
    const hasOrders = await this.prisma.stitchingOrder.findFirst({
      where: { orgId, tailorId: id },
      select: { id: true }
    });
    if (hasOrders) throw new ConflictException('Cannot delete tailor with assigned orders');
    await this.prisma.stitchingTailor.delete({ where: { id } });
    return { id };
  }

  async jobList(orgId: string, tailorId: string) {
    await this.get(orgId, tailorId);
    const orders = await this.prisma.stitchingOrder.findMany({
      where: { orgId, tailorId },
      orderBy: [{ status: 'asc' }, { deliveryDate: 'asc' }],
      select: {
        id: true,
        orderCode: true,
        status: true,
        deliveryDate: true,
        productTemplate: { select: { id: true, name: true, category: true } },
        selectedColorCode: true,
        selectedColorImageUrl: true
      }
    });
    return { orders: orders.map((o: any) => ({ ...o, deliveryDate: o.deliveryDate.toISOString() })) };
  }
}
