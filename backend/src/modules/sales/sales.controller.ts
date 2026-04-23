import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '.prisma/client';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createCustomerCreditReceiptSchema, createCustomerCreditSettlementSchema, createReturnSchema, createSalesInvoiceSchema, invoiceLookupSchema, listCustomerCreditBalancesSchema, listCustomerCreditDuesSchema, listCustomerCreditSchema, listCustomerCreditSettlementsSchema, listReturnsSchema } from './sales.schemas';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post('invoices')
  async create(@CurrentUser() user: any, @Body(new ZodValidationPipe(createSalesInvoiceSchema)) body: any) {
    return this.sales.createSalesInvoice(user, body);
  }

  @Get('invoices/lookup')
  async lookup(@CurrentUser() user: any, @Query(new ZodValidationPipe(invoiceLookupSchema)) query: any) {
    return this.sales.lookupInvoiceForReturn(user, query.invoiceNo);
  }

  @Get('invoices')
  async list(@CurrentUser() user: any) {
    if (!user.storeId) return { invoices: [] };
    return { invoices: await this.sales.listSalesInvoices(user.orgId, user.storeId) };
  }

  @Get('invoices/:id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    if (!user.storeId) throw new NotFoundException('Invoice not found');
    const invoice = await this.sales.getSalesInvoice(user.orgId, user.storeId, id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return { invoice };
  }

  @Post('returns')
  async createReturn(@CurrentUser() user: any, @Body(new ZodValidationPipe(createReturnSchema)) body: any) {
    return this.sales.createSalesReturn(user, body);
  }

  @Get('returns')
  @Roles(UserRole.ADMIN)
  async listReturns(@CurrentUser() user: any, @Query(new ZodValidationPipe(listReturnsSchema)) query: any) {
    return { returns: await this.sales.listReturns(user.orgId, query.storeId, query.q) };
  }

  @Post('invoices/:id/share')
  async createShare(@CurrentUser() user: any, @Param('id') id: string) {
    const link = await this.sales.createInvoiceShareLink(user, id);
    const feedback = await this.sales.getInvoiceFeedbackLink(user.orgId, id);
    return {
      token: link.token,
      thermalPath: `/share/${link.token}/thermal`,
      a4Path: `/share/${link.token}/a4`,
      feedbackPath: feedback ? `/feedback/${feedback.token}` : null
    };
  }

  @Post('returns/:id/share')
  async createReturnShare(@CurrentUser() user: any, @Param('id') id: string) {
    const link = await this.sales.createReturnShareLink(user, id);
    return { token: link.token, thermalPath: `/share/return/${link.token}/thermal`, a4Path: `/share/return/${link.token}/a4` };
  }

  @Post('credit-receipts')
  async createCreditReceipt(@CurrentUser() user: any, @Body(new ZodValidationPipe(createCustomerCreditReceiptSchema)) body: any) {
    return this.sales.createCustomerCreditReceipt(user, body);
  }

  @Post('credit-settlements')
  async createCreditSettlement(@CurrentUser() user: any, @Body(new ZodValidationPipe(createCustomerCreditSettlementSchema)) body: any) {
    return this.sales.createCustomerCreditSettlement(user, body);
  }

  @Get('credit-receipts')
  @Roles(UserRole.ADMIN)
  async listCreditReceipts(@CurrentUser() user: any, @Query(new ZodValidationPipe(listCustomerCreditSchema)) query: any) {
    return { receipts: await this.sales.listCustomerCreditReceipts(user.orgId, query.q) };
  }

  @Get('credit-balances')
  @Roles(UserRole.ADMIN)
  async listCreditBalances(@CurrentUser() user: any, @Query(new ZodValidationPipe(listCustomerCreditBalancesSchema)) query: any) {
    return { balances: await this.sales.listCustomerCreditBalances(user.orgId, query.q) };
  }

  @Get('credit-dues')
  @Roles(UserRole.ADMIN)
  async listCreditDues(@CurrentUser() user: any, @Query(new ZodValidationPipe(listCustomerCreditDuesSchema)) query: any) {
    return { dues: await this.sales.listCustomerCreditDues(user.orgId, query.q) };
  }

  @Get('credit-settlements')
  @Roles(UserRole.ADMIN)
  async listCreditSettlements(@CurrentUser() user: any, @Query(new ZodValidationPipe(listCustomerCreditSettlementsSchema)) query: any) {
    return { settlements: await this.sales.listCustomerCreditSettlements(user.orgId, query.q) };
  }

  @Post('credit-receipts/:id/share')
  async shareCreditReceipt(@CurrentUser() user: any, @Param('id') id: string) {
    const link = await this.sales.createCustomerCreditShareLink(user, id);
    return { token: link.token, thermalPath: `/share/credit/${link.token}/thermal`, a4Path: `/share/credit/${link.token}/a4` };
  }
}
