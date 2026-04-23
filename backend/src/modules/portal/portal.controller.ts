import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { InventoryService } from '../inventory/inventory.service';
import { StitchingProductsService } from '../stitching/products/stitching-products.service';
import { CreateStitchingProductTemplateDto, UpdateStitchingProductTemplateDto } from '../stitching/products/stitching-products.dtos';
import { ErpService } from '../erp/erp.service';
import { createStoreSchema, createWarehouseSchema, updateStoreSchema } from '../stores/stores.schemas';
import { StoresService } from '../stores/stores.service';
import {
  portalCreateAdminUserSchema,
  portalCreateCategorySchema,
  portalCreateCustomerSchema,
  portalCreateProductSchema,
  portalCreateStitchingCategorySchema,
  portalCreateSupplierSchema,
  portalDirectReceiveSchema,
  portalUpdateCategorySchema,
  portalUpdateCustomerSchema,
  portalUpdateOrgSchema,
  portalUpdateProductSchema,
  portalUpdateStitchingCategorySchema,
  portalUpdateSupplierSchema,
  portalUpdateUserSchema
} from './portal.schemas';
import { PortalGuard } from './portal.guard';

@Controller('portal')
@UseGuards(PortalGuard)
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly stitchingProducts: StitchingProductsService,
    private readonly erp: ErpService,
    private readonly storesService: StoresService
  ) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('orgs')
  async orgs() {
    return {
      orgs: await this.prisma.organization.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, gstin: true }
      })
    };
  }

  @Patch('orgs/:id')
  async updateOrg(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(portalUpdateOrgSchema)) body: any
  ) {
    const existing = await this.prisma.organization.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new BadRequestException('Invalid org');
    const gstin = typeof body.gstin === 'string' ? (body.gstin.trim() ? body.gstin.trim().toUpperCase() : null) : undefined;
    return {
      org: await this.prisma.organization.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(gstin !== undefined ? { gstin } : {})
        } as any,
        select: { id: true, name: true, gstin: true }
      })
    };
  }

  @Get('stores')
  async stores(@Query('orgId') orgId?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { stores: await this.storesService.listStores(orgId) };
  }

  @Post('stores')
  async createStore(@Query('orgId') orgId?: string, @Body(new ZodValidationPipe(createStoreSchema)) body?: any) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { store: await this.storesService.createStore(orgId, body) };
  }

  @Patch('stores/:id')
  async updateStore(
    @Query('orgId') orgId?: string,
    @Param('id') storeId?: string,
    @Body(new ZodValidationPipe(updateStoreSchema)) body?: any
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!storeId || !storeId.trim()) throw new BadRequestException('storeId is required');
    return { store: await this.storesService.updateStore(orgId, storeId, body) };
  }

  @Delete('stores/:id')
  async deleteStore(@Query('orgId') orgId?: string, @Param('id') storeId?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!storeId || !storeId.trim()) throw new BadRequestException('storeId is required');
    await this.storesService.deleteStore(orgId, storeId);
    return { ok: true };
  }

  @Get('warehouses')
  async warehouses(@Query('orgId') orgId?: string, @Query('storeId') storeId?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!storeId || !storeId.trim()) throw new BadRequestException('storeId is required');
    return { warehouses: await this.storesService.listWarehouses(orgId, storeId) };
  }

  @Post('warehouses')
  async createWarehouse(@Query('orgId') orgId?: string, @Body(new ZodValidationPipe(createWarehouseSchema)) body?: any) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { warehouse: await this.storesService.createWarehouse(orgId, body) };
  }

  @Delete('warehouses/:id')
  async deleteWarehouse(@Query('orgId') orgId?: string, @Param('id') warehouseId?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!warehouseId || !warehouseId.trim()) throw new BadRequestException('warehouseId is required');
    await this.storesService.deleteWarehouse(orgId, warehouseId);
    return { ok: true };
  }

  @Get('materials')
  async materials(
    @Query('orgId') orgId?: string,
    @Query('storeId') storeId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const p = page ? Number(page) : 1;
    const ps = pageSize ? Number(pageSize) : 20;
    if (!Number.isFinite(p) || p <= 0) throw new BadRequestException('Invalid page');
    if (!Number.isFinite(ps) || ps <= 0) throw new BadRequestException('Invalid pageSize');
    return await this.erp.listDressMaterials(orgId, {
      storeId: storeId && storeId.trim() ? storeId : undefined,
      q: q && q.trim() ? q : undefined,
      page: p,
      pageSize: ps
    });
  }

  @Get('materials/by-ids')
  async materialsByIds(@Query('orgId') orgId?: string, @Query('storeId') storeId?: string, @Query('ids') ids?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const arr = (ids || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return await this.erp.listDressMaterialsByIds(orgId, {
      storeId: storeId && storeId.trim() ? storeId : undefined,
      ids: arr
    });
  }

  @Get('users')
  async users(@Query('orgId') orgId?: string, @Query('includeInactive') includeInactive?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const include = includeInactive === '1' || includeInactive === 'true';
    return {
      users: await this.prisma.user.findMany({
        where: { orgId, ...(include ? {} : { isActive: true }) } as any,
        orderBy: { createdAt: 'desc' },
        select: { id: true, fullName: true, phone: true, email: true, role: true, storeId: true, isActive: true, createdAt: true }
      })
    };
  }

  @Patch('users/:id')
  async updateUser(
    @Query('orgId') orgId?: string,
    @Param('id') id?: string,
    @Body(new ZodValidationPipe(portalUpdateUserSchema)) body?: any
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('user id is required');

    const existing = await this.prisma.user.findFirst({
      where: { id, orgId },
      select: { id: true, role: true, isActive: true }
    });
    if (!existing) throw new BadRequestException('Invalid user');

    const nextRole = body.role !== undefined ? body.role : existing.role;
    const nextActive = body.isActive !== undefined ? body.isActive : existing.isActive;

    if ((existing.role === 'ADMIN' || nextRole === 'ADMIN') && nextActive === false) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          orgId,
          isActive: true,
          role: 'ADMIN' as any,
          id: { not: id }
        } as any
      });
      if (activeAdminCount === 0) throw new BadRequestException('Cannot deactivate the last active admin');
    }

    if (existing.role === 'ADMIN' && nextRole === 'STAFF' && existing.isActive) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          orgId,
          isActive: true,
          role: 'ADMIN' as any,
          id: { not: id }
        } as any
      });
      if (activeAdminCount === 0) throw new BadRequestException('Cannot remove the last active admin role');
    }

    const email = typeof body.email === 'string' ? (body.email.trim() ? body.email.trim().toLowerCase() : null) : undefined;
    const phone = typeof body.phone === 'string' ? (body.phone.trim() ? body.phone.trim() : null) : undefined;
    const storeId = typeof body.storeId === 'string' ? (body.storeId.trim() ? body.storeId.trim() : null) : undefined;

    try {
      return {
        user: await this.prisma.user.update({
          where: { id },
          data: {
            ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
            ...(phone !== undefined ? { phone } : {}),
            ...(email !== undefined ? { email } : {}),
            ...(body.role !== undefined ? { role: body.role } : {}),
            ...(storeId !== undefined ? { storeId } : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {})
          } as any,
          select: { id: true, fullName: true, phone: true, email: true, role: true, storeId: true, isActive: true, createdAt: true } as any
        })
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Phone/email already in use');
      throw e;
    }
  }

  @Post('admin-users')
  async createAdmin(@Body(new ZodValidationPipe(portalCreateAdminUserSchema)) body: any) {
    const storeId = body.storeId && body.storeId.trim() !== '' ? body.storeId : null;
    return {
      user: await this.auth.createAdminUser({
        orgId: body.orgId,
        storeId,
        fullName: body.fullName,
        phone: body.phone,
        email: body.email && body.email.trim() !== '' ? body.email.trim() : undefined,
        password: body.password
      })
    };
  }

  @Get('products')
  async listPortalProducts(@Query('orgId') orgId?: string, @Query('q') q?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const query = q?.trim();
    return {
      products: await this.prisma.product.findMany({
        where: {
          orgId,
          isActive: true,
          ...(query
            ? {
                OR: [
                  { code: { contains: query, mode: 'insensitive' } },
                  { name: { contains: query, mode: 'insensitive' } }
                ]
              }
            : {})
        } as any,
        orderBy: { createdAt: 'desc' },
        take: query ? 50 : 500,
        select: {
          id: true,
          code: true,
          name: true,
          hsnCode: true,
          gstRateBp: true,
          sellingPricePaise: true,
          costPricePaise: true,
          posVisible: true,
          isPortalManaged: true,
          categoryId: true,
          category: { select: { name: true } }
        } as any
      })
    };
  }

  @Post('products')
  async createPortalProduct(
    @Query('orgId') orgId: string,
    @Body(new ZodValidationPipe(portalCreateProductSchema)) body: any
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return {
      product: await this.products.createProduct(orgId, {
        ...body,
        posVisible: body.posVisible ?? true,
        isPortalManaged: true
      })
    };
  }

  @Patch('products/:id')
  async updatePortalProduct(
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(portalUpdateProductSchema)) body: any
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { product: await this.products.updateProduct(orgId, id, body) };
  }

  @Delete('products/:id')
  async deletePortalProduct(@Query('orgId') orgId?: string, @Param('id') id?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    return { product: await this.products.deleteProduct(orgId, id) };
  }

  @Get('categories')
  async listCategories(@Query('orgId') orgId?: string, @Query('q') q?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const query = q?.trim();
    return {
      categories: await this.prisma.productCategory.findMany({
        where: {
          orgId,
          ...(query ? { name: { contains: query, mode: 'insensitive' } } : {})
        } as any,
        orderBy: { name: 'asc' },
        take: query ? 50 : 500,
        select: { id: true, name: true, imageUrl: true, posVisible: true } as any
      } as any)
    };
  }

  @Post('categories')
  async createCategory(@Query('orgId') orgId?: string, @Body(new ZodValidationPipe(portalCreateCategorySchema)) body?: any) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    try {
      return {
        category: await this.prisma.productCategory.create({
          data: {
            orgId,
            name: body.name,
            imageUrl: body.imageUrl && body.imageUrl.trim() ? body.imageUrl.trim() : null,
            posVisible: body.posVisible ?? true
          } as any,
          select: { id: true, name: true, imageUrl: true, posVisible: true } as any
        } as any)
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Category name already exists');
      throw e;
    }
  }

  @Patch('categories/:id')
  async updateCategory(
    @Query('orgId') orgId?: string,
    @Param('id') id?: string,
    @Body(new ZodValidationPipe(portalUpdateCategorySchema)) body?: any
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    const existing = await this.prisma.productCategory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!existing) throw new BadRequestException('Invalid category');

    try {
      return {
        category: await this.prisma.productCategory.update({
          where: { id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl.trim() ? body.imageUrl.trim() : null } : {}),
            ...(body.posVisible !== undefined ? { posVisible: body.posVisible } : {})
          } as any,
          select: { id: true, name: true, imageUrl: true, posVisible: true } as any
        } as any)
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Category name already exists');
      throw e;
    }
  }

  @Delete('categories/:id')
  async deleteCategory(@Query('orgId') orgId?: string, @Param('id') id?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');

    const existing = await this.prisma.productCategory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!existing) throw new BadRequestException('Invalid category');
    const hasProducts = await this.prisma.product.findFirst({ where: { orgId, categoryId: id, isActive: true } as any, select: { id: true } });
    if (hasProducts) throw new BadRequestException('Category has products and cannot be deleted');
    await this.prisma.productCategory.delete({ where: { id }, select: { id: true } });
    return { ok: true };
  }

  @Get('stitching/categories')
  async listStitchingCategories(@Query('orgId') orgId?: string, @Query('q') q?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const query = q?.trim();
    return {
      categories: await (this.prisma as any).stitchingTemplateCategory.findMany({
        where: {
          orgId,
          ...(query ? { name: { contains: query, mode: 'insensitive' } } : {})
        } as any,
        orderBy: { name: 'asc' },
        take: query ? 50 : 500,
        select: { id: true, name: true, posVisible: true } as any
      } as any)
    };
  }

  @Post('stitching/categories')
  async createStitchingCategory(@Query('orgId') orgId?: string, @Body(new ZodValidationPipe(portalCreateStitchingCategorySchema)) body?: any) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    try {
      return {
        category: await (this.prisma as any).stitchingTemplateCategory.create({
          data: {
            orgId,
            name: body.name,
            posVisible: body.posVisible ?? true
          } as any,
          select: { id: true, name: true, posVisible: true } as any
        } as any)
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Category name already exists');
      throw e;
    }
  }

  @Patch('stitching/categories/:id')
  async updateStitchingCategory(
    @Query('orgId') orgId?: string,
    @Param('id') id?: string,
    @Body(new ZodValidationPipe(portalUpdateStitchingCategorySchema)) body?: any
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    const existing = await (this.prisma as any).stitchingTemplateCategory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!existing) throw new BadRequestException('Invalid category');

    try {
      return {
        category: await (this.prisma as any).stitchingTemplateCategory.update({
          where: { id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.posVisible !== undefined ? { posVisible: body.posVisible } : {})
          } as any,
          select: { id: true, name: true, posVisible: true } as any
        } as any)
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Category name already exists');
      throw e;
    }
  }

  @Delete('stitching/categories/:id')
  async deleteStitchingCategory(@Query('orgId') orgId?: string, @Param('id') id?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');

    const existing = await (this.prisma as any).stitchingTemplateCategory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!existing) throw new BadRequestException('Invalid category');
    const hasTemplates = await this.prisma.stitchingProductTemplate.findFirst({ where: { orgId, categoryId: id } as any, select: { id: true } });
    if (hasTemplates) throw new BadRequestException('Category has templates and cannot be deleted');
    await (this.prisma as any).stitchingTemplateCategory.delete({ where: { id }, select: { id: true } });
    return { ok: true };
  }

  @Get('customers')
  async listCustomers(@Query('orgId') orgId?: string, @Query('q') q?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const query = q?.trim();
    return {
      customers: await this.prisma.customer.findMany({
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
        } as any,
        orderBy: { updatedAt: 'desc' } as any,
        take: query ? 50 : 500,
        select: {
          id: true,
          fullName: true,
          phone: true,
          gstin: true,
          isBusiness: true,
          stateCode: true,
          address: true,
          pincode: true,
          isBlocked: true,
          isWalkIn: true
        } as any
      } as any)
    };
  }

  @Post('customers')
  async createCustomer(@Query('orgId') orgId?: string, @Body(new ZodValidationPipe(portalCreateCustomerSchema)) body?: any) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const gstin = body.gstin && body.gstin.trim() ? body.gstin.trim().toUpperCase() : null;
    try {
      return {
        customer: await this.prisma.customer.create({
          data: {
            orgId,
            fullName: body.fullName,
            phone: body.phone && body.phone.trim() ? body.phone.trim() : null,
            gstin,
            isBusiness: body.isBusiness === true,
            stateCode: body.stateCode && body.stateCode.trim() ? body.stateCode.trim() : null,
            address: body.address && body.address.trim() ? body.address.trim() : null,
            pincode: body.pincode && body.pincode.trim() ? body.pincode.trim() : null
          } as any,
          select: { id: true, fullName: true, phone: true, gstin: true, isBusiness: true, stateCode: true, address: true, pincode: true, isBlocked: true, isWalkIn: true } as any
        } as any)
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Customer already exists');
      throw e;
    }
  }

  @Patch('customers/:id')
  async updateCustomer(
    @Query('orgId') orgId?: string,
    @Param('id') id?: string,
    @Body(new ZodValidationPipe(portalUpdateCustomerSchema)) body?: any
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    const existing = await this.prisma.customer.findFirst({ where: { id, orgId, isWalkIn: false } as any, select: { id: true } });
    if (!existing) throw new BadRequestException('Customer not found');
    const gstin = typeof body.gstin === 'string' ? (body.gstin.trim() ? body.gstin.trim().toUpperCase() : null) : undefined;
    try {
      return {
        customer: await this.prisma.customer.update({
          where: { id },
          data: {
            ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
            ...(typeof body.phone === 'string' ? { phone: body.phone.trim() ? body.phone.trim() : null } : {}),
            ...(gstin !== undefined ? { gstin } : {}),
            ...(body.isBusiness !== undefined ? { isBusiness: body.isBusiness === true } : {}),
            ...(typeof body.stateCode === 'string' ? { stateCode: body.stateCode.trim() ? body.stateCode.trim() : null } : {}),
            ...(typeof body.address === 'string' ? { address: body.address.trim() ? body.address.trim() : null } : {}),
            ...(typeof body.pincode === 'string' ? { pincode: body.pincode.trim() ? body.pincode.trim() : null } : {}),
            ...(body.isBlocked !== undefined ? { isBlocked: body.isBlocked, blockedAt: body.isBlocked ? new Date() : null } : {})
          } as any,
          select: { id: true, fullName: true, phone: true, gstin: true, isBusiness: true, stateCode: true, address: true, pincode: true, isBlocked: true, isWalkIn: true } as any
        } as any)
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Customer already exists');
      throw e;
    }
  }

  @Patch('customers/:id/block')
  async blockCustomer(@Query('orgId') orgId?: string, @Param('id') id?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    const existing = await this.prisma.customer.findFirst({ where: { id, orgId, isWalkIn: false } as any, select: { id: true } });
    if (!existing) throw new BadRequestException('Customer not found');
    return {
      customer: await this.prisma.customer.update({
        where: { id },
        data: { isBlocked: true, blockedAt: new Date() } as any,
        select: { id: true, isBlocked: true, blockedAt: true } as any
      } as any)
    };
  }

  @Patch('customers/:id/unblock')
  async unblockCustomer(@Query('orgId') orgId?: string, @Param('id') id?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    const existing = await this.prisma.customer.findFirst({ where: { id, orgId, isWalkIn: false } as any, select: { id: true } });
    if (!existing) throw new BadRequestException('Customer not found');
    return {
      customer: await this.prisma.customer.update({
        where: { id },
        data: { isBlocked: false, blockedAt: null } as any,
        select: { id: true, isBlocked: true, blockedAt: true } as any
      } as any)
    };
  }

  @Delete('customers/:id')
  async deleteCustomer(@Query('orgId') orgId?: string, @Param('id') id?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    const existing = await this.prisma.customer.findFirst({ where: { id, orgId, isWalkIn: false } as any, select: { id: true } });
    if (!existing) throw new BadRequestException('Customer not found');
    const invCount = await this.prisma.salesInvoice.count({ where: { orgId, customerId: id } as any });
    if (invCount > 0) throw new BadRequestException('Cannot delete: customer has invoices');
    await this.prisma.customer.delete({ where: { id } });
    return { ok: true };
  }

  @Get('suppliers')
  async listSuppliers(@Query('orgId') orgId?: string, @Query('q') q?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const query = q?.trim();
    return {
      suppliers: await this.prisma.supplier.findMany({
        where: { orgId, ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}) } as any,
        orderBy: { name: 'asc' },
        take: query ? 50 : 500,
        select: { id: true, name: true, gstin: true, stateCode: true, createdAt: true } as any
      } as any)
    };
  }

  @Post('suppliers')
  async createSupplier(@Query('orgId') orgId?: string, @Body(new ZodValidationPipe(portalCreateSupplierSchema)) body?: any) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    try {
      return {
        supplier: await this.prisma.supplier.create({
          data: {
            orgId,
            name: body.name,
            gstin: body.gstin && body.gstin.trim() ? body.gstin.trim().toUpperCase() : null,
            stateCode: body.stateCode && body.stateCode.trim() ? body.stateCode.trim() : null
          } as any,
          select: { id: true, name: true, gstin: true, stateCode: true, createdAt: true } as any
        } as any)
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Supplier already exists');
      throw e;
    }
  }

  @Patch('suppliers/:id')
  async updateSupplier(
    @Query('orgId') orgId?: string,
    @Param('id') id?: string,
    @Body(new ZodValidationPipe(portalUpdateSupplierSchema)) body?: any
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    const existing = await this.prisma.supplier.findFirst({ where: { id, orgId } as any, select: { id: true } });
    if (!existing) throw new BadRequestException('Supplier not found');
    try {
      return {
        supplier: await this.prisma.supplier.update({
          where: { id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(typeof body.gstin === 'string'
              ? { gstin: body.gstin.trim() ? body.gstin.trim().toUpperCase() : null }
              : {}),
            ...(typeof body.stateCode === 'string' ? { stateCode: body.stateCode.trim() ? body.stateCode.trim() : null } : {})
          } as any,
          select: { id: true, name: true, gstin: true, stateCode: true, createdAt: true } as any
        } as any)
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Supplier already exists');
      throw e;
    }
  }

  @Delete('suppliers/:id')
  async deleteSupplier(@Query('orgId') orgId?: string, @Param('id') id?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    const existing = await this.prisma.supplier.findFirst({ where: { id, orgId } as any, select: { id: true } });
    if (!existing) throw new BadRequestException('Supplier not found');
    const invCount = await (this.prisma as any).purchaseInvoice.count({ where: { orgId, supplierId: id } });
    if (invCount > 0) throw new BadRequestException('Cannot delete: supplier has purchase invoices');
    await this.prisma.supplier.delete({ where: { id } });
    return { ok: true };
  }

  @Post('direct-stock')
  async directStock(@Body(new ZodValidationPipe(portalDirectReceiveSchema)) body: any) {
    const actor = body.actorAdminUserId && body.actorAdminUserId.trim() !== '' ? body.actorAdminUserId : null;
    let actorAdminUserId = actor;
    if (!actorAdminUserId) {
      const admin = await this.prisma.user.findFirst({
        where: { orgId: body.orgId, storeId: body.storeId, role: 'ADMIN' as any, isActive: true },
        select: { id: true }
      });
      if (!admin) throw new BadRequestException('actorAdminUserId is required (no admin user found for this store)');
      actorAdminUserId = admin.id;
    }

    return await this.inventory.portalReceiveDirectStock({
      orgId: body.orgId,
      storeId: body.storeId,
      postedByUserId: actorAdminUserId,
      warehouseId: body.warehouseId,
      productId: body.productId,
      qty: body.qty,
      unitCostRupees: body.unitCostRupees,
      receivedAt: body.receivedAt && body.receivedAt.trim() !== '' ? body.receivedAt : undefined
    });
  }

  @Get('stitching/templates')
  async listStitchingTemplates(
    @Query('orgId') orgId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    const p = page ? Number(page) : 1;
    const ps = pageSize ? Number(pageSize) : 20;
    if (!Number.isFinite(p) || p <= 0) throw new BadRequestException('Invalid page');
    if (!Number.isFinite(ps) || ps <= 0) throw new BadRequestException('Invalid pageSize');
    return await this.stitchingProducts.list(orgId, { q, page: p, pageSize: ps });
  }

  @Get('stitching/templates/:id')
  async getStitchingTemplate(@Query('orgId') orgId?: string, @Param('id') id?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { template: await this.stitchingProducts.get(orgId, id!) };
  }

  @Post('stitching/templates')
  async createStitchingTemplate(@Query('orgId') orgId?: string, @Body() body?: CreateStitchingProductTemplateDto) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { template: await this.stitchingProducts.create(orgId, body!) };
  }

  @Patch('stitching/templates/:id')
  async updateStitchingTemplate(
    @Query('orgId') orgId?: string,
    @Param('id') id?: string,
    @Body() body?: UpdateStitchingProductTemplateDto
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { template: await this.stitchingProducts.update(orgId, id!, body!) };
  }

  @Delete('stitching/templates/:id')
  async deleteStitchingTemplate(@Query('orgId') orgId?: string, @Param('id') id?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return await this.stitchingProducts.delete(orgId, id!);
  }

  @Post('stitching/templates/:id/colors')
  async addStitchingColor(@Query('orgId') orgId?: string, @Param('id') id?: string, @Body() body?: any) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { color: await this.stitchingProducts.addColor(orgId, id!, body) };
  }

  @Delete('stitching/templates/:id/colors/:colorId')
  async deleteStitchingColor(@Query('orgId') orgId?: string, @Param('id') id?: string, @Param('colorId') colorId?: string) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return this.stitchingProducts.deleteColor(orgId, id!, colorId!);
  }

  @Post('stitching/templates/:id/colors/:colorId/image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2_000_000 } }))
  async uploadStitchingColorImage(
    @Query('orgId') orgId?: string,
    @Param('id') id?: string,
    @Param('colorId') colorId?: string,
    @UploadedFile() file?: any
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    if (!file?.buffer) throw new BadRequestException('file is required');
    return { color: await this.stitchingProducts.setColorImage(orgId, id!, colorId!, file) };
  }

  @Post('stitching/templates/:id/measurement-profiles')
  async addStitchingMeasurementProfile(@Query('orgId') orgId?: string, @Param('id') id?: string, @Body() body?: any) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { profile: await this.stitchingProducts.addMeasurementProfile(orgId, id!, body) };
  }

  @Delete('stitching/templates/:id/measurement-profiles/:profileId')
  async deleteStitchingMeasurementProfile(
    @Query('orgId') orgId?: string,
    @Param('id') id?: string,
    @Param('profileId') profileId?: string
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return this.stitchingProducts.deleteMeasurementProfile(orgId, id!, profileId!);
  }

  @Post('stitching/templates/:id/material-configs')
  async addStitchingMaterialConfig(@Query('orgId') orgId?: string, @Param('id') id?: string, @Body() body?: any) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return { config: await this.stitchingProducts.addMaterialConfig(orgId, id!, body) };
  }

  @Delete('stitching/templates/:id/material-configs/:configId')
  async deleteStitchingMaterialConfig(
    @Query('orgId') orgId?: string,
    @Param('id') id?: string,
    @Param('configId') configId?: string
  ) {
    if (!orgId || !orgId.trim()) throw new BadRequestException('orgId is required');
    return this.stitchingProducts.deleteMaterialConfig(orgId, id!, configId!);
  }
}
