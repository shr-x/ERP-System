import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';
import { StitchingOrderStatus } from '.prisma/client';

export class CreateStitchingOrderDto {
  @IsUUID()
  productTemplateId!: string;

  @IsOptional()
  @IsUUID()
  erpCustomerId?: string;

  @IsOptional()
  @IsEnum(['STORE', 'CUSTOMER'] as const)
  materialSource?: 'STORE' | 'CUSTOMER';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  selectedColorName?: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  selectedColorCode!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  measurementProfileName?: string;

  @IsObject()
  measurements!: Record<string, number>;

  @IsOptional()
  @IsUUID()
  erpMaterialId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(9999)
  materialUsageMeters?: number;

  @IsString()
  deliveryDate!: string;

  @IsNumber()
  @Min(0)
  @Max(99999999)
  priceRupees!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  gstRatePercent!: number;

  @IsEnum(['CASH', 'UPI', 'DEBIT_CARD', 'CREDIT'] as const)
  paymentMethod!: 'CASH' | 'UPI' | 'DEBIT_CARD' | 'CREDIT';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  upiRef?: string;

  @IsOptional()
  @IsUUID()
  tailorId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999)
  tailorCostRupees?: number;

  @IsOptional()
  @IsBoolean()
  gstOnTailor?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tailorGstRatePercent?: number;

  @IsUUID()
  storeWarehouseId!: string;
}

export class AssignTailorDto {
  @IsUUID()
  tailorId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999)
  tailorCostRupees?: number;

  @IsOptional()
  @IsBoolean()
  gstOnTailor?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tailorGstRatePercent?: number;
}

export class UpdateOrderStatusDto {
  @IsEnum(StitchingOrderStatus)
  status!: StitchingOrderStatus;
}

export class ListOrdersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(StitchingOrderStatus)
  status?: StitchingOrderStatus;

  @IsOptional()
  @IsUUID()
  tailorId?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

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
