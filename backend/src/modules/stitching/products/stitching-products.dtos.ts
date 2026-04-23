import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  MinLength,
  ValidateNested
} from 'class-validator';
import { StitchingProductCategory } from '.prisma/client';

export class StitchingMeasurementProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  measurementName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(50, { each: true })
  fields!: string[];
}

export class StitchingProductColorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  colorName!: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  colorCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}

export class StitchingProductMaterialConfigDto {
  @IsUUID()
  erpMaterialId!: string;

  @IsNumber()
  @Min(0.001)
  @Max(9999)
  metersRequired!: number;
}

export class CreateStitchingTemplateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsBoolean()
  posVisible?: boolean;
}

export class CreateStitchingProductTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(StitchingProductCategory)
  category!: StitchingProductCategory;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StitchingMeasurementProfileDto)
  measurementProfiles?: StitchingMeasurementProfileDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StitchingProductColorDto)
  colors?: StitchingProductColorDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StitchingProductMaterialConfigDto)
  materialConfigs?: StitchingProductMaterialConfigDto[];
}

export class UpdateStitchingProductTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(StitchingProductCategory)
  category?: StitchingProductCategory;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}

export class StitchingListQueryDto {
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
