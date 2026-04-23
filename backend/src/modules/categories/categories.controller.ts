import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CategoriesService } from './categories.service';
import { UserRole } from '.prisma/client';
import { Roles } from '../common/auth/roles';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  async createCategory(@Req() req: any, @Body() body: { name: string; imageUrl?: string }) {
    return this.categoriesService.createCategory(req.user.orgId, body.name, body.imageUrl);
  }

  @Get()
  async listCategories(@Req() req: any, @Query('channel') channel?: string) {
    const ch = channel && channel.toUpperCase() === 'POS' ? 'POS' : undefined;
    return { categories: await this.categoriesService.listCategories(req.user.orgId, ch as any) };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; imageUrl?: string }
  ) {
    return this.categoriesService.updateCategory(req.user.orgId, id, body.name, body.imageUrl);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async deleteCategory(@Req() req: any, @Param('id') id: string) {
    return this.categoriesService.deleteCategory(req.user.orgId, id);
  }

  @Post(':id/image')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2_000_000 } }))
  async uploadImage(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('file is required');
    return this.categoriesService.setCategoryImage(req.user.orgId, id, file);
  }
}
