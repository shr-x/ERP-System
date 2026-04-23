import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountingModule } from '../accounting/accounting.module';
import { GstModule } from '../gst/gst.module';
import { HealthModule } from '../health/health.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrintingModule } from '../printing/printing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { SalesModule } from '../sales/sales.module';
import { StoresModule } from '../stores/stores.module';
import { CustomersModule } from '../customers/customers.module';
import { AssetsModule } from '../assets/assets.module';
import { CategoriesModule } from '../categories/categories.module';
import { MediaModule } from '../media/media.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { CouponsModule } from '../coupons/coupons.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { ErpModule } from '../erp/erp.module';
import { StitchingModule } from '../stitching/stitching.module';
import { PortalModule } from '../portal/portal.module';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    AuthModule,
    AccountingModule,
    GstModule,
    PrintingModule,
    AssetsModule,
    StoresModule,
    ProductsModule,
    CustomersModule,
    LoyaltyModule,
    CouponsModule,
    InventoryModule,
    SalesModule,
    CategoriesModule,
    MediaModule,
    PurchasesModule,
    FeedbackModule,
    ErpModule,
    StitchingModule,
    PortalModule
  ]
})
export class AppModule {}
