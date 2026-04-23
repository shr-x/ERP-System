import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '.prisma/client';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createProductSchema, updateProductSchema } from './products.schemas';
import { ProductsService } from './products.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  async list(
    @CurrentUser() user: any,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('channel') channel?: string
  ) {
    const ch = channel && channel.toUpperCase() === 'POS' ? 'POS' : undefined;
    return { products: await this.products.listProducts(user.orgId, q, categoryId, ch as any) };
  }

  @Get('products/:id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    const product = await this.products.getProduct(user.orgId, id);
    if (!product) throw new NotFoundException('Product not found');
    return { product };
  }

  @Post('products')
  @Roles(UserRole.ADMIN)
  async create(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createProductSchema)) body: any
  ) {
    return { product: await this.products.createProduct(user.orgId, body) };
  }

  @Patch('products/:id')
  @Roles(UserRole.ADMIN)
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: any
  ) {
    return { product: await this.products.updateProduct(user.orgId, id, body) };
  }

  @Delete('products/:id')
  @Roles(UserRole.ADMIN)
  async deleteProduct(@CurrentUser() user: any, @Param('id') id: string) {
    return { product: await this.products.deleteProduct(user.orgId, id) };
  }

  @Post('products/starter-catalog')
  @Roles(UserRole.ADMIN)
  async createStarterCatalog(@CurrentUser() user: any) {
    return { result: await this.products.createStarterCatalog(user.orgId) };
  }

  @Post('products/:id/image')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2_000_000 } }))
  async uploadImage(@CurrentUser() user: any, @Param('id') id: string, @UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('file is required');
    return { product: await this.products.setProductImage(user.orgId, id, file) };
  }
}
