import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Controller('media')
export class MediaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('products/:id')
  async productImage(@Param('id') id: string, @Res() res: Response) {
    const p = await this.prisma.product.findFirst({
      where: { id },
      select: { imageData: true, imageMime: true }
    });
    if (!p?.imageData) throw new NotFoundException('Image not found');
    res.setHeader('Content-Type', p.imageMime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(p.imageData);
  }

  @Get('categories/:id')
  async categoryImage(@Param('id') id: string, @Res() res: Response) {
    const c = await this.prisma.productCategory.findFirst({
      where: { id },
      select: { imageData: true, imageMime: true }
    });
    if (!c?.imageData) throw new NotFoundException('Image not found');
    res.setHeader('Content-Type', c.imageMime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(c.imageData);
  }

  @Get('stitching/colors/:id')
  async stitchingColorImage(@Param('id') id: string, @Res() res: Response) {
    const c = await this.prisma.stitchingProductColor.findFirst({
      where: { id },
      select: { imageData: true, imageMime: true }
    });
    if (!c?.imageData) throw new NotFoundException('Image not found');
    res.setHeader('Content-Type', c.imageMime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(c.imageData);
  }
}
