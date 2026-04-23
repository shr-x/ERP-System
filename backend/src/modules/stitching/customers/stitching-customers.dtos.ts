import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class SyncStitchingCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class StitchingCustomerListQueryDto {
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

export class StitchingCustomerIdParamDto {
  @IsUUID()
  erpCustomerId!: string;
}
