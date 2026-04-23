import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '.prisma/client';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createStoreSchema, createWarehouseSchema, updateStoreSchema } from './stores.schemas';
import { StoresService } from './stores.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get('stores')
  async listStores(@CurrentUser() user: any) {
    return { stores: await this.stores.listStores(user.orgId) };
  }

  @Post('stores')
  @Roles(UserRole.ADMIN)
  async createStore(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createStoreSchema)) body: any
  ) {
    return { store: await this.stores.createStore(user.orgId, body) };
  }

  @Patch('stores/:id')
  @Roles(UserRole.ADMIN)
  async updateStore(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStoreSchema)) body: any
  ) {
    return { store: await this.stores.updateStore(user.orgId, id, body) };
  }

  @Delete('stores/:id')
  @Roles(UserRole.ADMIN)
  async deleteStore(@CurrentUser() user: any, @Param('id') id: string) {
    await this.stores.deleteStore(user.orgId, id);
    return { ok: true };
  }

  @Get('warehouses')
  async listWarehouses(
    @CurrentUser() user: any,
    @Query('storeId') storeId?: string,
    @Query('includeInactiveWithStock') includeInactiveWithStock?: string
  ) {
    if (!storeId) return { warehouses: [] };
    const flag = includeInactiveWithStock === '1' || includeInactiveWithStock === 'true';
    return { warehouses: await this.stores.listWarehouses(user.orgId, storeId, { includeInactiveWithStock: flag }) };
  }

  @Post('warehouses')
  @Roles(UserRole.ADMIN)
  async createWarehouse(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createWarehouseSchema)) body: any
  ) {
    return { warehouse: await this.stores.createWarehouse(user.orgId, body) };
  }

  @Delete('warehouses/:id')
  @Roles(UserRole.ADMIN)
  async deleteWarehouse(@CurrentUser() user: any, @Param('id') id: string) {
    await this.stores.deleteWarehouse(user.orgId, id);
    return { ok: true };
  }
}
