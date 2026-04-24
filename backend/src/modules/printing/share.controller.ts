import fs from 'node:fs';
import path from 'node:path';
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { PrintFormat } from '.prisma/client';
import { Response } from 'express';
import { htmlToPdfBuffer } from '../gst/pdf';
import { env } from '../env/env';
import { PrismaService } from '../prisma/prisma.service';
import { renderStitchingTailorSlipA4 } from '../stitching/orders/stitching-orders.docs';
import { PrintingService } from './printing.service';

@Controller('share')
export class ShareController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printing: PrintingService
  ) {}

  private async resolveStitchingColorImageUrlForDocs(selectedColorImageUrl?: string | null) {
    const u = (selectedColorImageUrl || '').trim();
    if (!u) return undefined;

    const m = u.match(/^\/media\/stitching\/colors\/([0-9a-fA-F-]{36})$/);
    if (m?.[1]) {
      const row = await (this.prisma as any).stitchingProductColor.findFirst({
        where: { id: m[1] },
        select: { imageData: true, imageMime: true, imageUrl: true }
      });
      const mime = String(row?.imageMime || '').trim();
      if (row?.imageData && mime.startsWith('image/')) {
        const b64 = Buffer.from(row.imageData).toString('base64');
        return `data:${mime};base64,${b64}`;
      }
      if (String(row?.imageUrl || '').trim()) return String(row.imageUrl).trim();
    }

    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/')) return `http://localhost:${env.PORT}${u}`;
    return u;
  }

  @Get(':token/thermal')
  async thermal(@Param('token') token: string, @Res() res: Response) {
    const link = await this.prisma.invoiceShareLink.findFirst({
      where: { token },
      select: { orgId: true, invoiceId: true, expiresAt: true }
    });
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new NotFoundException('Link expired');

    const html = await this.printing.renderThermalHtmlForInvoice({ orgId: link.orgId, invoiceId: link.invoiceId });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  @Get(':token/a4')
  async a4(@Param('token') token: string, @Res() res: Response) {
    const link = await this.prisma.invoiceShareLink.findFirst({
      where: { token },
      select: { orgId: true, invoiceId: true, expiresAt: true }
    });
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new NotFoundException('Link expired');

    const job = await this.printing.generateInvoicePrint({
      orgId: link.orgId,
      role: 'ADMIN',
      invoiceId: link.invoiceId,
      format: PrintFormat.A4
    });

    const filePath = (job as any).pdfPath as string | undefined;
    if (!filePath || !fs.existsSync(filePath)) throw new NotFoundException('PDF missing');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    return res.sendFile(filePath);
  }

  @Get('return/:token/thermal')
  async returnThermal(@Param('token') token: string, @Res() res: Response) {
    const link = await (this.prisma as any).salesReturnShareLink.findFirst({
      where: { token },
      select: { orgId: true, salesReturnId: true, expiresAt: true }
    });
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new NotFoundException('Link expired');

    const html = await this.printing.renderThermalHtmlForReturn({ orgId: link.orgId, salesReturnId: link.salesReturnId });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  @Get('return/:token/a4')
  async returnA4(@Param('token') token: string, @Res() res: Response) {
    const link = await (this.prisma as any).salesReturnShareLink.findFirst({
      where: { token },
      select: { orgId: true, salesReturnId: true, expiresAt: true }
    });
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new NotFoundException('Link expired');

    const job = await this.printing.generateReturnPrint({
      orgId: link.orgId,
      role: 'ADMIN',
      salesReturnId: link.salesReturnId,
      format: PrintFormat.A4
    });

    const filePath = (job as any).pdfPath as string | undefined;
    if (!filePath || !fs.existsSync(filePath)) throw new NotFoundException('PDF missing');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    return res.sendFile(filePath);
  }

  @Get('credit/:token/thermal')
  async creditThermal(@Param('token') token: string, @Res() res: Response) {
    const link = await (this.prisma as any).customerCreditShareLink.findFirst({
      where: { token },
      select: { orgId: true, receiptId: true, expiresAt: true }
    });
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new NotFoundException('Link expired');

    const html = await this.printing.renderThermalHtmlForCreditReceipt({ orgId: link.orgId, receiptId: link.receiptId });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  @Get('credit/:token/a4')
  async creditA4(@Param('token') token: string, @Res() res: Response) {
    const link = await (this.prisma as any).customerCreditShareLink.findFirst({
      where: { token },
      select: { orgId: true, receiptId: true, expiresAt: true }
    });
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new NotFoundException('Link expired');

    const job = await this.printing.generateCreditReceiptPrint({
      orgId: link.orgId,
      role: 'ADMIN',
      receiptId: link.receiptId,
      format: PrintFormat.A4
    });

    const filePath = (job as any).pdfPath as string | undefined;
    if (!filePath || !fs.existsSync(filePath)) throw new NotFoundException('PDF missing');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    return res.sendFile(filePath);
  }

  @Get('stitching-tailor/:token/a4')
  async stitchingTailorSlipA4(@Param('token') token: string, @Res() res: Response) {
    const link = await (this.prisma as any).stitchingTailorSlipShareLink.findFirst({
      where: { token },
      select: { orgId: true, orderId: true, expiresAt: true }
    });
    if (!link) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new NotFoundException('Link expired');

    const order = await (this.prisma as any).stitchingOrder.findFirst({
      where: { id: link.orderId, orgId: link.orgId },
      include: { productTemplate: true }
    });
    if (!order) throw new NotFoundException('Order not found');

    const org = await this.prisma.organization.findFirst({
      where: { id: link.orgId },
      select: { name: true }
    });
    const store = order.storeId
      ? await this.prisma.store.findFirst({
          where: { id: order.storeId, orgId: link.orgId },
          select: { name: true, gstin: true, phone: true, address: true }
        })
      : null;

    const material = order.erpMaterialId
      ? await this.prisma.product.findFirst({
          where: { id: order.erpMaterialId, orgId: link.orgId, isActive: true },
          select: { code: true, name: true }
        })
      : null;

    const imageUrl = await this.resolveStitchingColorImageUrlForDocs(order.selectedColorImageUrl ?? undefined);
    const html = renderStitchingTailorSlipA4({
      storeName: store?.name ?? org?.name ?? 'Shr-x ERP',
      gstin: store?.gstin ?? undefined,
      storePhone: store?.phone ?? undefined,
      storeAddress: store?.address ?? undefined,
      orderCode: order.orderCode,
      productName: order.productTemplate.name,
      productCategory: order.productTemplate.category,
      materialSource: (order.materialSource ?? 'STORE') as any,
      materialName: material ? `${material.name} (${material.code})` : undefined,
      colorName: order.selectedColorName ?? undefined,
      colorCode: order.selectedColorCode,
      imageUrl,
      deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
      measurements: (order.measurements ?? {}) as any,
      materialUsageMeters: order.materialUsageMeters?.toString()
    });

    const pdf = await htmlToPdfBuffer(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="tailor_slip_${order.orderCode}.pdf"`);
    return res.send(pdf);
  }
}
