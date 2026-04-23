import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

export class ErpListMaterialsQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ErpMaterialsByIdsQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsString()
  @MaxLength(4000)
  ids!: string;
}

export class ErpInvoiceItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  @Max(999999)
  qty!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999)
  unitPriceRupees?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999)
  discountRupees?: number;
}

export class CreateErpInvoiceDto {
  @IsUUID()
  storeWarehouseId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsBoolean()
  saleOnCredit?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/)
  placeOfSupplyStateCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  deliveryPincode?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ErpInvoiceItemDto)
  items!: ErpInvoiceItemDto[];

  @IsEnum(['CASH', 'UPI', 'DEBIT_CARD', 'CREDIT'] as const)
  paymentMethod!: 'CASH' | 'UPI' | 'DEBIT_CARD' | 'CREDIT';

  @IsNumber()
  @Min(0)
  @Max(99999999)
  paymentAmountRupees!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  upiRef?: string;
}

export class CreateErpExpenseDto {
  @IsUUID()
  storeId!: string;

  @IsUUID()
  expenseAccountId!: string;

  @IsString()
  @MaxLength(200)
  narration!: string;

  @IsEnum(['CASH', 'UPI'] as const)
  paymentMethod!: 'CASH' | 'UPI';

  @IsNumber()
  @Min(0.01)
  @Max(99999999)
  amountRupees!: number;

  @IsOptional()
  @IsBoolean()
  gstIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  gstOnTailor?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  gstRatePercent?: number;
}
