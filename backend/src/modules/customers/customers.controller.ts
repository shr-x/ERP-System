import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createCustomerSchema, updateCustomerSchema, updateCustomerStitchingSchema } from './customers.schemas';
import { CustomersService } from './customers.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('customers')
  async list(@CurrentUser() user: any, @Query('q') q?: string) {
    return { customers: await this.customers.searchCustomers(user.orgId, q) };
  }

  @Post('customers')
  async create(@CurrentUser() user: any, @Body(new ZodValidationPipe(createCustomerSchema)) body: any) {
    return { customer: await this.customers.createCustomer(user.orgId, body) };
  }

  @Patch('customers/:id')
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body(new ZodValidationPipe(updateCustomerSchema)) body: any) {
    return { customer: await this.customers.updateCustomer(user.orgId, id, body) };
  }

  @Patch('customers/:id/block')
  async block(@CurrentUser() user: any, @Param('id') id: string) {
    return { customer: await this.customers.setBlocked(user.orgId, id, true) };
  }

  @Patch('customers/:id/unblock')
  async unblock(@CurrentUser() user: any, @Param('id') id: string) {
    return { customer: await this.customers.setBlocked(user.orgId, id, false) };
  }

  @Delete('customers/:id')
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return await this.customers.deleteCustomer(user.orgId, id);
  }

  @Get('customers/:id/orders')
  async orders(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customers.getCustomerOrderHistory(user.orgId, id);
  }

  @Patch('customers/:id/stitching')
  async upsertStitching(@CurrentUser() user: any, @Param('id') id: string, @Body(new ZodValidationPipe(updateCustomerStitchingSchema)) body: any) {
    const profile = await this.customers.upsertStitchingProfile(user.orgId, id, { notes: body.notes });
    return { profile: { ...profile, updatedAt: profile.updatedAt.toISOString() } };
  }
}
