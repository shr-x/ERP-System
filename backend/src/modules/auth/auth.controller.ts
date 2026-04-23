import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { CurrentUser } from '../common/auth/current-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { bootstrapSchema, changePasswordSchema, createStaffSchema, deactivateStaffSchema, loginSchema, resetStaffPasswordSchema, updateMyCredentialsSchema, verifyAdminPasswordSchema } from './auth.schemas';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { UserRole } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService
  ) {}

  @Post('starter-pos-data')
  async starterPosData() {
    const org = await this.prisma.organization.findFirst();
    if (!org) return { success: false, error: 'No organization' };

    const categories = [
      { name: 'Sarees', imageUrl: 'https://placehold.co/400x400/png?text=Sarees' },
      { name: 'Kurtas', imageUrl: 'https://placehold.co/400x400/png?text=Kurtas' },
      { name: 'Indo-western', imageUrl: 'https://placehold.co/400x400/png?text=Indo-western' },
      { name: 'Blouse', imageUrl: 'https://placehold.co/400x400/png?text=Blouse' },
      { name: 'Pants', imageUrl: 'https://placehold.co/400x400/png?text=Pants' }
    ];

    const categoryMap = new Map<string, string>();
    for (const c of categories) {
      const cat = await this.prisma.productCategory.upsert({
        where: { orgId_name: { orgId: org.id, name: c.name } },
        update: { imageUrl: c.imageUrl },
        create: { orgId: org.id, name: c.name, imageUrl: c.imageUrl }
      });
      categoryMap.set(c.name, cat.id);
    }

    const products = [
      {
        code: 'SAR-0001',
        name: 'Silk Kanjeevaram Saree',
        hsnCode: '5007',
        gstRateBp: 500,
        sellingPricePaise: 850000n,
        costPricePaise: 450000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Silk+Saree',
        categoryName: 'Sarees'
      },
      {
        code: 'SAR-0002',
        name: 'Cotton Banarasi Saree',
        hsnCode: '5208',
        gstRateBp: 500,
        sellingPricePaise: 350000n,
        costPricePaise: 180000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Cotton+Saree',
        categoryName: 'Sarees'
      },
      {
        code: 'KUR-0001',
        name: 'Anarkali Kurta',
        hsnCode: '6204',
        gstRateBp: 1200,
        sellingPricePaise: 250000n,
        costPricePaise: 120000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Anarkali',
        categoryName: 'Kurtas'
      },
      {
        code: 'KUR-0002',
        name: 'Straight Cut Kurta',
        hsnCode: '6204',
        gstRateBp: 500,
        sellingPricePaise: 150000n,
        costPricePaise: 80000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Straight+Kurta',
        categoryName: 'Kurtas'
      },
      {
        code: 'IND-0001',
        name: 'Indo-western Gown',
        hsnCode: '6204',
        gstRateBp: 1200,
        sellingPricePaise: 450000n,
        costPricePaise: 220000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Indo+Gown',
        categoryName: 'Indo-western'
      },
      {
        code: 'BLS-0001',
        name: 'Designer Blouse',
        hsnCode: '6206',
        gstRateBp: 500,
        sellingPricePaise: 120000n,
        costPricePaise: 60000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Blouse',
        categoryName: 'Blouse'
      },
      {
        code: 'PNT-0001',
        name: 'Palazzo Pants',
        hsnCode: '6204',
        gstRateBp: 500,
        sellingPricePaise: 180000n,
        costPricePaise: 90000n,
        imageUrl: 'https://placehold.co/600x600/png?text=Palazzo',
        categoryName: 'Pants'
      }
    ];

    for (const s of products) {
      const categoryId = categoryMap.get(s.categoryName);
      const { categoryName, ...productData } = s;
      await this.prisma.product.upsert({
        where: { orgId_code: { orgId: org.id, code: s.code } },
        update: { ...productData, categoryId },
        create: { ...productData, orgId: org.id, categoryId }
      });
    }

    return { success: true };
  }

  @Post('bootstrap')
  @UsePipes(new ZodValidationPipe(bootstrapSchema))
  async bootstrap(@Body() body: any) {
    return this.auth.bootstrap(body);
  }

  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() body: any) {
    return this.auth.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return { user };
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  async listStoreUsers(@CurrentUser() user: any) {
    if (!user.storeId) return { users: [] };
    return { users: await this.auth.listStoreUsers(user.orgId, user.storeId) };
  }

  @Post('verify-admin-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async verifyAdminPassword(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(verifyAdminPasswordSchema)) body: any
  ) {
    return this.auth.verifyAdminPassword({ userId: user.sub, password: body.password });
  }

  @Post('staff')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createStaff(@CurrentUser() user: any, @Body(new ZodValidationPipe(createStaffSchema)) body: any) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    return {
      user: await this.auth.createStaffUser({
        orgId: user.orgId,
        storeId: user.storeId,
        fullName: body.fullName,
        phone: body.phone,
        email: body.email,
        password: body.password
      })
    };
  }

  @Post('staff/:id/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async resetStaffPassword(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetStaffPasswordSchema)) body: any
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    await this.auth.verifyAdminPassword({ userId: user.sub, password: body.adminPassword });
    return this.auth.resetStaffPassword({
      orgId: user.orgId,
      storeId: user.storeId,
      staffUserId: id,
      newPassword: body.newPassword
    });
  }

  @Post('staff/:id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deactivateStaff(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deactivateStaffSchema)) body: any
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    await this.auth.verifyAdminPassword({ userId: user.sub, password: body.adminPassword });
    return this.auth.deactivateStaff({ orgId: user.orgId, storeId: user.storeId, staffUserId: id });
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@CurrentUser() user: any, @Body(new ZodValidationPipe(changePasswordSchema)) body: any) {
    if (!body.newPassword || !body.currentPassword) throw new BadRequestException('Invalid password');
    return this.auth.changePassword({ userId: user.sub, currentPassword: body.currentPassword, newPassword: body.newPassword });
  }

  @Get('my-profile')
  @UseGuards(JwtAuthGuard)
  async myProfile(@CurrentUser() user: any) {
    return this.auth.getMyProfile(user.sub);
  }

  @Post('my-profile')
  @UseGuards(JwtAuthGuard)
  async updateMyProfile(@CurrentUser() user: any, @Body(new ZodValidationPipe(updateMyCredentialsSchema)) body: any) {
    return this.auth.updateMyCredentials({
      userId: user.sub,
      fullName: body.fullName,
      phone: body.phone,
      email: body.email,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword
    });
  }
}
