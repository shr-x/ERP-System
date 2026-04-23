import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/auth/current-user';
import { AdminJwtGuard } from '../common/admin-jwt.guard';
import {
  CreateStitchingTemplateCategoryDto,
  CreateStitchingProductTemplateDto,
  StitchingListQueryDto,
  StitchingMeasurementProfileDto,
  StitchingProductColorDto,
  StitchingProductMaterialConfigDto,
  UpdateStitchingProductTemplateDto
} from './stitching-products.dtos';
import { StitchingProductsService } from './stitching-products.service';

@ApiTags('Stitching Products')
@ApiBearerAuth()
@Controller('stitching/products')
@UseGuards(AdminJwtGuard)
export class StitchingProductsController {
  constructor(private readonly products: StitchingProductsService) {}

  @Get('categories')
  async listCategories(@CurrentUser() user: any, @Query('q') q?: string) {
    return this.products.listCategories(user.orgId, q);
  }

  @Post('categories')
  async createCategory(
    @CurrentUser() user: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: CreateStitchingTemplateCategoryDto
  ) {
    return this.products.createCategory(user.orgId, body);
  }

  @Delete('categories/:id')
  async deleteCategory(@CurrentUser() user: any, @Param('id') id: string) {
    if (!id || !id.trim()) throw new BadRequestException('id is required');
    return this.products.deleteCategory(user.orgId, id);
  }

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: StitchingListQueryDto
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.products.list(user.orgId, { q: query.q, page, pageSize });
  }

  @Get(':id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return { template: await this.products.get(user.orgId, id) };
  }

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: CreateStitchingProductTemplateDto
  ) {
    return { template: await this.products.create(user.orgId, body) };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: UpdateStitchingProductTemplateDto
  ) {
    return { template: await this.products.update(user.orgId, id, body) };
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.products.delete(user.orgId, id);
  }

  @Post(':id/colors')
  async addColor(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: StitchingProductColorDto
  ) {
    return { color: await this.products.addColor(user.orgId, id, body) };
  }

  @Delete(':id/colors/:colorId')
  async deleteColor(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('colorId') colorId: string
  ) {
    return this.products.deleteColor(user.orgId, id, colorId);
  }

  @Post(':id/colors/:colorId/image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2_000_000 } }))
  async uploadColorImage(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('colorId') colorId: string,
    @UploadedFile() file: any
  ) {
    if (!file?.buffer) throw new BadRequestException('file is required');
    return { color: await this.products.setColorImage(user.orgId, id, colorId, file) };
  }

  @Post(':id/measurement-profiles')
  async addMeasurementProfile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: StitchingMeasurementProfileDto
  ) {
    return { profile: await this.products.addMeasurementProfile(user.orgId, id, body) };
  }

  @Delete(':id/measurement-profiles/:profileId')
  async deleteMeasurementProfile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('profileId') profileId: string
  ) {
    return this.products.deleteMeasurementProfile(user.orgId, id, profileId);
  }

  @Post(':id/material-configs')
  async addMaterialConfig(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: StitchingProductMaterialConfigDto
  ) {
    return { config: await this.products.addMaterialConfig(user.orgId, id, body) };
  }

  @Delete(':id/material-configs/:configId')
  async deleteMaterialConfig(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('configId') configId: string
  ) {
    return this.products.deleteMaterialConfig(user.orgId, id, configId);
  }
}
