import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '.prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { Roles } from '../common/auth/roles';
import { RolesGuard } from '../common/auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { rupeesToPaise } from '../products/money';
import { createManualJournalEntrySchema, profitLossQuerySchema } from './accounting.schemas';
import { AccountingService } from './accounting.service';

@Controller('accounting')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Post('setup-system-accounts')
  @Roles(UserRole.ADMIN)
  async setupSystemAccounts(@CurrentUser() user: any) {
    return this.accounting.setupSystemAccounts(user.orgId);
  }

  @Get('coa')
  async coa(@CurrentUser() user: any) {
    return { accounts: await this.accounting.listChartOfAccounts(user.orgId) };
  }

  @Get('journal-entries')
  async list(@CurrentUser() user: any) {
    return { entries: await this.accounting.listJournalEntries(user.orgId, user.storeId) };
  }

  @Get('journal-entries/export')
  async exportJournal(
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(profitLossQuerySchema)) query: any,
    @Res() res: Response
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    const periodStart = new Date(`${query.periodStart}T00:00:00`);
    const periodEnd = new Date(`${query.periodEnd}T23:59:59.999`);
    if (Number.isNaN(periodStart.getTime())) throw new BadRequestException('Invalid periodStart');
    if (Number.isNaN(periodEnd.getTime())) throw new BadRequestException('Invalid periodEnd');

    const format = (query.format || 'XLSX') as 'XLSX' | 'JSON';
    if (format === 'JSON') {
      const payload = await this.accounting.exportJournalJson({ orgId: user.orgId, storeId: user.storeId, periodStart, periodEnd });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="journal_${query.periodStart}_${query.periodEnd}.json"`);
      res.send(JSON.stringify(payload, null, 2));
      return;
    }

    const buf = await this.accounting.exportJournalXlsx({ orgId: user.orgId, storeId: user.storeId, periodStart, periodEnd });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="journal_${query.periodStart}_${query.periodEnd}.xlsx"`);
    res.send(buf);
  }

  @Get('journal-entries/:id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return { entry: await this.accounting.getJournalEntry(user.orgId, id) };
  }

  @Post('journal-entries/manual')
  @Roles(UserRole.ADMIN)
  async createManual(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(createManualJournalEntrySchema)) body: any
  ) {
    const entryDate = new Date(body.entryDate);
    if (Number.isNaN(entryDate.getTime())) throw new BadRequestException('Invalid entryDate');

    const lines = body.lines.map((l: any) => ({
      accountId: l.accountId,
      debitPaise: l.debitRupees !== undefined ? rupeesToPaise(l.debitRupees) : 0n,
      creditPaise: l.creditRupees !== undefined ? rupeesToPaise(l.creditRupees) : 0n
    }));

    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');

    return await this.accounting.createManualJournalEntry({
      orgId: user.orgId,
      storeId: user.storeId,
      postedByUserId: user.sub,
      entryDate,
      narration: body.narration,
      lines
    });
  }

  @Get('reports/profit-loss')
  async profitLoss(
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(profitLossQuerySchema)) query: any
  ) {
    const periodStart = new Date(`${query.periodStart}T00:00:00`);
    const periodEnd = new Date(`${query.periodEnd}T23:59:59.999`);
    if (Number.isNaN(periodStart.getTime())) throw new BadRequestException('Invalid periodStart');
    if (Number.isNaN(periodEnd.getTime())) throw new BadRequestException('Invalid periodEnd');

    return {
      report: await this.accounting.profitLossReport({
        orgId: user.orgId,
        storeId: user.storeId,
        periodStart,
        periodEnd
      })
    };
  }

  @Get('reports/profit-loss/export')
  async exportProfitLoss(
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(profitLossQuerySchema)) query: any,
    @Res() res: Response
  ) {
    if (!user.storeId) throw new ForbiddenException('User is not assigned to a store');
    const periodStart = new Date(`${query.periodStart}T00:00:00`);
    const periodEnd = new Date(`${query.periodEnd}T23:59:59.999`);
    if (Number.isNaN(periodStart.getTime())) throw new BadRequestException('Invalid periodStart');
    if (Number.isNaN(periodEnd.getTime())) throw new BadRequestException('Invalid periodEnd');

    const buf = await this.accounting.exportProfitLossXlsx({ orgId: user.orgId, storeId: user.storeId, periodStart, periodEnd });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="profit_loss_${query.periodStart}_${query.periodEnd}.xlsx"`);
    res.send(buf);
  }
}
