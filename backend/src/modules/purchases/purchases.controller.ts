import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '.prisma/client';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createPurchaseInvoiceSchema, createSupplierSchema } from './purchases.schemas';
import { PurchasesService } from './purchases.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get('purchases/suppliers')
  async listSuppliers(@CurrentUser() user: any, @Query('q') q?: string) {
    return { suppliers: await this.purchases.listSuppliers(user.orgId, q) };
  }

  @Post('purchases/suppliers')
  @Roles(UserRole.ADMIN)
  async createSupplier(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createSupplierSchema)) body: any
  ) {
    return { supplier: await this.purchases.createSupplier(user.orgId, body) };
  }

  @Post('purchases/invoices')
  @Roles(UserRole.ADMIN)
  async createPurchaseInvoice(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createPurchaseInvoiceSchema)) body: any
  ) {
    return await this.purchases.createPurchaseInvoice(user, body);
  }

  @Get('purchases/invoices')
  async list(@CurrentUser() user: any) {
    if (!user.storeId) return { purchaseInvoices: [] };
    return { purchaseInvoices: await this.purchases.listPurchaseInvoices(user.orgId, user.storeId) };
  }

  @Get('purchases/invoices/:id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    if (!user.storeId) throw new NotFoundException('Purchase invoice not found');
    const purchaseInvoice = await this.purchases.getPurchaseInvoice(user.orgId, user.storeId, id);
    if (!purchaseInvoice) throw new NotFoundException('Purchase invoice not found');
    return { purchaseInvoice };
  }
}
