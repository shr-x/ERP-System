import fs from 'node:fs/promises';
import path from 'node:path';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, ReportType, SalesInvoiceStatus } from '.prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { htmlToPdfBuffer } from './pdf';

function parseLocalDateStart(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid periodStart');
  return d;
}

function parseLocalDateEnd(dateStr: string) {
  const d = new Date(`${dateStr}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid periodEnd');
  return d;
}

function paiseToRupeesNumber(paise: bigint) {
  return Number(paise) / 100;
}

function safeFileBase(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function jsonStringifySafe(value: unknown) {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}

@Injectable()
export class GstService {
  constructor(private readonly prisma: PrismaService) {}

  private isValidGstin(gstin: string) {
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.trim().toUpperCase());
  }

  private isoDate(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  private async finalizedSalesInvoices(args: { orgId: string; storeId?: string; start: Date; end: Date }) {
    return this.prisma.salesInvoice.findMany({
      where: {
        orgId: args.orgId,
        ...(args.storeId ? { storeId: args.storeId } : {}),
        status: SalesInvoiceStatus.ISSUED,
        invoiceDate: { gte: args.start, lte: args.end },
        journalEntries: { some: { status: 'POSTED', sourceType: 'SALE' } }
      },
      include: {
        customer: { select: { fullName: true, phone: true, gstin: true, isBusiness: true, isWalkIn: true } } as any,
        lines: {
          orderBy: { lineNo: 'asc' },
          select: {
            productName: true,
            hsnCode: true,
            qty: true,
            gstRateBp: true,
            taxableValuePaise: true,
            cgstAmountPaise: true,
            sgstAmountPaise: true,
            igstAmountPaise: true,
            lineTotalPaise: true
          }
        }
      }
    });
  }

  private async salesReturns(args: { orgId: string; storeId?: string; start: Date; end: Date }) {
    return this.prisma.salesReturn.findMany({
      where: {
        orgId: args.orgId,
        ...(args.storeId ? { storeId: args.storeId } : {}),
        createdAt: { gte: args.start, lte: args.end }
      },
      select: { id: true, createdAt: true }
    });
  }

  private async ensureExportDir() {
    const dir = path.resolve(process.cwd(), 'storage', 'exports');
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async exportGstr1(args: {
    orgId: string;
    storeId?: string;
    periodStart: string;
    periodEnd: string;
    format: 'XLSX' | 'PDF' | 'JSON';
  }) {
    const start = parseLocalDateStart(args.periodStart);
    const end = parseLocalDateEnd(args.periodEnd);
    if (end < start) throw new BadRequestException('periodEnd must be >= periodStart');

    if (args.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: args.storeId, orgId: args.orgId },
        select: { id: true }
      });
      if (!store) throw new ForbiddenException('Invalid store');
    }

    const { org, rows } = await this.getGstr1Summary({
      orgId: args.orgId,
      storeId: args.storeId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd
    });

    const exportDir = await this.ensureExportDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = safeFileBase(`GSTR1_${args.periodStart}_${args.periodEnd}_${stamp}`);

    if (args.format === 'XLSX' || args.format === 'JSON') {
      const invoices = await this.finalizedSalesInvoices({ orgId: args.orgId, storeId: args.storeId, start, end });

      const issues: Array<{ type: string; invoiceNo?: string; line?: string; message: string }> = [];
      for (const inv of invoices as any[]) {
        const cust = inv.customer as any;
        if (cust?.isBusiness) {
          const gstin = String(cust?.gstin || '').trim().toUpperCase();
          if (!gstin || !this.isValidGstin(gstin)) {
            issues.push({ type: 'B2B_GSTIN', invoiceNo: inv.invoiceNo, message: 'B2B invoice missing/invalid GSTIN' });
          }
        }
        for (const l of inv.lines as any[]) {
          const hsn = String(l.hsnCode || '').trim();
          if (!hsn) issues.push({ type: 'HSN_MISSING', invoiceNo: inv.invoiceNo, line: l.productName, message: 'Invoice line missing HSN code' });
        }
      }
      if (issues.length) throw new BadRequestException({ message: 'Validation failed', issues });

      const b2bRows: Array<Record<string, any>> = [];
      const b2cAgg = new Map<string, { type: string; pos: string; taxRate: number; taxableValue: number; combinedAmount: number }>();
      const hsnAgg = new Map<string, { hsn: string; desc: string; uqc: string; qty: number; totalValue: number; taxableValue: number; igst: number; cgst: number; sgst: number }>();

      for (const inv of invoices as any[]) {
        const cust = inv.customer as any;
        const isB2b = !!cust?.isBusiness;
        const byRate = new Map<number, { taxable: bigint; total: bigint }>();

        for (const l of inv.lines as any[]) {
          const rate = Number(l.gstRateBp) / 100;
          const prev = byRate.get(rate) || { taxable: 0n, total: 0n };
          byRate.set(rate, { taxable: prev.taxable + BigInt(l.taxableValuePaise), total: prev.total + BigInt(l.lineTotalPaise) });

          const hsn = String(l.hsnCode || '').trim();
          if (hsn) {
            const prevH = hsnAgg.get(hsn) || { hsn, desc: l.productName, uqc: 'NOS', qty: 0, totalValue: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0 };
            prevH.qty += Number(l.qty);
            prevH.totalValue += paiseToRupeesNumber(BigInt(l.lineTotalPaise));
            prevH.taxableValue += paiseToRupeesNumber(BigInt(l.taxableValuePaise));
            prevH.igst += paiseToRupeesNumber(BigInt(l.igstAmountPaise));
            prevH.cgst += paiseToRupeesNumber(BigInt(l.cgstAmountPaise));
            prevH.sgst += paiseToRupeesNumber(BigInt(l.sgstAmountPaise));
            hsnAgg.set(hsn, prevH);
          }
        }

        for (const [rate, sums] of byRate.entries()) {
          if (isB2b) {
            b2bRows.push({
              'Recipient GSTIN': String(cust?.gstin || '').trim().toUpperCase(),
              'Invoice Number': inv.invoiceNo,
              'Invoice Date': this.isoDate(inv.invoiceDate),
              'Invoice Value': paiseToRupeesNumber(BigInt(inv.grandTotalPaise)),
              'Place of Supply (State Code)': inv.placeOfSupplyStateCode,
              'Tax Rate': rate,
              'Taxable Value': paiseToRupeesNumber(sums.taxable),
              'Amount of Cess': 0
            });
          } else {
            const key = `${inv.placeOfSupplyStateCode}:${rate}`;
            const prev = b2cAgg.get(key) || { type: 'Other', pos: inv.placeOfSupplyStateCode, taxRate: rate, taxableValue: 0, combinedAmount: 0 };
            prev.taxableValue += paiseToRupeesNumber(sums.taxable);
            prev.combinedAmount += paiseToRupeesNumber(sums.total);
            b2cAgg.set(key, prev);
          }
        }
      }

      const b2cRows = Array.from(b2cAgg.values()).map((r) => ({
        'Type (E-commerce/Other)': r.type,
        'Place of Supply': r.pos,
        'Tax Rate': r.taxRate,
        'Taxable Value': Number(r.taxableValue.toFixed(2)),
        'Combined Amount': Number(r.combinedAmount.toFixed(2))
      }));
      const hsnRows = Array.from(hsnAgg.values()).map((r) => ({
        'HSN Code': r.hsn,
        Description: r.desc,
        'UQC (Unit Quantity Code)': r.uqc,
        'Total Quantity': Number(r.qty.toFixed(3)),
        'Total Value': Number(r.totalValue.toFixed(2)),
        'Taxable Value': Number(r.taxableValue.toFixed(2)),
        'Integrated Tax Amount': Number(r.igst.toFixed(2)),
        'Central Tax Amount': Number(r.cgst.toFixed(2)),
        'State/UT Tax Amount': Number(r.sgst.toFixed(2))
      }));

      const invoicesAll = await this.prisma.salesInvoice.findMany({
        where: {
          orgId: args.orgId,
          ...(args.storeId ? { storeId: args.storeId } : {}),
          invoiceDate: { gte: start, lte: end },
          status: { in: [SalesInvoiceStatus.ISSUED, SalesInvoiceStatus.CANCELLED] }
        },
        select: { invoiceNo: true, status: true }
      });
      const invNos = invoicesAll.map((x) => x.invoiceNo).sort();
      const invFrom = invNos[0] || '';
      const invTo = invNos[invNos.length - 1] || '';
      const invCancelled = invoicesAll.filter((x) => x.status === SalesInvoiceStatus.CANCELLED).length;

      const returns = await this.salesReturns({ orgId: args.orgId, storeId: args.storeId, start, end });
      const retNos = returns.map((r) => `RET-${r.id.split('-')[0].toUpperCase()}`).sort();
      const retFrom = retNos[0] || '';
      const retTo = retNos[retNos.length - 1] || '';

      const docRows = [
        { 'Nature of Document (Invoices/Credit Notes)': 'Invoices', 'Sr. No From': invFrom, 'Sr. No To': invTo, 'Total Count': invoicesAll.length, 'Cancelled Count': invCancelled },
        { 'Nature of Document (Invoices/Credit Notes)': 'Credit Notes', 'Sr. No From': retFrom, 'Sr. No To': retTo, 'Total Count': returns.length, 'Cancelled Count': 0 }
      ];

      if (args.format === 'JSON') {
        const payload = {
          meta: {
            report: 'GSTR-1',
            org_name: org?.name ?? 'Sutra ERP',
            gstin: org?.gstin ?? '',
            period_start: args.periodStart,
            period_end: args.periodEnd,
            generated_at: new Date().toISOString()
          },
          sheets: {
            B2B_Sales: b2bRows,
            B2C_Sales: b2cRows,
            HSN_Summary: hsnRows,
            Doc_Summary: docRows
          }
        };

        const filePath = path.join(exportDir, `${base}.json`);
        await fs.writeFile(filePath, jsonStringifySafe(payload), 'utf8');

        const exp = await this.prisma.reportExport.create({
          data: {
            orgId: args.orgId,
            storeId: args.storeId,
            reportType: ReportType.GSTR1,
            periodStart: new Date(`${args.periodStart}T00:00:00`),
            periodEnd: new Date(`${args.periodEnd}T00:00:00`),
            filePath
          },
          select: { id: true, reportType: true, filePath: true, createdAt: true }
        });

        return { export: exp };
      }

      const wb = XLSX.utils.book_new();
      const b2bWs = XLSX.utils.json_to_sheet(b2bRows, {
        header: [
          'Recipient GSTIN',
          'Invoice Number',
          'Invoice Date',
          'Invoice Value',
          'Place of Supply (State Code)',
          'Tax Rate',
          'Taxable Value',
          'Amount of Cess'
        ]
      });
      XLSX.utils.book_append_sheet(wb, b2bWs, 'B2B_Sales');

      const b2cWs = XLSX.utils.json_to_sheet(b2cRows, {
        header: ['Type (E-commerce/Other)', 'Place of Supply', 'Tax Rate', 'Taxable Value', 'Combined Amount']
      });
      XLSX.utils.book_append_sheet(wb, b2cWs, 'B2C_Sales');

      const hsnWs = XLSX.utils.json_to_sheet(hsnRows, {
        header: [
          'HSN Code',
          'Description',
          'UQC (Unit Quantity Code)',
          'Total Quantity',
          'Total Value',
          'Taxable Value',
          'Integrated Tax Amount',
          'Central Tax Amount',
          'State/UT Tax Amount'
        ]
      });
      XLSX.utils.book_append_sheet(wb, hsnWs, 'HSN_Summary');

      const docWs = XLSX.utils.json_to_sheet(docRows, {
        header: ['Nature of Document (Invoices/Credit Notes)', 'Sr. No From', 'Sr. No To', 'Total Count', 'Cancelled Count']
      });
      XLSX.utils.book_append_sheet(wb, docWs, 'Doc_Summary');

      const filePath = path.join(exportDir, `${base}.xlsx`);
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      await fs.writeFile(filePath, buf);

      const exp = await this.prisma.reportExport.create({
        data: {
          orgId: args.orgId,
          storeId: args.storeId,
          reportType: ReportType.GSTR1,
          periodStart: new Date(`${args.periodStart}T00:00:00`),
          periodEnd: new Date(`${args.periodEnd}T00:00:00`),
          filePath
        },
        select: { id: true, reportType: true, filePath: true, createdAt: true }
      });

      return { export: exp };
    }

    const html = this.renderGstr1Html({
      orgName: org?.name ?? 'Sutra ERP',
      gstin: org?.gstin ?? '',
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      rows: rows.map((r) => ({
        invoice_no: r.invoice_no,
        invoice_date: r.invoice_date,
        place_of_supply_state_code: r.place_of_supply_state_code,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        taxable_value: paiseToRupeesNumber(BigInt(r.taxable_value_paise)),
        cgst: paiseToRupeesNumber(BigInt(r.cgst_paise)),
        sgst: paiseToRupeesNumber(BigInt(r.sgst_paise)),
        igst: paiseToRupeesNumber(BigInt(r.igst_paise)),
        total: paiseToRupeesNumber(BigInt(r.total_paise))
      }))
    });

    const pdf = await htmlToPdfBuffer(html);
    const filePath = path.join(exportDir, `${base}.pdf`);
    await fs.writeFile(filePath, pdf);

    const exp = await this.prisma.reportExport.create({
      data: {
        orgId: args.orgId,
        storeId: args.storeId,
        reportType: ReportType.GSTR1,
        periodStart: new Date(`${args.periodStart}T00:00:00`),
        periodEnd: new Date(`${args.periodEnd}T00:00:00`),
        filePath
      },
      select: { id: true, reportType: true, filePath: true, createdAt: true }
    });

    return { export: exp };
  }

  async exportGstr3b(args: {
    orgId: string;
    storeId?: string;
    periodStart: string;
    periodEnd: string;
    format: 'XLSX' | 'PDF' | 'JSON';
  }) {
    const start = parseLocalDateStart(args.periodStart);
    const end = parseLocalDateEnd(args.periodEnd);
    if (end < start) throw new BadRequestException('periodEnd must be >= periodStart');

    if (args.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: args.storeId, orgId: args.orgId },
        select: { id: true }
      });
      if (!store) throw new ForbiddenException('Invalid store');
    }

    const { org, summaryPaise } = await this.getGstr3bSummary({
      orgId: args.orgId,
      storeId: args.storeId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd
    });

    const summary = {
      period_start: args.periodStart,
      period_end: args.periodEnd,
      output_taxable_value: paiseToRupeesNumber(summaryPaise.output_taxable_value_paise),
      output_cgst: paiseToRupeesNumber(summaryPaise.output_cgst_paise),
      output_sgst: paiseToRupeesNumber(summaryPaise.output_sgst_paise),
      output_igst: paiseToRupeesNumber(summaryPaise.output_igst_paise),
      input_taxable_value: paiseToRupeesNumber(summaryPaise.input_taxable_value_paise),
      itc_available_cgst: paiseToRupeesNumber(summaryPaise.itc_available_cgst_paise),
      itc_available_sgst: paiseToRupeesNumber(summaryPaise.itc_available_sgst_paise),
      itc_available_igst: paiseToRupeesNumber(summaryPaise.itc_available_igst_paise),
      itc_utilized_igst_to_igst: paiseToRupeesNumber(summaryPaise.itc_utilized_igst_to_igst_paise),
      itc_utilized_igst_to_cgst: paiseToRupeesNumber(summaryPaise.itc_utilized_igst_to_cgst_paise),
      itc_utilized_igst_to_sgst: paiseToRupeesNumber(summaryPaise.itc_utilized_igst_to_sgst_paise),
      itc_utilized_cgst_to_cgst: paiseToRupeesNumber(summaryPaise.itc_utilized_cgst_to_cgst_paise),
      itc_utilized_cgst_to_igst: paiseToRupeesNumber(summaryPaise.itc_utilized_cgst_to_igst_paise),
      itc_utilized_sgst_to_sgst: paiseToRupeesNumber(summaryPaise.itc_utilized_sgst_to_sgst_paise),
      itc_utilized_sgst_to_igst: paiseToRupeesNumber(summaryPaise.itc_utilized_sgst_to_igst_paise),
      net_payable_cash_cgst: paiseToRupeesNumber(summaryPaise.net_payable_cash_cgst_paise),
      net_payable_cash_sgst: paiseToRupeesNumber(summaryPaise.net_payable_cash_sgst_paise),
      net_payable_cash_igst: paiseToRupeesNumber(summaryPaise.net_payable_cash_igst_paise)
    };

    const exportDir = await this.ensureExportDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = safeFileBase(`GSTR3B_${args.periodStart}_${args.periodEnd}_${stamp}`);

    if (args.format === 'XLSX') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([summary]);
      XLSX.utils.book_append_sheet(wb, ws, 'GSTR-3B');

      const metaWs = XLSX.utils.aoa_to_sheet([
        ['Report', 'GSTR-3B (Summary)'],
        ['Organization', org?.name ?? ''],
        ['GSTIN', org?.gstin ?? ''],
        ['Period Start', args.periodStart],
        ['Period End', args.periodEnd],
        ['Generated At', new Date().toISOString()]
      ]);
      XLSX.utils.book_append_sheet(wb, metaWs, 'META');

      const filePath = path.join(exportDir, `${base}.xlsx`);
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      await fs.writeFile(filePath, buf);

      const exp = await this.prisma.reportExport.create({
        data: {
          orgId: args.orgId,
          storeId: args.storeId,
          reportType: ReportType.GSTR3B,
          periodStart: new Date(`${args.periodStart}T00:00:00`),
          periodEnd: new Date(`${args.periodEnd}T00:00:00`),
          filePath
        },
        select: { id: true, reportType: true, filePath: true, createdAt: true }
      });

      return { export: exp };
    }

    if (args.format === 'JSON') {
      const payload = {
        meta: {
          report: 'GSTR-3B (Summary)',
          org_name: org?.name ?? 'Sutra ERP',
          gstin: org?.gstin ?? '',
          period_start: args.periodStart,
          period_end: args.periodEnd,
          generated_at: new Date().toISOString()
        },
        summary,
        summary_paise: summaryPaise
      };
      const filePath = path.join(exportDir, `${base}.json`);
      await fs.writeFile(filePath, jsonStringifySafe(payload), 'utf8');
      const exp = await this.prisma.reportExport.create({
        data: {
          orgId: args.orgId,
          storeId: args.storeId,
          reportType: ReportType.GSTR3B,
          periodStart: new Date(`${args.periodStart}T00:00:00`),
          periodEnd: new Date(`${args.periodEnd}T00:00:00`),
          filePath
        },
        select: { id: true, reportType: true, filePath: true, createdAt: true }
      });
      return { export: exp };
    }

    const html = this.renderGstr3bHtml({
      orgName: org?.name ?? 'Sutra ERP',
      gstin: org?.gstin ?? '',
      summary
    });
    const pdf = await htmlToPdfBuffer(html);
    const filePath = path.join(exportDir, `${base}.pdf`);
    await fs.writeFile(filePath, pdf);

    const exp = await this.prisma.reportExport.create({
      data: {
        orgId: args.orgId,
        storeId: args.storeId,
        reportType: ReportType.GSTR3B,
        periodStart: new Date(`${args.periodStart}T00:00:00`),
        periodEnd: new Date(`${args.periodEnd}T00:00:00`),
        filePath
      },
      select: { id: true, reportType: true, filePath: true, createdAt: true }
    });

    return { export: exp };
  }

  async getGstr1Summary(args: { orgId: string; storeId?: string; periodStart: string; periodEnd: string }) {
    const start = parseLocalDateStart(args.periodStart);
    const end = parseLocalDateEnd(args.periodEnd);
    if (end < start) throw new BadRequestException('periodEnd must be >= periodStart');

    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        orgId: args.orgId,
        ...(args.storeId ? { storeId: args.storeId } : {}),
        status: 'ISSUED',
        invoiceDate: { gte: start, lte: end }
      },
      orderBy: { invoiceDate: 'asc' },
      include: { customer: { select: { fullName: true, phone: true } } }
    });

    let org = await this.prisma.organization.findFirst({
      where: { id: args.orgId },
      select: { name: true, gstin: true }
    });

    if (args.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: args.storeId, orgId: args.orgId },
        select: { name: true, gstin: true }
      });
      if (store) {
        org = { name: store.name, gstin: store.gstin || org?.gstin || null };
      }
    }

    const rows = invoices.map((inv) => ({
      invoice_no: inv.invoiceNo,
      invoice_date: inv.invoiceDate.toISOString(),
      place_of_supply_state_code: inv.placeOfSupplyStateCode,
      customer_name: inv.customer.fullName,
      customer_phone: inv.customer.phone ?? '',
      taxable_value_paise: inv.subtotalPaise.toString(),
      cgst_paise: inv.cgstTotalPaise.toString(),
      sgst_paise: inv.sgstTotalPaise.toString(),
      igst_paise: inv.igstTotalPaise.toString(),
      total_paise: inv.grandTotalPaise.toString()
    }));

    return { org, rows };
  }

  async getGstr3bSummary(args: { orgId: string; storeId?: string; periodStart: string; periodEnd: string }) {
    const start = parseLocalDateStart(args.periodStart);
    const end = parseLocalDateEnd(args.periodEnd);
    if (end < start) throw new BadRequestException('periodEnd must be >= periodStart');

    const salesAgg = await this.prisma.salesInvoice.aggregate({
      where: {
        orgId: args.orgId,
        ...(args.storeId ? { storeId: args.storeId } : {}),
        status: SalesInvoiceStatus.ISSUED,
        invoiceDate: { gte: start, lte: end },
        journalEntries: { some: { status: 'POSTED', sourceType: 'SALE' } }
      },
      _sum: { subtotalPaise: true, cgstTotalPaise: true, sgstTotalPaise: true, igstTotalPaise: true }
    });

    const returnAgg = await this.prisma.salesReturnLine.aggregate({
      where: {
        orgId: args.orgId,
        salesReturn: {
          ...(args.storeId ? { storeId: args.storeId } : {}),
          createdAt: { gte: start, lte: end }
        }
      },
      _sum: { taxableValuePaise: true, cgstAmountPaise: true, sgstAmountPaise: true, igstAmountPaise: true }
    });

    const purchaseAgg = await this.prisma.purchaseInvoice.aggregate({
      where: {
        orgId: args.orgId,
        ...(args.storeId ? { storeId: args.storeId } : {}),
        invoiceDate: { gte: start, lte: end },
        journalEntries: { some: { status: 'POSTED', sourceType: 'PURCHASE' } }
      },
      _sum: { subtotalPaise: true, cgstTotalPaise: true, sgstTotalPaise: true, igstTotalPaise: true }
    });

    const outTaxable = (salesAgg._sum.subtotalPaise ?? 0n) - (returnAgg._sum.taxableValuePaise ?? 0n);
    const outCgst = (salesAgg._sum.cgstTotalPaise ?? 0n) - (returnAgg._sum.cgstAmountPaise ?? 0n);
    const outSgst = (salesAgg._sum.sgstTotalPaise ?? 0n) - (returnAgg._sum.sgstAmountPaise ?? 0n);
    const outIgst = (salesAgg._sum.igstTotalPaise ?? 0n) - (returnAgg._sum.igstAmountPaise ?? 0n);
    const safeOutTaxable = outTaxable < 0n ? 0n : outTaxable;
    const safeOutCgst = outCgst < 0n ? 0n : outCgst;
    const safeOutSgst = outSgst < 0n ? 0n : outSgst;
    const safeOutIgst = outIgst < 0n ? 0n : outIgst;

    let itcCgst = purchaseAgg._sum.cgstTotalPaise ?? 0n;
    let itcSgst = purchaseAgg._sum.sgstTotalPaise ?? 0n;
    let itcIgst = purchaseAgg._sum.igstTotalPaise ?? 0n;

    let payableIgst = safeOutIgst;
    let payableCgst = safeOutCgst;
    let payableSgst = safeOutSgst;

    let itcUtilIgstToIgst = 0n;
    let itcUtilIgstToCgst = 0n;
    let itcUtilIgstToSgst = 0n;
    let itcUtilCgstToCgst = 0n;
    let itcUtilCgstToIgst = 0n;
    let itcUtilSgstToSgst = 0n;
    let itcUtilSgstToIgst = 0n;

    const use = (from: 'igst' | 'cgst' | 'sgst', to: 'igst' | 'cgst' | 'sgst') => {
      if (from === 'igst' && to === 'igst') {
        const amt = minBigInt(itcIgst, payableIgst);
        itcIgst -= amt;
        payableIgst -= amt;
        itcUtilIgstToIgst += amt;
      }
      if (from === 'igst' && to === 'cgst') {
        const amt = minBigInt(itcIgst, payableCgst);
        itcIgst -= amt;
        payableCgst -= amt;
        itcUtilIgstToCgst += amt;
      }
      if (from === 'igst' && to === 'sgst') {
        const amt = minBigInt(itcIgst, payableSgst);
        itcIgst -= amt;
        payableSgst -= amt;
        itcUtilIgstToSgst += amt;
      }
      if (from === 'cgst' && to === 'cgst') {
        const amt = minBigInt(itcCgst, payableCgst);
        itcCgst -= amt;
        payableCgst -= amt;
        itcUtilCgstToCgst += amt;
      }
      if (from === 'cgst' && to === 'igst') {
        const amt = minBigInt(itcCgst, payableIgst);
        itcCgst -= amt;
        payableIgst -= amt;
        itcUtilCgstToIgst += amt;
      }
      if (from === 'sgst' && to === 'sgst') {
        const amt = minBigInt(itcSgst, payableSgst);
        itcSgst -= amt;
        payableSgst -= amt;
        itcUtilSgstToSgst += amt;
      }
      if (from === 'sgst' && to === 'igst') {
        const amt = minBigInt(itcSgst, payableIgst);
        itcSgst -= amt;
        payableIgst -= amt;
        itcUtilSgstToIgst += amt;
      }
    };

    use('igst', 'igst');
    use('igst', 'cgst');
    use('igst', 'sgst');
    use('cgst', 'cgst');
    use('cgst', 'igst');
    use('sgst', 'sgst');
    use('sgst', 'igst');

    let org = await this.prisma.organization.findFirst({
      where: { id: args.orgId },
      select: { name: true, gstin: true }
    });

    if (args.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: args.storeId, orgId: args.orgId },
        select: { name: true, gstin: true }
      });
      if (store) {
        org = { name: store.name, gstin: store.gstin || org?.gstin || null };
      }
    }

    const summaryPaise = {
      period_start: args.periodStart,
      period_end: args.periodEnd,
      output_taxable_value_paise: safeOutTaxable,
      output_cgst_paise: safeOutCgst,
      output_sgst_paise: safeOutSgst,
      output_igst_paise: safeOutIgst,
      input_taxable_value_paise: purchaseAgg._sum.subtotalPaise ?? 0n,
      itc_available_cgst_paise: purchaseAgg._sum.cgstTotalPaise ?? 0n,
      itc_available_sgst_paise: purchaseAgg._sum.sgstTotalPaise ?? 0n,
      itc_available_igst_paise: purchaseAgg._sum.igstTotalPaise ?? 0n,
      itc_utilized_igst_to_igst_paise: itcUtilIgstToIgst,
      itc_utilized_igst_to_cgst_paise: itcUtilIgstToCgst,
      itc_utilized_igst_to_sgst_paise: itcUtilIgstToSgst,
      itc_utilized_cgst_to_cgst_paise: itcUtilCgstToCgst,
      itc_utilized_cgst_to_igst_paise: itcUtilCgstToIgst,
      itc_utilized_sgst_to_sgst_paise: itcUtilSgstToSgst,
      itc_utilized_sgst_to_igst_paise: itcUtilSgstToIgst,
      net_payable_cash_cgst_paise: payableCgst,
      net_payable_cash_sgst_paise: payableSgst,
      net_payable_cash_igst_paise: payableIgst,
      itc_balance_cgst_paise: itcCgst,
      itc_balance_sgst_paise: itcSgst,
      itc_balance_igst_paise: itcIgst
    };

    return { org, summaryPaise };
  }

  async getItcRegister(args: { orgId: string; storeId?: string; periodStart: string; periodEnd: string }) {
    const start = parseLocalDateStart(args.periodStart);
    const end = parseLocalDateEnd(args.periodEnd);
    if (end < start) throw new BadRequestException('periodEnd must be >= periodStart');

    const invoices = await this.prisma.purchaseInvoice.findMany({
      where: {
        orgId: args.orgId,
        ...(args.storeId ? { storeId: args.storeId } : {}),
        invoiceDate: { gte: start, lte: end },
        journalEntries: { some: { status: 'POSTED', sourceType: 'PURCHASE' } }
      },
      orderBy: { invoiceDate: 'asc' },
      include: { supplier: { select: { name: true, gstin: true, stateCode: true } } }
    });

    const rows = invoices.map((inv) => ({
      invoice_date: inv.invoiceDate.toISOString(),
      supplier_name: inv.supplier.name,
      supplier_gstin: inv.supplier.gstin ?? '',
      supplier_state_code: inv.supplier.stateCode ?? '',
      supplier_invoice_no: inv.supplierInvoiceNo,
      taxable_value_paise: inv.subtotalPaise.toString(),
      cgst_paise: inv.cgstTotalPaise.toString(),
      sgst_paise: inv.sgstTotalPaise.toString(),
      igst_paise: inv.igstTotalPaise.toString(),
      total_paise: inv.grandTotalPaise.toString()
    }));

    return { periodStart: args.periodStart, periodEnd: args.periodEnd, rows };
  }

  async getExportForOrg(orgId: string, id: string) {
    return this.prisma.reportExport.findFirst({
      where: { id, orgId },
      select: { id: true, reportType: true, filePath: true, createdAt: true }
    });
  }

  private renderGstr1Html(input: {
    orgName: string;
    gstin: string;
    periodStart: string;
    periodEnd: string;
    rows: Array<Record<string, any>>;
  }) {
    const header = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:18px;font-weight:700;">${input.orgName}</div>
          <div style="font-size:12px;">GSTIN: ${input.gstin}</div>
          <div style="font-size:12px;">GSTR-1 (Invoice-wise)</div>
          <div style="font-size:12px;">Period: ${input.periodStart} to ${input.periodEnd}</div>
        </div>
        <div style="font-size:11px;">Generated: ${new Date().toISOString()}</div>
      </div>
    `;

    const rowsHtml = input.rows
      .map(
        (r) => `
        <tr>
          <td>${r.invoice_no}</td>
          <td>${r.invoice_date}</td>
          <td>${r.place_of_supply_state_code}</td>
          <td>${r.customer_name}</td>
          <td>${r.taxable_value.toFixed(2)}</td>
          <td>${r.cgst.toFixed(2)}</td>
          <td>${r.sgst.toFixed(2)}</td>
          <td>${r.igst.toFixed(2)}</td>
          <td>${r.total.toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; color: #111; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
            th { background: #f5f5f5; text-align: left; }
          </style>
        </head>
        <body>
          ${header}
          <table>
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date</th>
                <th>POS State</th>
                <th>Customer</th>
                <th>Taxable (₹)</th>
                <th>CGST (₹)</th>
                <th>SGST (₹)</th>
                <th>IGST (₹)</th>
                <th>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `;
  }

  private renderGstr3bHtml(input: { orgName: string; gstin: string; summary: any }) {
    const s = input.summary;
    const month = typeof s.period_start === 'string' ? s.period_start.slice(0, 7) : '';
    const asMoney = (n: any) => (typeof n === 'number' ? n.toFixed(2) : String(n));
    const row4 = (a: any, b: any, c: any, d: any, e: any) =>
      `<tr><td>${a}</td><td style="text-align:right">${asMoney(b)}</td><td style="text-align:right">${asMoney(c)}</td><td style="text-align:right">${asMoney(d)}</td><td style="text-align:right">${asMoney(e)}</td></tr>`;

    const outputTax = {
      taxable: s.output_taxable_value,
      igst: s.output_igst,
      cgst: s.output_cgst,
      sgst: s.output_sgst
    };
    const itcAvail = {
      taxable: s.input_taxable_value,
      igst: s.itc_available_igst,
      cgst: s.itc_available_cgst,
      sgst: s.itc_available_sgst
    };
    const itcUtilized = {
      igst: s.itc_utilized_igst_to_igst + s.itc_utilized_cgst_to_igst + s.itc_utilized_sgst_to_igst,
      cgst: s.itc_utilized_igst_to_cgst + s.itc_utilized_cgst_to_cgst,
      sgst: s.itc_utilized_igst_to_sgst + s.itc_utilized_sgst_to_sgst
    };
    const netCash = {
      igst: s.net_payable_cash_igst,
      cgst: s.net_payable_cash_cgst,
      sgst: s.net_payable_cash_sgst
    };
    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; color: #111; }
            .muted { color: #555; }
            .hdr { display:flex; justify-content:space-between; align-items:flex-start; gap: 12px; }
            .title { font-size: 18px; font-weight: 800; }
            .sub { font-size: 12px; }
            h3 { margin: 18px 0 6px 0; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; }
            th { background: #f5f5f5; text-align: left; }
          </style>
        </head>
        <body>
          <div class="hdr">
            <div>
              <div class="title">${input.orgName}</div>
              <div class="sub">GSTIN: ${input.gstin}</div>
              <div class="sub">Reporting Month: ${month}</div>
              <div class="muted sub">Period: ${s.period_start} to ${s.period_end}</div>
            </div>
            <div class="muted sub">Generated: ${new Date().toISOString()}</div>
          </div>

          <h3>Table 3.1 (Outward Supplies)</h3>
          <table>
            <thead>
              <tr>
                <th>Particulars</th>
                <th style="text-align:right">Taxable Value (₹)</th>
                <th style="text-align:right">IGST (₹)</th>
                <th style="text-align:right">CGST (₹)</th>
                <th style="text-align:right">SGST (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${row4('Outward taxable supplies (net of returns)', outputTax.taxable, outputTax.igst, outputTax.cgst, outputTax.sgst)}
            </tbody>
          </table>

          <h3>Table 4 (Eligible ITC)</h3>
          <table>
            <thead>
              <tr>
                <th>Particulars</th>
                <th style="text-align:right">Taxable Value (₹)</th>
                <th style="text-align:right">IGST (₹)</th>
                <th style="text-align:right">CGST (₹)</th>
                <th style="text-align:right">SGST (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${row4('ITC available from purchases/expenses', itcAvail.taxable, itcAvail.igst, itcAvail.cgst, itcAvail.sgst)}
            </tbody>
          </table>

          <h3>Table 6.1 (Payment of Tax)</h3>
          <table>
            <thead>
              <tr>
                <th>Tax</th>
                <th style="text-align:right">Output Tax (₹)</th>
                <th style="text-align:right">ITC Utilized (₹)</th>
                <th style="text-align:right">Net Cash Payable (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>IGST</td>
                <td style="text-align:right">${asMoney(outputTax.igst)}</td>
                <td style="text-align:right">${asMoney(itcUtilized.igst)}</td>
                <td style="text-align:right">${asMoney(netCash.igst)}</td>
              </tr>
              <tr>
                <td>CGST</td>
                <td style="text-align:right">${asMoney(outputTax.cgst)}</td>
                <td style="text-align:right">${asMoney(itcUtilized.cgst)}</td>
                <td style="text-align:right">${asMoney(netCash.cgst)}</td>
              </tr>
              <tr>
                <td>SGST</td>
                <td style="text-align:right">${asMoney(outputTax.sgst)}</td>
                <td style="text-align:right">${asMoney(itcUtilized.sgst)}</td>
                <td style="text-align:right">${asMoney(netCash.sgst)}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;
  }
}
