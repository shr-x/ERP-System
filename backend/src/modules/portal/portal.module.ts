import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ErpModule } from '../erp/erp.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { StitchingProductsModule } from '../stitching/products/stitching-products.module';
import { PortalController } from './portal.controller';
import { PortalGuard } from './portal.guard';

@Module({
  imports: [AuthModule, ProductsModule, InventoryModule, StitchingProductsModule, ErpModule, StoresModule],
  controllers: [PortalController],
  providers: [PortalGuard]
})
export class PortalModule {}
