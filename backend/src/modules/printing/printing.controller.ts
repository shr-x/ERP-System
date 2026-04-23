import fs from 'node:fs';
import path from 'node:path';
import { Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { PrintFormat } from '.prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { printFormatSchema } from './printing.schemas';
import { PrintingService } from './printing.service';

@Controller('print')
@UseGuards(JwtAuthGuard)
export class PrintingController {
  constructor(private readonly printing: PrintingService) {}

  @Post('invoices/:invoiceId')
  async generate(
    @CurrentUser() user: any,
    @Param('invoiceId') invoiceId: string,
    @Query('format', new ZodValidationPipe(printFormatSchema)) format: any
  ) {
    return this.printing.generateInvoicePrint({
      orgId: user.orgId,
      userStoreId: user.storeId,
      role: user.role,
      invoiceId,
      format: format as PrintFormat
    });
  }

  @Post('returns/:salesReturnId')
  async generateReturn(
    @CurrentUser() user: any,
    @Param('salesReturnId') salesReturnId: string,
    @Query('format', new ZodValidationPipe(printFormatSchema)) format: any
  ) {
    return this.printing.generateReturnPrint({
      orgId: user.orgId,
      userStoreId: user.storeId,
      role: user.role,
      salesReturnId,
      format: format as PrintFormat
    });
  }

  @Post('credit-receipts/:receiptId')
  async generateCreditReceipt(
    @CurrentUser() user: any,
    @Param('receiptId') receiptId: string,
    @Query('format', new ZodValidationPipe(printFormatSchema)) format: any
  ) {
    return this.printing.generateCreditReceiptPrint({
      orgId: user.orgId,
      userStoreId: user.storeId,
      role: user.role,
      receiptId,
      format: format as PrintFormat
    });
  }

  @Post('credit-settlements/:settlementId')
  async generateCreditSettlement(
    @CurrentUser() user: any,
    @Param('settlementId') settlementId: string,
    @Query('format', new ZodValidationPipe(printFormatSchema)) format: any
  ) {
    return this.printing.generateCreditSettlementPrint({
      orgId: user.orgId,
      userStoreId: user.storeId,
      role: user.role,
      settlementId,
      format: format as PrintFormat
    });
  }

  @Get('jobs/:id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return { job: await this.printing.getPrintJob(user.orgId, id) };
  }

  @Get('jobs/:id/download')
  async download(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const job = await this.printing.getPrintJob(user.orgId, id);
    if (!job) {
      res.status(404).json({ message: 'Print job not found' });
      return;
    }

    if (job.format === PrintFormat.THERMAL_80MM) {
      if (job.htmlPath && fs.existsSync(job.htmlPath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(job.htmlPath)}"`);
        res.sendFile(job.htmlPath);
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(job.htmlSnapshot ?? '');
      return;
    }

    const filePath = job.pdfPath;
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ message: 'PDF missing on disk' });
      return;
    }

    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  }
}
