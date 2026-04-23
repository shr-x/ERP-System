import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '.prisma/client';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InventoryService } from './inventory.service';
import { receiveStockSchema, restockWarehouseSchema, transferStockSchema } from './inventory.schemas';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('receive')
  @Roles(UserRole.ADMIN)
  async receive(@CurrentUser() user: any, @Body(new ZodValidationPipe(receiveStockSchema)) body: any) {
    return this.inventory.receiveStock(user.orgId, body);
  }

  @Post('transfer')
  @Roles(UserRole.ADMIN)
  async transfer(@CurrentUser() user: any, @Body(new ZodValidationPipe(transferStockSchema)) body: any) {
    return this.inventory.transferStock(user.orgId, body);
  }

  @Post('restock')
  @Roles(UserRole.ADMIN)
  async restock(@CurrentUser() user: any, @Body(new ZodValidationPipe(restockWarehouseSchema)) body: any) {
    return this.inventory.restockWarehouseToMinimum(user.orgId, body);
  }

  @Get('stock')
  async stock(
    @CurrentUser() user: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('storeId') storeId?: string,
    @Query('q') q?: string
  ) {
    if (warehouseId) return this.inventory.listStock(user.orgId, warehouseId, q);
    if (storeId) return this.inventory.listStockForStore(user.orgId, storeId, q);
    return { stock: [] };
  }

  @Get('batches')
  async batches(
    @CurrentUser() user: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string
  ) {
    if (!warehouseId || !productId) return { batches: [] };
    return this.inventory.listBatches(user.orgId, warehouseId, productId);
  }
}
