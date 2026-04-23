import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountType, UserRole } from '.prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async bootstrap(input: {
    org: { name: string; gstin: string; legalAddress: string; stateCode: string };
    store: { code: string; name: string; address: string; stateCode: string };
    admin: { fullName: string; phone: string; email?: string; password: string };
  }) {
    const existingOrg = await this.prisma.organization.findFirst({
      select: { id: true }
    });
    if (existingOrg) {
      throw new BadRequestException('System already initialized');
    }

    const passwordHash = await bcrypt.hash(input.admin.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.org.name,
          gstin: input.org.gstin,
          legalAddress: input.org.legalAddress,
          stateCode: input.org.stateCode
        }
      });

      await tx.chartAccount.createMany({
        data: [
          { orgId: org.id, code: 'ASSET_CASH', name: 'Cash', type: AccountType.ASSET, isSystem: true },
          { orgId: org.id, code: 'ASSET_UPI_CLEARING', name: 'UPI Clearing', type: AccountType.ASSET, isSystem: true },
          { orgId: org.id, code: 'ASSET_INVENTORY', name: 'Inventory', type: AccountType.ASSET, isSystem: true },
          { orgId: org.id, code: 'ASSET_INPUT_CGST', name: 'Input CGST', type: AccountType.ASSET, isSystem: true },
          { orgId: org.id, code: 'ASSET_INPUT_SGST', name: 'Input SGST', type: AccountType.ASSET, isSystem: true },
          { orgId: org.id, code: 'ASSET_INPUT_IGST', name: 'Input IGST', type: AccountType.ASSET, isSystem: true },
          { orgId: org.id, code: 'EXPENSE_COGS', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, isSystem: true },
          { orgId: org.id, code: 'INCOME_SALES', name: 'Sales', type: AccountType.INCOME, isSystem: true },
          { orgId: org.id, code: 'LIABILITY_ACCOUNTS_PAYABLE', name: 'Accounts Payable', type: AccountType.LIABILITY, isSystem: true },
          { orgId: org.id, code: 'LIABILITY_STORE_CREDIT', name: 'Store Credit / Coupons', type: AccountType.LIABILITY, isSystem: true },
          { orgId: org.id, code: 'LIABILITY_OUTPUT_CGST', name: 'Output CGST', type: AccountType.LIABILITY, isSystem: true },
          { orgId: org.id, code: 'LIABILITY_OUTPUT_SGST', name: 'Output SGST', type: AccountType.LIABILITY, isSystem: true },
          { orgId: org.id, code: 'LIABILITY_OUTPUT_IGST', name: 'Output IGST', type: AccountType.LIABILITY, isSystem: true },
          { orgId: org.id, code: 'EQUITY_STOCK_ADJUSTMENT', name: 'Stock Adjustment (Equity)', type: AccountType.EQUITY, isSystem: true }
        ]
      });

      const store = await tx.store.create({
        data: {
          orgId: org.id,
          code: input.store.code,
          name: input.store.name,
          address: input.store.address,
          stateCode: input.store.stateCode
        }
      });

      const user = await tx.user.create({
        data: {
          orgId: org.id,
          storeId: store.id,
          fullName: input.admin.fullName,
          phone: input.admin.phone,
          email: input.admin.email,
          passwordHash,
          role: UserRole.ADMIN
        }
      });

      const walkIn = await tx.customer.create({
        data: {
          orgId: org.id,
          fullName: 'Walk-in Customer',
          isWalkIn: true
        }
      });

      return { org, store, user, walkIn };
    });

    const token = await this.signAccessToken({
      sub: result.user.id,
      orgId: result.org.id,
      storeId: result.store.id,
      role: result.user.role
    });

    return {
      org: { id: result.org.id, name: result.org.name, gstin: result.org.gstin },
      store: { id: result.store.id, code: result.store.code, name: result.store.name },
      user: { id: result.user.id, fullName: result.user.fullName, role: result.user.role },
      accessToken: token
    };
  }

  async login(input: { phoneOrEmail: string; password: string }) {
    const needle = input.phoneOrEmail.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: input.phoneOrEmail },
          { email: needle }
        ]
      }
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const token = await this.signAccessToken({
      sub: user.id,
      orgId: user.orgId,
      storeId: user.storeId ?? undefined,
      role: user.role
    });

    return {
      accessToken: token,
      user: { id: user.id, orgId: user.orgId, storeId: user.storeId, fullName: user.fullName, role: user.role }
    };
  }

  async listStoreUsers(orgId: string, storeId: string) {
    return this.prisma.user.findMany({
      where: { orgId, storeId, isActive: true },
      select: { id: true, fullName: true, role: true }
    });
  }

  async verifyAdminPassword(args: { userId: string; password: string }) {
    const user = await this.prisma.user.findFirst({
      where: { id: args.userId },
      select: { id: true, role: true, passwordHash: true, isActive: true }
    });
    if (!user || !user.isActive || user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(args.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return { ok: true };
  }

  async createStaffUser(args: {
    orgId: string;
    storeId: string;
    fullName: string;
    phone: string;
    email?: string;
    password: string;
  }) {
    const passwordHash = await bcrypt.hash(args.password, 12);
    const email = args.email && args.email.trim() !== '' ? args.email.trim().toLowerCase() : null;

    try {
      return await this.prisma.user.create({
        data: {
          orgId: args.orgId,
          storeId: args.storeId,
          fullName: args.fullName,
          phone: args.phone,
          email,
          passwordHash,
          role: UserRole.STAFF,
          isActive: true
        },
        select: { id: true, fullName: true, phone: true, email: true, role: true, isActive: true, createdAt: true }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new BadRequestException('Phone/email already in use');
      throw err;
    }
  }

  async createAdminUser(args: {
    orgId: string;
    storeId?: string | null;
    fullName: string;
    phone: string;
    email?: string;
    password: string;
  }) {
    const passwordHash = await bcrypt.hash(args.password, 12);
    const email = args.email && args.email.trim() !== '' ? args.email.trim().toLowerCase() : null;

    try {
      return await this.prisma.user.create({
        data: {
          orgId: args.orgId,
          storeId: args.storeId ?? null,
          fullName: args.fullName,
          phone: args.phone,
          email,
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true
        },
        select: { id: true, fullName: true, phone: true, email: true, role: true, isActive: true, createdAt: true }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new BadRequestException('Phone/email already in use');
      throw err;
    }
  }

  async resetStaffPassword(args: { orgId: string; storeId: string; staffUserId: string; newPassword: string }) {
    const staff = await this.prisma.user.findFirst({
      where: { id: args.staffUserId, orgId: args.orgId, storeId: args.storeId, isActive: true },
      select: { id: true, role: true }
    });
    if (!staff || staff.role !== UserRole.STAFF) throw new BadRequestException('Invalid staff user');

    const passwordHash = await bcrypt.hash(args.newPassword, 12);
    await this.prisma.user.update({
      where: { id: staff.id },
      data: { passwordHash }
    });
    return { ok: true };
  }

  async deactivateStaff(args: { orgId: string; storeId: string; staffUserId: string }) {
    const staff = await this.prisma.user.findFirst({
      where: { id: args.staffUserId, orgId: args.orgId, storeId: args.storeId, isActive: true },
      select: { id: true, role: true }
    });
    if (!staff || staff.role !== UserRole.STAFF) throw new BadRequestException('Invalid staff user');

    await this.prisma.user.update({
      where: { id: staff.id },
      data: { isActive: false }
    });
    return { ok: true };
  }

  async changePassword(args: { userId: string; currentPassword: string; newPassword: string }) {
    const user = await this.prisma.user.findFirst({
      where: { id: args.userId, isActive: true },
      select: { id: true, passwordHash: true }
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(args.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const passwordHash = await bcrypt.hash(args.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });
    return { ok: true };
  }

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true, fullName: true, phone: true, email: true, role: true }
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return { user };
  }

  async updateMyCredentials(args: { userId: string; fullName: string; phone: string; email?: string; currentPassword: string; newPassword?: string }) {
    const user = await this.prisma.user.findFirst({
      where: { id: args.userId, isActive: true },
      select: { id: true, orgId: true, passwordHash: true }
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(args.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const nextEmail = args.email && args.email.trim() !== '' ? args.email.trim().toLowerCase() : null;
    const updateData: any = {
      fullName: args.fullName.trim(),
      phone: args.phone.trim(),
      email: nextEmail
    };
    const nextPassword = args.newPassword?.trim();
    if (nextPassword) {
      updateData.passwordHash = await bcrypt.hash(nextPassword, 12);
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: { id: true, fullName: true, phone: true, email: true, role: true }
      });
      return { user: updated };
    } catch (err: any) {
      if (err?.code === 'P2002') throw new BadRequestException('Phone/email already in use');
      throw err;
    }
  }

  private async signAccessToken(payload: {
    sub: string;
    orgId: string;
    storeId?: string;
    role: UserRole;
  }) {
    return this.jwt.signAsync(payload);
  }
}
