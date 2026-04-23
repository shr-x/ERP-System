import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreatePosStitchingOrderDto {
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
  @MaxLength(500)
  selectedColorImageUrl?: string;

  @IsOptional()
  @IsString()
  sizeName?: string;

  @IsOptional()
  @IsObject()
  measurements?: Record<string, number>;

  @IsOptional()
  @IsUUID()
  erpMaterialId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(9999)
  materialUsageMeters?: number;

  @IsOptional()
  @IsUUID()
  tailorId?: string;

  @IsString()
  deliveryDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999)
  priceRupees!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999)
  tailorCostRupees?: number;

  @IsOptional()
  @IsBoolean()
  gstOnTailor?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tailorGstRatePercent?: number;
}
