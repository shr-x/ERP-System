import fs from 'node:fs';
import path from 'node:path';
import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '.prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { exportFormatSchema, periodSchema } from './gst.schemas';
import { GstService } from './gst.service';

@Controller('gst')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GstController {
  constructor(private readonly gst: GstService) {}

  @Post('gstr1/summary')
  @Roles(UserRole.ADMIN)
  async gstr1Summary(@CurrentUser() user: any, @Body(new ZodValidationPipe(periodSchema)) body: any) {
    return this.gst.getGstr1Summary({
      orgId: user.orgId,
      storeId: body.storeId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd
    });
  }

  @Post('gstr1/export')
  @Roles(UserRole.ADMIN)
  async exportGstr1(
    @CurrentUser() user: any,
    @Query('format', new ZodValidationPipe(exportFormatSchema)) format: any,
    @Body(new ZodValidationPipe(periodSchema)) body: any
  ) {
    return this.gst.exportGstr1({
      orgId: user.orgId,
      storeId: body.storeId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      format
    });
  }

  @Post('gstr3b/summary')
  @Roles(UserRole.ADMIN)
  async gstr3bSummary(@CurrentUser() user: any, @Body(new ZodValidationPipe(periodSchema)) body: any) {
    return this.gst.getGstr3bSummary({
      orgId: user.orgId,
      storeId: body.storeId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd
    });
  }

  @Post('itc-register')
  @Roles(UserRole.ADMIN)
  async itcRegister(@CurrentUser() user: any, @Body(new ZodValidationPipe(periodSchema)) body: any) {
    return this.gst.getItcRegister({
      orgId: user.orgId,
      storeId: body.storeId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd
    });
  }

  @Post('gstr3b/export')
  @Roles(UserRole.ADMIN)
  async exportGstr3b(
    @CurrentUser() user: any,
    @Query('format', new ZodValidationPipe(exportFormatSchema)) format: any,
    @Body(new ZodValidationPipe(periodSchema)) body: any
  ) {
    return this.gst.exportGstr3b({
      orgId: user.orgId,
      storeId: body.storeId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      format
    });
  }

  @Get('exports/:id/download')
  async download(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const exp = await this.gst.getExportForOrg(user.orgId, id);
    if (!exp) {
      res.status(404).json({ message: 'Export not found' });
      return;
    }

    const filePath = exp.filePath;
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: 'File missing on disk' });
      return;
    }

    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  }
}
