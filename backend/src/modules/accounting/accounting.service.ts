import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountType, JournalEntryStatus, JournalSourceType, PaymentMethod, Prisma } from '.prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mulPaiseByQtyMilli } from '../sales/sales.math';
import { decimalToMilliBigInt, decimalToMilliString } from './decimal';
import { AllSystemAccountCodes, SystemAccountCodes } from './system-accounts';
import * as XLSX from 'xlsx';

type Tx = Prisma.TransactionClient;

function paiseToRupeesNumber(paise: bigint) {
  return Number(paise) / 100;
}

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  private systemAccountDefs() {
    return [
      { code: SystemAccountCodes.CASH, name: 'Cash', type: AccountType.ASSET },
      { code: SystemAccountCodes.UPI_CLEARING, name: 'UPI Clearing', type: AccountType.ASSET },
      { code: SystemAccountCodes.INVENTORY, name: 'Inventory', type: AccountType.ASSET },
      { code: SystemAccountCodes.ACCOUNTS_RECEIVABLE, name: 'Accounts Receivable', type: AccountType.ASSET },
      { code: SystemAccountCodes.INPUT_CGST, name: 'Input CGST', type: AccountType.ASSET },
      { code: SystemAccountCodes.INPUT_SGST, name: 'Input SGST', type: AccountType.ASSET },
      { code: SystemAccountCodes.INPUT_IGST, name: 'Input IGST', type: AccountType.ASSET },
      { code: SystemAccountCodes.COGS, name: 'Cost of Goods Sold', type: AccountType.EXPENSE },
      { code: SystemAccountCodes.SALES, name: 'Sales', type: AccountType.INCOME },
      { code: SystemAccountCodes.ACCOUNTS_PAYABLE, name: 'Accounts Payable', type: AccountType.LIABILITY },
      { code: SystemAccountCodes.STORE_CREDIT, name: 'Store Credit / Coupons', type: AccountType.LIABILITY },
      { code: SystemAccountCodes.OUTPUT_CGST, name: 'Output CGST', type: AccountType.LIABILITY },
      { code: SystemAccountCodes.OUTPUT_SGST, name: 'Output SGST', type: AccountType.LIABILITY },
      { code: SystemAccountCodes.OUTPUT_IGST, name: 'Output IGST', type: AccountType.LIABILITY },
      { code: SystemAccountCodes.STOCK_ADJUSTMENT_EQUITY, name: 'Stock Adjustment (Equity)', type: AccountType.EQUITY }
    ];
  }

  private async ensureSystemAccountsInTx(tx: Tx, orgId: string) {
    const existing = await tx.chartAccount.findMany({
      where: { orgId, code: { in: AllSystemAccountCodes } },
      select: { code: true }
    });
    const have = new Set(existing.map((e) => e.code));
    const defs = this.systemAccountDefs();
    const toCreate = defs.filter((d) => !have.has(d.code));
    if (toCreate.length === 0) return;
    await tx.chartAccount.createMany({
      data: toCreate.map((a) => ({
        orgId,
        code: a.code,
        name: a.name,
        type: a.type,
        isSystem: true
      })),
      skipDuplicates: true
    });
  }

  async setupSystemAccounts(orgId: string) {
    const existing = (await this.prisma.chartAccount.findMany({
      where: { orgId, code: { in: AllSystemAccountCodes } },
      select: { code: true }
    })) as Array<{ code: string }>;
    const have = new Set(existing.map((e: { code: string }) => e.code));

    const defs = this.systemAccountDefs();
    const toCreate = defs.filter((d) => !have.has(d.code));

    if (toCreate.length === 0) return { created: 0 };

    const result = await this.prisma.chartAccount.createMany({
      data: toCreate.map((a) => ({
        orgId,
        code: a.code,
        name: a.name,
        type: a.type,
        isSystem: true
      }))
    });

    return { created: result.count };
  }

  async listChartOfAccounts(orgId: string) {
    return this.prisma.chartAccount.findMany({
      where: { orgId },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, type: true, isSystem: true }
    });
  }

  async listJournalEntries(orgId: string, storeId?: string) {
    const entries = await this.prisma.journalEntry.findMany({
      where: { orgId, ...(storeId ? { storeId } : {}) },
      orderBy: { entryDate: 'desc' },
      select: {
        id: true,
        entryDate: true,
        sourceType: true,
        narration: true,
        status: true,
        lines: { select: { debitPaise: true, creditPaise: true } },
        salesInvoice: {
          select: {
            id: true,
            invoiceNo: true,
            invoiceDate: true,
            taxRegime: true,
            subtotalPaise: true,
            discountTotalPaise: true,
            taxTotalPaise: true,
            cgstTotalPaise: true,
            sgstTotalPaise: true,
            igstTotalPaise: true,
            grandTotalPaise: true
          }
        },
        purchaseInvoice: {
          select: {
            id: true,
            supplierInvoiceNo: true,
            invoiceDate: true,
            subtotalPaise: true,
            taxTotalPaise: true,
            cgstTotalPaise: true,
            sgstTotalPaise: true,
            igstTotalPaise: true,
            grandTotalPaise: true,
            supplier: { select: { name: true } }
          }
        }
      }
    });

    return entries.map((e) => ({
      id: e.id,
      entryDate: e.entryDate.toISOString(),
      sourceType: e.sourceType,
      narration: e.narration,
      status: e.status,
      totalDebitPaise: e.lines.reduce((s, l) => s + BigInt(l.debitPaise.toString()), 0n).toString(),
      orderValuePaise:
        e.salesInvoice?.grandTotalPaise !== undefined
          ? e.salesInvoice.grandTotalPaise.toString()
          : e.purchaseInvoice?.grandTotalPaise !== undefined
            ? e.purchaseInvoice.grandTotalPaise.toString()
            : null,
      gst: e.salesInvoice
        ? {
            type: 'SALE' as const,
            invoiceNo: e.salesInvoice.invoiceNo,
            invoiceDate: e.salesInvoice.invoiceDate.toISOString(),
            taxRegime: e.salesInvoice.taxRegime,
            subtotalPaise: e.salesInvoice.subtotalPaise.toString(),
            discountTotalPaise: e.salesInvoice.discountTotalPaise.toString(),
            taxTotalPaise: e.salesInvoice.taxTotalPaise.toString(),
            cgstTotalPaise: e.salesInvoice.cgstTotalPaise.toString(),
            sgstTotalPaise: e.salesInvoice.sgstTotalPaise.toString(),
            igstTotalPaise: e.salesInvoice.igstTotalPaise.toString(),
            grandTotalPaise: e.salesInvoice.grandTotalPaise.toString()
          }
        : e.purchaseInvoice
          ? {
              type: 'PURCHASE' as const,
              supplierName: e.purchaseInvoice.supplier.name,
              supplierInvoiceNo: e.purchaseInvoice.supplierInvoiceNo,
              invoiceDate: e.purchaseInvoice.invoiceDate.toISOString(),
              subtotalPaise: e.purchaseInvoice.subtotalPaise.toString(),
              taxTotalPaise: e.purchaseInvoice.taxTotalPaise.toString(),
              cgstTotalPaise: e.purchaseInvoice.cgstTotalPaise.toString(),
              sgstTotalPaise: e.purchaseInvoice.sgstTotalPaise.toString(),
              igstTotalPaise: e.purchaseInvoice.igstTotalPaise.toString(),
              grandTotalPaise: e.purchaseInvoice.grandTotalPaise.toString()
            }
          : null
    }));
  }

  async getJournalEntry(orgId: string, id: string) {
    return this.prisma.journalEntry.findFirst({
      where: { orgId, id },
      include: { lines: { include: { account: true } } }
    });
  }

  async postSaleJournal(args: {
    tx: Tx;
    orgId: string;
    storeId: string;
    postedByUserId: string;
    salesInvoiceId: string;
    invoiceNo: string;
    invoiceDate: Date;
    paymentMethod: PaymentMethod;
    storeCreditPaise?: bigint;
    grandTotalPaise: bigint;
    taxableSubtotalPaise: bigint;
    cgstPaise: bigint;
    sgstPaise: bigint;
    igstPaise: bigint;
    stockMoveId: string;
  }) {
    const { tx, orgId, storeId } = args;
    await this.ensureSystemAccountsInTx(tx, orgId);

    const codes = [
      SystemAccountCodes.CASH,
      SystemAccountCodes.UPI_CLEARING,
      SystemAccountCodes.INVENTORY,
      SystemAccountCodes.ACCOUNTS_RECEIVABLE,
      SystemAccountCodes.COGS,
      SystemAccountCodes.SALES,
      SystemAccountCodes.STORE_CREDIT,
      SystemAccountCodes.OUTPUT_CGST,
      SystemAccountCodes.OUTPUT_SGST,
      SystemAccountCodes.OUTPUT_IGST
    ];

    const accounts = await tx.chartAccount.findMany({
      where: { orgId, code: { in: codes } },
      select: { id: true, code: true }
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));

    for (const c of codes) {
      if (!byCode.has(c)) throw new BadRequestException('Accounting system accounts are missing');
    }

    const paymentAccountId =
      args.paymentMethod === PaymentMethod.CASH
        ? byCode.get(SystemAccountCodes.CASH)!
        : (args.paymentMethod as any) === 'CREDIT'
          ? byCode.get(SystemAccountCodes.ACCOUNTS_RECEIVABLE)!
          : byCode.get(SystemAccountCodes.UPI_CLEARING)!;

    const revenueAccountId = byCode.get(SystemAccountCodes.SALES)!;
    const inventoryAccountId = byCode.get(SystemAccountCodes.INVENTORY)!;
    const cogsAccountId = byCode.get(SystemAccountCodes.COGS)!;
    const storeCreditAccountId = byCode.get(SystemAccountCodes.STORE_CREDIT)!;
    const outputCgstAccountId = byCode.get(SystemAccountCodes.OUTPUT_CGST)!;
    const outputSgstAccountId = byCode.get(SystemAccountCodes.OUTPUT_SGST)!;
    const outputIgstAccountId = byCode.get(SystemAccountCodes.OUTPUT_IGST)!;

    const moveLines = await tx.stockMoveLine.findMany({
      where: { stockMoveId: args.stockMoveId, orgId, qtyDelta: { lt: new Prisma.Decimal(0) } },
      select: { qtyDelta: true, unitCostPaise: true }
    });

    let cogsTotalPaise = 0n;
    for (const ml of moveLines) {
      if (ml.unitCostPaise === null) continue;
      const qtyMilli = decimalToMilliBigInt(decimalToMilliString(ml.qtyDelta)).toString();
      const qtyAbsMilli = BigInt(qtyMilli.startsWith('-') ? qtyMilli.slice(1) : qtyMilli);
      cogsTotalPaise += mulPaiseByQtyMilli(ml.unitCostPaise, qtyAbsMilli);
    }

    const entry = await tx.journalEntry.create({
      data: {
        orgId,
        storeId,
        entryDate: args.invoiceDate,
        sourceType: JournalSourceType.SALE,
        salesInvoiceId: args.salesInvoiceId,
        narration: `Sale ${args.invoiceNo}`,
        postedByUserId: args.postedByUserId,
        status: JournalEntryStatus.DRAFT
      },
      select: { id: true }
    });

    const lines: Array<{ accountId: string; debitPaise: bigint; creditPaise: bigint }> = [];

    const storeCreditPaise = args.storeCreditPaise ?? 0n;
    const collectedPaise = args.grandTotalPaise - storeCreditPaise;
    if (collectedPaise < 0n) throw new BadRequestException('Invalid store credit amount');

    if (collectedPaise > 0n) {
      lines.push({ accountId: paymentAccountId, debitPaise: collectedPaise, creditPaise: 0n });
    }
    if (storeCreditPaise > 0n) {
      lines.push({ accountId: storeCreditAccountId, debitPaise: storeCreditPaise, creditPaise: 0n });
    }
    lines.push({ accountId: revenueAccountId, debitPaise: 0n, creditPaise: args.taxableSubtotalPaise });

    if (args.cgstPaise > 0n) lines.push({ accountId: outputCgstAccountId, debitPaise: 0n, creditPaise: args.cgstPaise });
    if (args.sgstPaise > 0n) lines.push({ accountId: outputSgstAccountId, debitPaise: 0n, creditPaise: args.sgstPaise });
    if (args.igstPaise > 0n) lines.push({ accountId: outputIgstAccountId, debitPaise: 0n, creditPaise: args.igstPaise });

    if (cogsTotalPaise > 0n) {
      lines.push({ accountId: cogsAccountId, debitPaise: cogsTotalPaise, creditPaise: 0n });
      lines.push({ accountId: inventoryAccountId, debitPaise: 0n, creditPaise: cogsTotalPaise });
    }

    const totalDebit = lines.reduce((s, l) => s + l.debitPaise, 0n);
    const totalCredit = lines.reduce((s, l) => s + l.creditPaise, 0n);
    if (totalDebit !== totalCredit) throw new BadRequestException('Unbalanced journal entry');

    await tx.journalLine.createMany({
      data: lines.map((l) => ({
        orgId,
        journalEntryId: entry.id,
        accountId: l.accountId,
        debitPaise: l.debitPaise,
        creditPaise: l.creditPaise
      }))
    });

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: JournalEntryStatus.POSTED }
    });

    return { journalEntryId: entry.id };
  }

  async postReturnJournal(args: {
    tx: Tx;
    orgId: string;
    storeId: string;
    postedByUserId: string;
    invoiceNo: string;
    entryDate: Date;
    storeCreditPaise: bigint;
    taxableSubtotalPaise: bigint;
    cgstPaise: bigint;
    sgstPaise: bigint;
    igstPaise: bigint;
  }) {
    const { tx, orgId, storeId } = args;
    await this.ensureSystemAccountsInTx(tx, orgId);

    const codes = [
      SystemAccountCodes.SALES,
      SystemAccountCodes.STORE_CREDIT,
      SystemAccountCodes.OUTPUT_CGST,
      SystemAccountCodes.OUTPUT_SGST,
      SystemAccountCodes.OUTPUT_IGST
    ];

    const accounts = await tx.chartAccount.findMany({
      where: { orgId, code: { in: codes } },
      select: { id: true, code: true }
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));

    for (const c of codes) {
      if (!byCode.has(c)) throw new BadRequestException('Accounting system accounts are missing');
    }

    const salesAccountId = byCode.get(SystemAccountCodes.SALES)!;
    const storeCreditAccountId = byCode.get(SystemAccountCodes.STORE_CREDIT)!;
    const outputCgstAccountId = byCode.get(SystemAccountCodes.OUTPUT_CGST)!;
    const outputSgstAccountId = byCode.get(SystemAccountCodes.OUTPUT_SGST)!;
    const outputIgstAccountId = byCode.get(SystemAccountCodes.OUTPUT_IGST)!;

    const entry = await tx.journalEntry.create({
      data: {
        orgId,
        storeId,
        entryDate: args.entryDate,
        sourceType: JournalSourceType.RETURN,
        narration: `Return ${args.invoiceNo}`,
        postedByUserId: args.postedByUserId,
        status: JournalEntryStatus.DRAFT
      },
      select: { id: true }
    });

    const lines: Array<{ accountId: string; debitPaise: bigint; creditPaise: bigint }> = [];

    if (args.taxableSubtotalPaise > 0n) lines.push({ accountId: salesAccountId, debitPaise: args.taxableSubtotalPaise, creditPaise: 0n });
    if (args.cgstPaise > 0n) lines.push({ accountId: outputCgstAccountId, debitPaise: args.cgstPaise, creditPaise: 0n });
    if (args.sgstPaise > 0n) lines.push({ accountId: outputSgstAccountId, debitPaise: args.sgstPaise, creditPaise: 0n });
    if (args.igstPaise > 0n) lines.push({ accountId: outputIgstAccountId, debitPaise: args.igstPaise, creditPaise: 0n });

    lines.push({ accountId: storeCreditAccountId, debitPaise: 0n, creditPaise: args.storeCreditPaise });

    const totalDebit = lines.reduce((s, l) => s + l.debitPaise, 0n);
    const totalCredit = lines.reduce((s, l) => s + l.creditPaise, 0n);
    if (totalDebit !== totalCredit) throw new BadRequestException('Unbalanced journal entry');

    await tx.journalLine.createMany({
      data: lines.map((l) => ({
        orgId,
        journalEntryId: entry.id,
        accountId: l.accountId,
        debitPaise: l.debitPaise,
        creditPaise: l.creditPaise
      }))
    });

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: JournalEntryStatus.POSTED }
    });

    return { journalEntryId: entry.id };
  }

  async postCustomerCreditJournal(args: {
    tx: Tx;
    orgId: string;
    storeId: string;
    postedByUserId: string;
    entryDate: Date;
    receiptNo: string;
    paymentMethod: PaymentMethod;
    amountPaise: bigint;
  }) {
    const { tx, orgId, storeId } = args;
    await this.ensureSystemAccountsInTx(tx, orgId);

    const codes = [SystemAccountCodes.CASH, SystemAccountCodes.UPI_CLEARING, SystemAccountCodes.STORE_CREDIT];
    const accounts = await tx.chartAccount.findMany({
      where: { orgId, code: { in: codes } },
      select: { id: true, code: true }
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));
    for (const c of codes) {
      if (!byCode.has(c)) throw new BadRequestException('Accounting system accounts are missing');
    }

    const paymentAccountId =
      args.paymentMethod === PaymentMethod.CASH ? byCode.get(SystemAccountCodes.CASH)! : byCode.get(SystemAccountCodes.UPI_CLEARING)!;
    const storeCreditAccountId = byCode.get(SystemAccountCodes.STORE_CREDIT)!;

    if (args.amountPaise <= 0n) throw new BadRequestException('Invalid amount');

    const entry = await tx.journalEntry.create({
      data: {
        orgId,
        storeId,
        entryDate: args.entryDate,
        sourceType: 'CUSTOMER_CREDIT' as any,
        narration: `Customer Credit ${args.receiptNo}`,
        postedByUserId: args.postedByUserId,
        status: JournalEntryStatus.DRAFT
      },
      select: { id: true }
    });

    const lines = [
      { accountId: paymentAccountId, debitPaise: args.amountPaise, creditPaise: 0n },
      { accountId: storeCreditAccountId, debitPaise: 0n, creditPaise: args.amountPaise }
    ];

    const totalDebit = lines.reduce((s, l) => s + l.debitPaise, 0n);
    const totalCredit = lines.reduce((s, l) => s + l.creditPaise, 0n);
    if (totalDebit !== totalCredit) throw new BadRequestException('Unbalanced journal entry');

    await tx.journalLine.createMany({
      data: lines.map((l) => ({
        orgId,
        journalEntryId: entry.id,
        accountId: l.accountId,
        debitPaise: l.debitPaise,
        creditPaise: l.creditPaise
      }))
    });

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: JournalEntryStatus.POSTED }
    });

    return { journalEntryId: entry.id };
  }

  async postCustomerCreditSettlementJournal(args: {
    tx: Tx;
    orgId: string;
    storeId: string;
    postedByUserId: string;
    entryDate: Date;
    referenceNo: string;
    paymentMethod: PaymentMethod;
    amountPaise: bigint;
  }) {
    const { tx, orgId, storeId } = args;
    await this.ensureSystemAccountsInTx(tx, orgId);

    const codes = [SystemAccountCodes.CASH, SystemAccountCodes.UPI_CLEARING, SystemAccountCodes.ACCOUNTS_RECEIVABLE];
    const accounts = await tx.chartAccount.findMany({
      where: { orgId, code: { in: codes } },
      select: { id: true, code: true }
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));
    for (const c of codes) {
      if (!byCode.has(c)) throw new BadRequestException('Accounting system accounts are missing');
    }

    const paymentAccountId =
      args.paymentMethod === PaymentMethod.CASH ? byCode.get(SystemAccountCodes.CASH)! : byCode.get(SystemAccountCodes.UPI_CLEARING)!;
    const arAccountId = byCode.get(SystemAccountCodes.ACCOUNTS_RECEIVABLE)!;

    if (args.amountPaise <= 0n) throw new BadRequestException('Invalid amount');

    const entry = await tx.journalEntry.create({
      data: {
        orgId,
        storeId,
        entryDate: args.entryDate,
        sourceType: 'CUSTOMER_CREDIT' as any,
        narration: `Credit Settlement ${args.referenceNo}`,
        postedByUserId: args.postedByUserId,
        status: JournalEntryStatus.DRAFT
      },
      select: { id: true }
    });

    const lines = [
      { accountId: paymentAccountId, debitPaise: args.amountPaise, creditPaise: 0n },
      { accountId: arAccountId, debitPaise: 0n, creditPaise: args.amountPaise }
    ];

    const totalDebit = lines.reduce((s, l) => s + l.debitPaise, 0n);
    const totalCredit = lines.reduce((s, l) => s + l.creditPaise, 0n);
    if (totalDebit !== totalCredit) throw new BadRequestException('Unbalanced journal entry');

    await tx.journalLine.createMany({
      data: lines.map((l) => ({
        orgId,
        journalEntryId: entry.id,
        accountId: l.accountId,
        debitPaise: l.debitPaise,
        creditPaise: l.creditPaise
      }))
    });

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: JournalEntryStatus.POSTED }
    });

    return { journalEntryId: entry.id };
  }

  async postPurchaseJournal(args: {
    tx: Tx;
    orgId: string;
    storeId: string;
    postedByUserId: string;
    purchaseInvoiceId: string;
    supplierName: string;
    supplierInvoiceNo: string;
    invoiceDate: Date;
    grandTotalPaise: bigint;
    taxableSubtotalPaise: bigint;
    cgstPaise: bigint;
    sgstPaise: bigint;
    igstPaise: bigint;
  }) {
    const { tx, orgId, storeId } = args;
    await this.ensureSystemAccountsInTx(tx, orgId);

    const codes = [
      SystemAccountCodes.INVENTORY,
      SystemAccountCodes.INPUT_CGST,
      SystemAccountCodes.INPUT_SGST,
      SystemAccountCodes.INPUT_IGST,
      SystemAccountCodes.ACCOUNTS_PAYABLE
    ];

    const accounts = await tx.chartAccount.findMany({
      where: { orgId, code: { in: codes } },
      select: { id: true, code: true }
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));

    for (const c of codes) {
      if (!byCode.has(c)) throw new BadRequestException('Accounting system accounts are missing');
    }

    const inventoryAccountId = byCode.get(SystemAccountCodes.INVENTORY)!;
    const inputCgstAccountId = byCode.get(SystemAccountCodes.INPUT_CGST)!;
    const inputSgstAccountId = byCode.get(SystemAccountCodes.INPUT_SGST)!;
    const inputIgstAccountId = byCode.get(SystemAccountCodes.INPUT_IGST)!;
    const payableAccountId = byCode.get(SystemAccountCodes.ACCOUNTS_PAYABLE)!;

    const entry = await tx.journalEntry.create({
      data: {
        orgId,
        storeId,
        entryDate: args.invoiceDate,
        sourceType: JournalSourceType.PURCHASE,
        purchaseInvoiceId: args.purchaseInvoiceId,
        narration: `Purchase ${args.supplierName} ${args.supplierInvoiceNo}`,
        postedByUserId: args.postedByUserId,
        status: JournalEntryStatus.DRAFT
      },
      select: { id: true }
    });

    const lines: Array<{ accountId: string; debitPaise: bigint; creditPaise: bigint }> = [];

    if (args.taxableSubtotalPaise > 0n) {
      lines.push({ accountId: inventoryAccountId, debitPaise: args.taxableSubtotalPaise, creditPaise: 0n });
    }

    if (args.cgstPaise > 0n) lines.push({ accountId: inputCgstAccountId, debitPaise: args.cgstPaise, creditPaise: 0n });
    if (args.sgstPaise > 0n) lines.push({ accountId: inputSgstAccountId, debitPaise: args.sgstPaise, creditPaise: 0n });
    if (args.igstPaise > 0n) lines.push({ accountId: inputIgstAccountId, debitPaise: args.igstPaise, creditPaise: 0n });

    lines.push({ accountId: payableAccountId, debitPaise: 0n, creditPaise: args.grandTotalPaise });

    const totalDebit = lines.reduce((s, l) => s + l.debitPaise, 0n);
    const totalCredit = lines.reduce((s, l) => s + l.creditPaise, 0n);
    if (totalDebit !== totalCredit) throw new BadRequestException('Unbalanced journal entry');

    await tx.journalLine.createMany({
      data: lines.map((l) => ({
        orgId,
        journalEntryId: entry.id,
        accountId: l.accountId,
        debitPaise: l.debitPaise,
        creditPaise: l.creditPaise
      }))
    });

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: JournalEntryStatus.POSTED }
    });

    return { journalEntryId: entry.id };
  }

  async createManualJournalEntry(args: {
    orgId: string;
    storeId: string;
    postedByUserId: string;
    entryDate: Date;
    narration: string;
    lines: Array<{ accountId: string; debitPaise: bigint; creditPaise: bigint }>;
  }) {
    const debit = args.lines.reduce((s, l) => s + l.debitPaise, 0n);
    const credit = args.lines.reduce((s, l) => s + l.creditPaise, 0n);
    if (debit !== credit) throw new BadRequestException('Unbalanced journal entry');

    for (const l of args.lines) {
      if (l.debitPaise < 0n || l.creditPaise < 0n) throw new BadRequestException('Invalid debit/credit');
      if (l.debitPaise > 0n && l.creditPaise > 0n) throw new BadRequestException('Invalid debit/credit');
      if (l.debitPaise === 0n && l.creditPaise === 0n) throw new BadRequestException('Invalid debit/credit');
    }

    const accountIds = [...new Set(args.lines.map((l) => l.accountId))];
    const accounts = await this.prisma.chartAccount.findMany({
      where: { orgId: args.orgId, id: { in: accountIds } },
      select: { id: true }
    });
    if (accounts.length !== accountIds.length) throw new BadRequestException('Invalid accountId in lines');

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          orgId: args.orgId,
          storeId: args.storeId,
          entryDate: args.entryDate,
          sourceType: JournalSourceType.ADJUSTMENT,
          narration: args.narration,
          postedByUserId: args.postedByUserId,
          status: JournalEntryStatus.DRAFT
        },
        select: { id: true }
      });

      await tx.journalLine.createMany({
        data: args.lines.map((l) => ({
          orgId: args.orgId,
          journalEntryId: entry.id,
          accountId: l.accountId,
          debitPaise: l.debitPaise,
          creditPaise: l.creditPaise
        }))
      });

      await tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: JournalEntryStatus.POSTED }
      });

      return { journalEntryId: entry.id };
    });
  }

  async profitLossReport(args: { orgId: string; storeId?: string; periodStart: Date; periodEnd: Date }) {
    if (args.periodEnd < args.periodStart) throw new BadRequestException('periodEnd must be >= periodStart');

    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        orgId: args.orgId,
        journalEntry: {
          status: JournalEntryStatus.POSTED,
          ...(args.storeId ? { storeId: args.storeId } : {}),
          entryDate: { gte: args.periodStart, lte: args.periodEnd }
        }
      },
      _sum: { debitPaise: true, creditPaise: true }
    });

    const accountIds = grouped.map((g) => g.accountId);
    const accounts = await this.prisma.chartAccount.findMany({
      where: { orgId: args.orgId, id: { in: accountIds } },
      select: { id: true, code: true, name: true, type: true }
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const income: Array<{ accountId: string; code: string; name: string; amountPaise: bigint }> = [];
    const expense: Array<{ accountId: string; code: string; name: string; amountPaise: bigint }> = [];

    for (const g of grouped) {
      const acc = accountById.get(g.accountId);
      if (!acc) continue;
      const debit = g._sum.debitPaise ?? 0n;
      const credit = g._sum.creditPaise ?? 0n;

      if (acc.type === AccountType.INCOME) {
        const amountPaise = credit - debit;
        if (amountPaise !== 0n) income.push({ accountId: acc.id, code: acc.code, name: acc.name, amountPaise });
      }
      if (acc.type === AccountType.EXPENSE) {
        const amountPaise = debit - credit;
        if (amountPaise !== 0n) expense.push({ accountId: acc.id, code: acc.code, name: acc.name, amountPaise });
      }
    }

    income.sort((a, b) => (b.amountPaise > a.amountPaise ? 1 : b.amountPaise < a.amountPaise ? -1 : 0));
    expense.sort((a, b) => (b.amountPaise > a.amountPaise ? 1 : b.amountPaise < a.amountPaise ? -1 : 0));

    const totalIncomePaise = income.reduce((s, r) => s + r.amountPaise, 0n);
    const totalExpensePaise = expense.reduce((s, r) => s + r.amountPaise, 0n);
    const netProfitPaise = totalIncomePaise - totalExpensePaise;

    return {
      periodStart: args.periodStart.toISOString(),
      periodEnd: args.periodEnd.toISOString(),
      income,
      expense,
      totalIncomePaise,
      totalExpensePaise,
      netProfitPaise
    };
  }

  async exportJournalXlsx(args: { orgId: string; storeId: string; periodStart: Date; periodEnd: Date }) {
    if (args.periodEnd < args.periodStart) throw new BadRequestException('periodEnd must be >= periodStart');

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        orgId: args.orgId,
        storeId: args.storeId,
        entryDate: { gte: args.periodStart, lte: args.periodEnd }
      },
      orderBy: { entryDate: 'asc' },
      include: {
        store: { select: { code: true, name: true } },
        postedBy: { select: { fullName: true } },
        salesInvoice: {
          select: {
            invoiceNo: true,
            taxRegime: true,
            subtotalPaise: true,
            discountTotalPaise: true,
            taxTotalPaise: true,
            cgstTotalPaise: true,
            sgstTotalPaise: true,
            igstTotalPaise: true,
            grandTotalPaise: true
          }
        },
        purchaseInvoice: {
          select: {
            supplierInvoiceNo: true,
            subtotalPaise: true,
            taxTotalPaise: true,
            cgstTotalPaise: true,
            sgstTotalPaise: true,
            igstTotalPaise: true,
            grandTotalPaise: true,
            supplier: { select: { name: true } }
          }
        },
        lines: { include: { account: { select: { code: true, name: true, type: true } } } }
      }
    });

    const summary = [
      ['Period Start', args.periodStart.toISOString()],
      ['Period End', args.periodEnd.toISOString()],
      ['Posted Entries', entries.length],
      ['Generated At', new Date().toISOString()]
    ];

    const entryRows = entries.map((e) => {
      const debit = e.lines.reduce((s, l) => s + (l.debitPaise ?? 0n), 0n);
      const credit = e.lines.reduce((s, l) => s + (l.creditPaise ?? 0n), 0n);
      return {
        entry_date: e.entryDate.toISOString(),
        entry_id: e.id,
        store_code: e.store.code,
        store_name: e.store.name,
        source_type: e.sourceType,
        sales_invoice_no: e.salesInvoice?.invoiceNo ?? '',
        purchase_supplier: e.purchaseInvoice?.supplier.name ?? '',
        purchase_invoice_no: e.purchaseInvoice?.supplierInvoiceNo ?? '',
        invoice_value_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.grandTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.grandTotalPaise)
            : 0,
        gst_tax_total_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.taxTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.taxTotalPaise)
            : 0,
        gst_cgst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.cgstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.cgstTotalPaise)
            : 0,
        gst_sgst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.sgstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.sgstTotalPaise)
            : 0,
        gst_igst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.igstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.igstTotalPaise)
            : 0,
        narration: e.narration,
        posted_by: e.postedBy.fullName,
        status: e.status,
        total_debit_rupees: paiseToRupeesNumber(debit),
        total_credit_rupees: paiseToRupeesNumber(credit)
      };
    });

    const lineRows = entries.flatMap((e) =>
      e.lines.map((l) => ({
        entry_date: e.entryDate.toISOString(),
        entry_id: e.id,
        store_code: e.store.code,
        store_name: e.store.name,
        source_type: e.sourceType,
        sales_invoice_no: e.salesInvoice?.invoiceNo ?? '',
        purchase_supplier: e.purchaseInvoice?.supplier.name ?? '',
        purchase_invoice_no: e.purchaseInvoice?.supplierInvoiceNo ?? '',
        invoice_value_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.grandTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.grandTotalPaise)
            : 0,
        gst_tax_total_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.taxTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.taxTotalPaise)
            : 0,
        gst_cgst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.cgstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.cgstTotalPaise)
            : 0,
        gst_sgst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.sgstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.sgstTotalPaise)
            : 0,
        gst_igst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.igstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.igstTotalPaise)
            : 0,
        narration: e.narration,
        posted_by: e.postedBy.fullName,
        account_code: l.account.code,
        account_name: l.account.name,
        account_type: l.account.type,
        debit_rupees: paiseToRupeesNumber(l.debitPaise ?? 0n),
        credit_rupees: paiseToRupeesNumber(l.creditPaise ?? 0n)
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'SUMMARY');

    const entrySheet =
      entryRows.length > 0
        ? XLSX.utils.json_to_sheet(entryRows)
        : XLSX.utils.aoa_to_sheet([
            [
              'entry_date',
              'entry_id',
              'store_code',
              'store_name',
              'source_type',
              'sales_invoice_no',
              'purchase_supplier',
              'purchase_invoice_no',
              'invoice_value_rupees',
              'gst_tax_total_rupees',
              'gst_cgst_rupees',
              'gst_sgst_rupees',
              'gst_igst_rupees',
              'narration',
              'posted_by',
              'status',
              'total_debit_rupees',
              'total_credit_rupees'
            ]
          ]);
    const lineSheet =
      lineRows.length > 0
        ? XLSX.utils.json_to_sheet(lineRows)
        : XLSX.utils.aoa_to_sheet([
            [
              'entry_date',
              'entry_id',
              'store_code',
              'store_name',
              'source_type',
              'sales_invoice_no',
              'purchase_supplier',
              'purchase_invoice_no',
              'invoice_value_rupees',
              'gst_tax_total_rupees',
              'gst_cgst_rupees',
              'gst_sgst_rupees',
              'gst_igst_rupees',
              'narration',
              'posted_by',
              'account_code',
              'account_name',
              'account_type',
              'debit_rupees',
              'credit_rupees'
            ]
          ]);

    XLSX.utils.book_append_sheet(wb, entrySheet, 'JOURNAL_ENTRIES');
    XLSX.utils.book_append_sheet(wb, lineSheet, 'JOURNAL_LINES');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return buf;
  }

  async exportJournalJson(args: { orgId: string; storeId: string; periodStart: Date; periodEnd: Date }) {
    if (args.periodEnd < args.periodStart) throw new BadRequestException('periodEnd must be >= periodStart');

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        orgId: args.orgId,
        storeId: args.storeId,
        entryDate: { gte: args.periodStart, lte: args.periodEnd }
      },
      orderBy: { entryDate: 'asc' },
      include: {
        store: { select: { code: true, name: true } },
        postedBy: { select: { fullName: true } },
        salesInvoice: {
          select: {
            invoiceNo: true,
            taxRegime: true,
            subtotalPaise: true,
            discountTotalPaise: true,
            taxTotalPaise: true,
            cgstTotalPaise: true,
            sgstTotalPaise: true,
            igstTotalPaise: true,
            grandTotalPaise: true
          }
        },
        purchaseInvoice: {
          select: {
            supplierInvoiceNo: true,
            subtotalPaise: true,
            taxTotalPaise: true,
            cgstTotalPaise: true,
            sgstTotalPaise: true,
            igstTotalPaise: true,
            grandTotalPaise: true,
            supplier: { select: { name: true } }
          }
        },
        lines: { include: { account: { select: { code: true, name: true, type: true } } } }
      }
    });

    const summary = [
      ['Period Start', args.periodStart.toISOString()],
      ['Period End', args.periodEnd.toISOString()],
      ['Posted Entries', entries.length],
      ['Generated At', new Date().toISOString()]
    ].map(([k, v]) => ({ key: k, value: v }));

    const entryRows = entries.map((e) => {
      const debit = e.lines.reduce((s, l) => s + (l.debitPaise ?? 0n), 0n);
      const credit = e.lines.reduce((s, l) => s + (l.creditPaise ?? 0n), 0n);
      return {
        entry_date: e.entryDate.toISOString(),
        entry_id: e.id,
        store_code: e.store.code,
        store_name: e.store.name,
        source_type: e.sourceType,
        sales_invoice_no: e.salesInvoice?.invoiceNo ?? '',
        purchase_supplier: e.purchaseInvoice?.supplier.name ?? '',
        purchase_invoice_no: e.purchaseInvoice?.supplierInvoiceNo ?? '',
        invoice_value_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.grandTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.grandTotalPaise)
            : 0,
        gst_tax_total_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.taxTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.taxTotalPaise)
            : 0,
        gst_cgst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.cgstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.cgstTotalPaise)
            : 0,
        gst_sgst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.sgstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.sgstTotalPaise)
            : 0,
        gst_igst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.igstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.igstTotalPaise)
            : 0,
        narration: e.narration,
        posted_by: e.postedBy.fullName,
        status: e.status,
        total_debit_rupees: paiseToRupeesNumber(debit),
        total_credit_rupees: paiseToRupeesNumber(credit)
      };
    });

    const lineRows = entries.flatMap((e) =>
      e.lines.map((l) => ({
        entry_date: e.entryDate.toISOString(),
        entry_id: e.id,
        store_code: e.store.code,
        store_name: e.store.name,
        source_type: e.sourceType,
        sales_invoice_no: e.salesInvoice?.invoiceNo ?? '',
        purchase_supplier: e.purchaseInvoice?.supplier.name ?? '',
        purchase_invoice_no: e.purchaseInvoice?.supplierInvoiceNo ?? '',
        invoice_value_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.grandTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.grandTotalPaise)
            : 0,
        gst_tax_total_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.taxTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.taxTotalPaise)
            : 0,
        gst_cgst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.cgstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.cgstTotalPaise)
            : 0,
        gst_sgst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.sgstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.sgstTotalPaise)
            : 0,
        gst_igst_rupees: e.salesInvoice
          ? paiseToRupeesNumber(e.salesInvoice.igstTotalPaise)
          : e.purchaseInvoice
            ? paiseToRupeesNumber(e.purchaseInvoice.igstTotalPaise)
            : 0,
        narration: e.narration,
        posted_by: e.postedBy.fullName,
        account_code: l.account.code,
        account_name: l.account.name,
        account_type: l.account.type,
        debit_rupees: paiseToRupeesNumber(l.debitPaise ?? 0n),
        credit_rupees: paiseToRupeesNumber(l.creditPaise ?? 0n)
      }))
    );

    return {
      meta: {
        report: 'Journal Export',
        period_start: args.periodStart.toISOString(),
        period_end: args.periodEnd.toISOString(),
        generated_at: new Date().toISOString()
      },
      summary,
      entries: entryRows,
      lines: lineRows
    };
  }

  async exportProfitLossXlsx(args: { orgId: string; storeId: string; periodStart: Date; periodEnd: Date }) {
    const report = await this.profitLossReport(args);

    const wb = XLSX.utils.book_new();

    const summary = [
      ['Period Start', report.periodStart],
      ['Period End', report.periodEnd],
      ['Total Income (₹)', paiseToRupeesNumber(report.totalIncomePaise)],
      ['Total Expense (₹)', paiseToRupeesNumber(report.totalExpensePaise)],
      ['Net Profit (₹)', paiseToRupeesNumber(report.netProfitPaise)]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'SUMMARY');

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.income.map((r) => ({
          code: r.code,
          name: r.name,
          amount_rupees: paiseToRupeesNumber(r.amountPaise)
        }))
      ),
      'INCOME'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.expense.map((r) => ({
          code: r.code,
          name: r.name,
          amount_rupees: paiseToRupeesNumber(r.amountPaise)
        }))
      ),
      'EXPENSE'
    );

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return buf;
  }
}
