import fs from 'node:fs/promises';
import path from 'node:path';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrintFormat, SalesInvoiceStatus } from '.prisma/client';
import puppeteer from 'puppeteer-core';
import { env } from '../env/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildUpiQrDataUrl,
  renderA4CreditReceiptHtml,
  renderA4CreditSettlementHtml,
  renderA4InvoiceHtml,
  renderA4ReturnHtml,
  renderThermalCreditReceiptHtml,
  renderThermalCreditSettlementHtml,
  renderThermalReceiptHtml,
  renderThermalReturnReceiptHtml
} from './printing.templates';

function paiseToRupeesString(paise: bigint | number) {
  const p = typeof paise === 'bigint' ? paise : BigInt(Math.round(paise));
  const sign = p < 0n ? '-' : '';
  const abs = p < 0n ? -p : p;
  const rupees = abs / 100n;
  const pa = abs % 100n;
  return `${sign}${rupees.toString()}.${pa.toString().padStart(2, '0')}`;
}

function formatInvoiceDate(d: Date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = months[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd}-${mon}-${yyyy}`;
}

function resolveChromeExecutablePath() {
  if (env.PUPPETEER_EXECUTABLE_PATH) return env.PUPPETEER_EXECUTABLE_PATH;
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

@Injectable()
export class PrintingService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensurePrintDir() {
    const dir = path.resolve(process.cwd(), 'storage', 'prints');
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  private async resolveStitchingForInvoice(orgId: string, invoiceId: string) {
    const order = await (this.prisma as any).stitchingOrder.findFirst({
      where: { orgId, erpInvoiceId: invoiceId },
      include: { productTemplate: { select: { name: true, category: true } } }
    });
    if (!order) return undefined;

    const erpMaterial = order.erpMaterialId
      ? await (this.prisma as any).product.findFirst({
          where: { id: order.erpMaterialId, orgId, isActive: true },
          select: { code: true, name: true }
        })
      : null;

    return {
      orderCode: order.orderCode,
      productName: order.productTemplate?.name ?? '',
      productCategory: order.productTemplate?.category ?? '',
      materialSource: (order.materialSource ?? 'STORE') as 'STORE' | 'CUSTOMER',
      materialName: erpMaterial ? `${erpMaterial.name} (${erpMaterial.code})` : undefined,
      materialUsageMeters: order.materialUsageMeters ? String(order.materialUsageMeters) : undefined,
      colorName: order.selectedColorName ?? undefined,
      colorCode: order.selectedColorCode,
      deliveryDate: new Date(order.deliveryDate).toISOString().slice(0, 10),
      measurements: (order.measurements ?? {}) as any
    };
  }

  async renderThermalHtmlForInvoice(args: { orgId: string; invoiceId: string }) {
    const invoice = (await this.prisma.salesInvoice.findFirst({
      where: { id: args.invoiceId, orgId: args.orgId, status: SalesInvoiceStatus.ISSUED },
      include: {
        lines: { orderBy: { lineNo: 'asc' } },
        store: { select: { address: true, stateCode: true, code: true, name: true, phone: true, gstin: true, footerNote: true } },
        customer: { select: { fullName: true, phone: true, stateCode: true, isWalkIn: true, gstin: true, address: true, pincode: true } },
        payments: { orderBy: { receivedAt: 'asc' } },
        couponRedemptions: { orderBy: { redeemedAt: 'asc' }, select: { coupon: { select: { code: true } } } }
      }
    } as any)) as any;
    if (!invoice) throw new ForbiddenException('Invalid invoice');

    const org = await this.prisma.organization.findFirst({
      where: { id: args.orgId },
      select: { name: true, gstin: true, legalAddress: true }
    });

    const loyaltyRedeemPoints = ((invoice as any).loyaltyRedeemPoints as number | undefined) ?? 0;
    const loyaltyDiscountPaise = BigInt(loyaltyRedeemPoints) * 100n;
    const itemDiscountPaise = invoice.discountTotalPaise > loyaltyDiscountPaise ? invoice.discountTotalPaise - loyaltyDiscountPaise : 0n;

    const couponCode = invoice.couponRedemptions?.[0]?.coupon?.code || undefined;
    const couponAppliedPaise = invoice.storeCreditAppliedPaise ?? 0n;
    const payablePaise = invoice.grandTotalPaise - couponAppliedPaise;

    const totals = {
      subtotalRupees: paiseToRupeesString(invoice.subtotalPaise + invoice.discountTotalPaise),
      discountRupees: paiseToRupeesString(itemDiscountPaise),
      loyaltyRupees: loyaltyDiscountPaise > 0n ? paiseToRupeesString(loyaltyDiscountPaise) : undefined,
      taxableRupees: paiseToRupeesString(invoice.subtotalPaise),
      cgstRupees: paiseToRupeesString(invoice.cgstTotalPaise),
      sgstRupees: paiseToRupeesString(invoice.sgstTotalPaise),
      igstRupees: paiseToRupeesString(invoice.igstTotalPaise),
      grandTotalRupees: paiseToRupeesString(invoice.grandTotalPaise),
      couponRupees: couponAppliedPaise > 0n ? paiseToRupeesString(couponAppliedPaise) : undefined,
      payableRupees: couponAppliedPaise > 0n ? paiseToRupeesString(payablePaise) : undefined
    };

    const mainPay = invoice.payments.find((p: any) => p.method !== 'STORE_CREDIT') ?? invoice.payments[0];
    const storeCreditPay = invoice.payments.find((p: any) => p.method === 'STORE_CREDIT');
    const paymentLine = mainPay
      ? `${mainPay.method}${mainPay.upiRef ? ` (${mainPay.upiRef})` : ''}${storeCreditPay ? ` + COUPON${couponCode ? `(${couponCode})` : ''}` : ''}`
      : storeCreditPay
        ? `COUPON${couponCode ? ` (${couponCode})` : ''}`
        : undefined;
    const amountRupees = Number(invoice.grandTotalPaise) / 100;
    const upiQrDataUrl = await buildUpiQrDataUrl({ invoiceNo: invoice.invoiceNo, amountRupees });
    const stitching = await this.resolveStitchingForInvoice(args.orgId, invoice.id);

    return renderThermalReceiptHtml({
      storeName: invoice.store.name,
      storeAddress: invoice.store.address,
      storePhone: invoice.store.phone ?? undefined,
      gstin: invoice.store.gstin ?? undefined,
      footerNote: invoice.store.footerNote ?? undefined,
      invoiceNo: invoice.invoiceNo,
      invoiceDateIso: formatInvoiceDate(invoice.invoiceDate),
      buyerName: invoice.customer.fullName,
      buyerPhone: invoice.customer.phone ?? '',
      buyerGstin: (invoice.customer as any).gstin ?? undefined,
      buyerAddress: (invoice.customer as any).address ?? invoice.deliveryAddress ?? undefined,
      buyerPincode: (invoice.customer as any).pincode ?? invoice.deliveryPincode ?? undefined,
      paymentLine,
      upiQrDataUrl,
      loyaltyRedeemPoints,
      couponCode,
      stitching,
      items: invoice.lines.map((l: any) => ({
        name: l.productName,
        qty: l.qty.toString(),
        rateRupees: paiseToRupeesString(l.unitPricePaise),
        amountRupees: paiseToRupeesString(l.taxableValuePaise)
      })),
      totals
    });
  }

  async renderThermalHtmlForReturn(args: { orgId: string; salesReturnId: string }) {
    const ret = await this.prisma.salesReturn.findFirst({
      where: { id: args.salesReturnId, orgId: args.orgId },
      include: {
        lines: { orderBy: { id: 'asc' } },
        store: { select: { address: true, stateCode: true, code: true, name: true, phone: true, gstin: true, footerNote: true } },
        customer: { select: { fullName: true, phone: true, stateCode: true, isWalkIn: true } },
        invoice: { select: { invoiceNo: true, invoiceDate: true } },
        coupon: { select: { code: true } }
      }
    });
    if (!ret) throw new ForbiddenException('Invalid return');

    const org = await this.prisma.organization.findFirst({
      where: { id: args.orgId },
      select: { name: true, gstin: true, legalAddress: true }
    });

    const returnNo = `RET-${ret.id.split('-')[0].toUpperCase()}`;
    const returnDateIso = formatInvoiceDate(ret.createdAt);

    const taxablePaise = ret.lines.reduce((s, l) => s + l.taxableValuePaise, 0n);
    const cgstPaise = ret.lines.reduce((s, l) => s + l.cgstAmountPaise, 0n);
    const sgstPaise = ret.lines.reduce((s, l) => s + l.sgstAmountPaise, 0n);
    const igstPaise = ret.lines.reduce((s, l) => s + l.igstAmountPaise, 0n);

    const creditLine =
      ret.mode === 'LOYALTY'
        ? `Credit: ${ret.pointsCredited} pts`
        : ret.coupon?.code
          ? `Coupon: ${ret.coupon.code}`
          : 'Coupon issued';

    return renderThermalReturnReceiptHtml({
      storeName: ret.store.name,
      storeAddress: ret.store.address,
      storePhone: ret.store.phone ?? undefined,
      gstin: ret.store.gstin ?? undefined,
      footerNote: ret.store.footerNote ?? undefined,
      returnNo,
      returnDateIso,
      originalInvoiceNo: ret.invoice.invoiceNo,
      buyerName: ret.customer.fullName,
      buyerPhone: ret.customer.phone ?? '',
      creditLine,
      items: ret.lines.map((l) => ({
        name: l.productName,
        qty: l.qty.toString(),
        amountRupees: paiseToRupeesString(l.lineTotalPaise)
      })),
      totals: {
        taxableRupees: paiseToRupeesString(taxablePaise),
        cgstRupees: paiseToRupeesString(cgstPaise),
        sgstRupees: paiseToRupeesString(sgstPaise),
        igstRupees: paiseToRupeesString(igstPaise),
        grandTotalRupees: paiseToRupeesString(ret.amountPaise)
      }
    });
  }

  async generateInvoicePrint(args: {
    orgId: string;
    userStoreId?: string;
    role: string;
    invoiceId: string;
    format: PrintFormat;
  }) {
    const invoice = (await this.prisma.salesInvoice.findFirst({
      where: { id: args.invoiceId, orgId: args.orgId, status: SalesInvoiceStatus.ISSUED },
      include: {
        lines: { orderBy: { lineNo: 'asc' } },
        store: { select: { address: true, stateCode: true, code: true, name: true, phone: true, gstin: true, footerNote: true } },
        customer: { select: { fullName: true, phone: true, stateCode: true, isWalkIn: true, gstin: true, address: true, pincode: true } },
        payments: { orderBy: { receivedAt: 'asc' } },
        couponRedemptions: { orderBy: { redeemedAt: 'asc' }, select: { coupon: { select: { code: true } } } }
      }
    } as any)) as any;
    if (!invoice) throw new ForbiddenException('Invalid invoice');

    if (args.userStoreId && invoice.storeId !== args.userStoreId && args.role !== 'ADMIN') {
      throw new ForbiddenException('Invoice not accessible');
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: args.orgId },
      select: { name: true, gstin: true, legalAddress: true }
    });

    const items = invoice.lines.map((l: any) => ({
      name: l.productName,
      hsn: l.hsnCode,
      qty: l.qty.toString(),
      unitPriceRupees: paiseToRupeesString(l.unitPricePaise),
      discountRupees: paiseToRupeesString(l.discountPaise),
      taxableRupees: paiseToRupeesString(l.taxableValuePaise),
      cgstRupees: paiseToRupeesString(l.cgstAmountPaise),
      sgstRupees: paiseToRupeesString(l.sgstAmountPaise),
      igstRupees: paiseToRupeesString(l.igstAmountPaise),
      totalRupees: paiseToRupeesString(l.lineTotalPaise),
      gstRatePercent: (l.gstRateBp / 100).toFixed(2)
    }));

    const loyaltyRedeemPoints = ((invoice as any).loyaltyRedeemPoints as number | undefined) ?? 0;
    const loyaltyDiscountPaise = BigInt(loyaltyRedeemPoints) * 100n;
    const itemDiscountPaise = invoice.discountTotalPaise > loyaltyDiscountPaise ? invoice.discountTotalPaise - loyaltyDiscountPaise : 0n;

    const couponCode = invoice.couponRedemptions?.[0]?.coupon?.code || undefined;
    const couponAppliedPaise = invoice.storeCreditAppliedPaise ?? 0n;
    const payablePaise = invoice.grandTotalPaise - couponAppliedPaise;

    const totals = {
      subtotalRupees: paiseToRupeesString(invoice.subtotalPaise + invoice.discountTotalPaise),
      discountRupees: paiseToRupeesString(itemDiscountPaise),
      loyaltyRupees: loyaltyDiscountPaise > 0n ? paiseToRupeesString(loyaltyDiscountPaise) : undefined,
      taxableRupees: paiseToRupeesString(invoice.subtotalPaise),
      cgstRupees: paiseToRupeesString(invoice.cgstTotalPaise),
      sgstRupees: paiseToRupeesString(invoice.sgstTotalPaise),
      igstRupees: paiseToRupeesString(invoice.igstTotalPaise),
      grandTotalRupees: paiseToRupeesString(invoice.grandTotalPaise),
      couponRupees: couponAppliedPaise > 0n ? paiseToRupeesString(couponAppliedPaise) : undefined,
      payableRupees: couponAppliedPaise > 0n ? paiseToRupeesString(payablePaise) : undefined
    };

    const stitching = await this.resolveStitchingForInvoice(args.orgId, invoice.id);

    if (args.format === PrintFormat.THERMAL_80MM) {
      const mainPay = invoice.payments.find((p: any) => p.method !== 'STORE_CREDIT') ?? invoice.payments[0];
      const storeCreditPay = invoice.payments.find((p: any) => p.method === 'STORE_CREDIT');
      const paymentLine = mainPay
        ? `${mainPay.method}${mainPay.upiRef ? ` (${mainPay.upiRef})` : ''}${storeCreditPay ? ` + COUPON${couponCode ? `(${couponCode})` : ''}` : ''}`
        : storeCreditPay
          ? `COUPON${couponCode ? ` (${couponCode})` : ''}`
          : undefined;
      const amountRupees = Number(invoice.grandTotalPaise) / 100;
      const upiQrDataUrl = await buildUpiQrDataUrl({ invoiceNo: invoice.invoiceNo, amountRupees });
      const html = renderThermalReceiptHtml({
        storeName: invoice.store.name,
        storeAddress: invoice.store.address,
        storePhone: invoice.store.phone ?? undefined,
        gstin: invoice.store.gstin ?? undefined,
        footerNote: invoice.store.footerNote ?? undefined,
        invoiceNo: invoice.invoiceNo,
        invoiceDateIso: formatInvoiceDate(invoice.invoiceDate),
        buyerName: invoice.customer.fullName,
        buyerPhone: invoice.customer.phone ?? '',
        paymentLine,
        upiQrDataUrl,
        loyaltyRedeemPoints,
        couponCode,
        stitching,
        items: invoice.lines.map((l: any) => ({
          name: l.productName,
          qty: l.qty.toString(),
          rateRupees: paiseToRupeesString(l.unitPricePaise),
          amountRupees: paiseToRupeesString(l.taxableValuePaise)
        })),
        totals
      });

      const dir = await this.ensurePrintDir();
      const base = `receipt_${invoice.invoiceNo.replaceAll('/', '_')}_${Date.now()}.html`;
      const htmlPath = path.join(dir, base);
      await fs.writeFile(htmlPath, html, 'utf8');

      const job = await this.prisma.printJob.create({
        data: {
          orgId: args.orgId,
          kind: 'INVOICE',
          invoiceId: invoice.id,
          format: PrintFormat.THERMAL_80MM,
          htmlPath,
          htmlSnapshot: html
        } as any,
        select: { id: true }
      } as any);

      return { jobId: job.id, format: args.format, htmlPath, html };
    }

    const amountRupees = Number(invoice.grandTotalPaise) / 100;
    const upiQrDataUrl = await buildUpiQrDataUrl({ invoiceNo: invoice.invoiceNo, amountRupees });

    const mainPay = invoice.payments.find((p: any) => p.method !== 'STORE_CREDIT') ?? invoice.payments[0];

    const html = renderA4InvoiceHtml({
      storeName: invoice.store.name,
      storeAddress: invoice.store.address,
      storePhone: invoice.store.phone ?? undefined,
      gstin: invoice.store.gstin ?? undefined,
      footerNote: invoice.store.footerNote ?? undefined,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: formatInvoiceDate(invoice.invoiceDate),
      placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
      buyerName: invoice.customer.fullName,
      buyerPhone: invoice.customer.phone ?? '',
      buyerGstin: (invoice.customer as any).gstin ?? undefined,
      buyerAddress: (invoice.customer as any).address ?? invoice.deliveryAddress ?? undefined,
      buyerPincode: (invoice.customer as any).pincode ?? invoice.deliveryPincode ?? undefined,
      isWalkInCustomer: invoice.customer.isWalkIn,
      deliveryAddress: invoice.deliveryAddress ?? undefined,
      deliveryPincode: invoice.deliveryPincode ?? undefined,
      paymentMethod: mainPay?.method ?? undefined,
      paymentRef: mainPay?.upiRef ?? undefined,
      loyaltyRedeemPoints,
      couponCode,
      stitching,
      items: invoice.lines.map((l: any) => ({
        name: l.productName,
        hsn: l.hsnCode,
        qty: l.qty.toString(),
        unitPriceRupees: paiseToRupeesString(l.unitPricePaise),
        discountRupees: paiseToRupeesString(l.discountPaise),
        gstRatePercent: (l.gstRateBp / 100).toFixed(0),
        lineTaxableRupees: paiseToRupeesString(l.taxableValuePaise)
      })),
      totals,
      upiQrDataUrl
    });

    const executablePath = resolveChromeExecutablePath();
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });

      const dir = await this.ensurePrintDir();
      const base = `invoice_${invoice.invoiceNo.replaceAll('/', '_')}_${Date.now()}.pdf`;
      const filePath = path.join(dir, base);
      await fs.writeFile(filePath, pdf);

      const job = await this.prisma.printJob.create({
        data: {
          orgId: args.orgId,
          kind: 'INVOICE',
          invoiceId: invoice.id,
          format: PrintFormat.A4,
          pdfPath: filePath
        } as any,
        select: { id: true }
      } as any);

      return { jobId: job.id, format: args.format, pdfPath: filePath };
    } finally {
      await browser.close();
    }
  }

  async generateReturnPrint(args: {
    orgId: string;
    userStoreId?: string;
    role: string;
    salesReturnId: string;
    format: PrintFormat;
  }) {
    const ret = await this.prisma.salesReturn.findFirst({
      where: { id: args.salesReturnId, orgId: args.orgId },
      include: {
        lines: { orderBy: { id: 'asc' } },
        store: { select: { address: true, stateCode: true, code: true, name: true, phone: true, gstin: true, footerNote: true } },
        customer: { select: { fullName: true, phone: true, stateCode: true, isWalkIn: true } },
        invoice: { select: { invoiceNo: true, invoiceDate: true } },
        coupon: { select: { code: true } }
      }
    });
    if (!ret) throw new ForbiddenException('Invalid return');

    if (args.userStoreId && ret.storeId !== args.userStoreId && args.role !== 'ADMIN') {
      throw new ForbiddenException('Return not accessible');
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: args.orgId },
      select: { name: true, gstin: true, legalAddress: true }
    });

    const returnNo = `RET-${ret.id.split('-')[0].toUpperCase()}`;
    const returnDate = formatInvoiceDate(ret.createdAt);
    const originalInvoiceNo = ret.invoice.invoiceNo;
    const originalInvoiceDate = formatInvoiceDate(ret.invoice.invoiceDate);

    const taxablePaise = ret.lines.reduce((s, l) => s + l.taxableValuePaise, 0n);
    const cgstPaise = ret.lines.reduce((s, l) => s + l.cgstAmountPaise, 0n);
    const sgstPaise = ret.lines.reduce((s, l) => s + l.sgstAmountPaise, 0n);
    const igstPaise = ret.lines.reduce((s, l) => s + l.igstAmountPaise, 0n);
    const totalPaise = ret.amountPaise;

    if (args.format === PrintFormat.THERMAL_80MM) {
      const creditLine =
        ret.mode === 'LOYALTY'
          ? `Credit: ${ret.pointsCredited} pts`
          : ret.coupon?.code
            ? `Coupon: ${ret.coupon.code}`
            : 'Coupon issued';

      const html = renderThermalReturnReceiptHtml({
        storeName: ret.store.name,
        storeAddress: ret.store.address,
        storePhone: ret.store.phone ?? undefined,
        gstin: ret.store.gstin ?? undefined,
        footerNote: ret.store.footerNote ?? undefined,
        returnNo,
        returnDateIso: returnDate,
        originalInvoiceNo,
        buyerName: ret.customer.fullName,
        buyerPhone: ret.customer.phone ?? '',
        creditLine,
        items: ret.lines.map((l) => ({
          name: l.productName,
          qty: l.qty.toString(),
          amountRupees: paiseToRupeesString(l.lineTotalPaise)
        })),
        totals: {
          taxableRupees: paiseToRupeesString(taxablePaise),
          cgstRupees: paiseToRupeesString(cgstPaise),
          sgstRupees: paiseToRupeesString(sgstPaise),
          igstRupees: paiseToRupeesString(igstPaise),
          grandTotalRupees: paiseToRupeesString(totalPaise)
        }
      });

      const dir = await this.ensurePrintDir();
      const base = `return_receipt_${originalInvoiceNo.replaceAll('/', '_')}_${returnNo}_${Date.now()}.html`;
      const htmlPath = path.join(dir, base);
      await fs.writeFile(htmlPath, html, 'utf8');

      const job = await this.prisma.printJob.create({
        data: {
          orgId: args.orgId,
          kind: 'RETURN',
          invoiceId: ret.salesInvoiceId,
          salesReturnId: ret.id,
          format: PrintFormat.THERMAL_80MM,
          htmlPath,
          htmlSnapshot: html
        } as any,
        select: { id: true }
      } as any);

      return { jobId: job.id, format: args.format, htmlPath, html };
    }

    const html = renderA4ReturnHtml({
      storeName: ret.store.name,
      storeAddress: ret.store.address,
      storePhone: ret.store.phone ?? undefined,
      gstin: ret.store.gstin ?? undefined,
      footerNote: ret.store.footerNote ?? undefined,
      returnNo,
      returnDate,
      originalInvoiceNo,
      originalInvoiceDate,
      buyerName: ret.customer.fullName,
      buyerPhone: ret.customer.phone ?? '',
      isWalkInCustomer: ret.customer.isWalkIn,
      creditMode: ret.mode as any,
      pointsCredited: ret.pointsCredited,
      couponCode: ret.coupon?.code ?? null,
      items: ret.lines.map((l) => ({
        name: l.productName,
        hsn: l.hsnCode,
        qty: l.qty.toString(),
        gstRatePercent: (l.gstRateBp / 100).toFixed(0),
        lineTaxableRupees: paiseToRupeesString(l.taxableValuePaise),
        lineTaxRupees: paiseToRupeesString(l.cgstAmountPaise + l.sgstAmountPaise + l.igstAmountPaise),
        lineTotalRupees: paiseToRupeesString(l.lineTotalPaise)
      })),
      totals: {
        taxableRupees: paiseToRupeesString(taxablePaise),
        cgstRupees: paiseToRupeesString(cgstPaise),
        sgstRupees: paiseToRupeesString(sgstPaise),
        igstRupees: paiseToRupeesString(igstPaise),
        grandTotalRupees: paiseToRupeesString(totalPaise)
      }
    });

    const executablePath = resolveChromeExecutablePath();
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });

      const dir = await this.ensurePrintDir();
      const base = `return_${originalInvoiceNo.replaceAll('/', '_')}_${returnNo}_${Date.now()}.pdf`;
      const filePath = path.join(dir, base);
      await fs.writeFile(filePath, pdf);

      const job = await this.prisma.printJob.create({
        data: {
          orgId: args.orgId,
          kind: 'RETURN',
          invoiceId: ret.salesInvoiceId,
          salesReturnId: ret.id,
          format: PrintFormat.A4,
          pdfPath: filePath
        } as any,
        select: { id: true }
      } as any);

      return { jobId: job.id, format: args.format, pdfPath: filePath };
    } finally {
      await browser.close();
    }
  }

  async renderThermalHtmlForCreditReceipt(args: { orgId: string; receiptId: string }) {
    const receipt = (await (this.prisma as any).customerCreditReceipt.findFirst({
      where: { id: args.receiptId, orgId: args.orgId },
      include: {
        store: { select: { address: true, name: true, phone: true, gstin: true, footerNote: true } },
        customer: { select: { fullName: true, phone: true } }
      }
    } as any)) as any;
    if (!receipt) throw new ForbiddenException('Invalid credit receipt');

    const org = await this.prisma.organization.findFirst({
      where: { id: args.orgId },
      select: { gstin: true }
    });

    const paymentLine = `${receipt.method}${receipt.upiRef ? ` (${receipt.upiRef})` : ''}`;

    return renderThermalCreditReceiptHtml({
      storeName: receipt.store.name,
      storeAddress: receipt.store.address,
      storePhone: receipt.store.phone ?? undefined,
      gstin: receipt.store.gstin ?? undefined,
      footerNote: receipt.store.footerNote ?? undefined,
      receiptNo: receipt.receiptNo,
      receiptDateIso: formatInvoiceDate(receipt.receiptDate),
      customerName: receipt.customer.fullName,
      customerPhone: receipt.customer.phone ?? '',
      amountRupees: paiseToRupeesString(receipt.amountPaise),
      paymentLine
    });
  }

  async generateCreditReceiptPrint(args: {
    orgId: string;
    userStoreId?: string;
    role: string;
    receiptId: string;
    format: PrintFormat;
  }) {
    const receipt = (await (this.prisma as any).customerCreditReceipt.findFirst({
      where: { id: args.receiptId, orgId: args.orgId },
      include: {
        store: { select: { address: true, name: true, phone: true, gstin: true, footerNote: true } },
        customer: { select: { fullName: true, phone: true, gstin: true, address: true, stateCode: true } }
      }
    } as any)) as any;
    if (!receipt) throw new ForbiddenException('Invalid credit receipt');
    if (args.userStoreId && receipt.storeId !== args.userStoreId && args.role !== 'ADMIN') {
      throw new ForbiddenException('Credit receipt not accessible');
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: args.orgId },
      select: { gstin: true }
    });

    if (args.format === PrintFormat.THERMAL_80MM) {
      const html = await this.renderThermalHtmlForCreditReceipt({ orgId: args.orgId, receiptId: receipt.id });
      const dir = await this.ensurePrintDir();
      const base = `credit_receipt_${receipt.receiptNo.replaceAll('/', '_')}_${Date.now()}.html`;
      const htmlPath = path.join(dir, base);
      await fs.writeFile(htmlPath, html, 'utf8');

      const job = await this.prisma.printJob.create({
        data: {
          orgId: args.orgId,
          kind: 'CREDIT_RECEIPT',
          creditReceiptId: receipt.id,
          format: PrintFormat.THERMAL_80MM,
          htmlPath,
          htmlSnapshot: html
        } as any,
        select: { id: true }
      } as any);

      return { jobId: job.id, format: args.format, htmlPath, html };
    }

    const html = renderA4CreditReceiptHtml({
      storeName: receipt.store.name,
      storeAddress: receipt.store.address,
      storePhone: receipt.store.phone ?? undefined,
      gstin: receipt.store.gstin ?? undefined,
      footerNote: receipt.store.footerNote ?? undefined,
      receiptNo: receipt.receiptNo,
      receiptDate: formatInvoiceDate(receipt.receiptDate),
      customerName: receipt.customer.fullName,
      customerPhone: receipt.customer.phone ?? '',
      customerGstin: receipt.customer.gstin ?? null,
      customerAddress: receipt.customer.address ?? null,
      customerStateCode: receipt.customer.stateCode ?? null,
      amountRupees: paiseToRupeesString(receipt.amountPaise),
      paymentMethod: receipt.method,
      paymentRef: receipt.upiRef ?? null
    });

    const executablePath = resolveChromeExecutablePath();
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });

      const dir = await this.ensurePrintDir();
      const base = `credit_receipt_${receipt.receiptNo.replaceAll('/', '_')}_${Date.now()}.pdf`;
      const filePath = path.join(dir, base);
      await fs.writeFile(filePath, pdf);

      const job = await this.prisma.printJob.create({
        data: {
          orgId: args.orgId,
          kind: 'CREDIT_RECEIPT',
          creditReceiptId: receipt.id,
          format: PrintFormat.A4,
          pdfPath: filePath
        } as any,
        select: { id: true }
      } as any);

      return { jobId: job.id, format: args.format, pdfPath: filePath };
    } finally {
      await browser.close();
    }
  }

  async renderThermalHtmlForCreditSettlement(args: { orgId: string; settlementId: string }) {
    const settlement = (await (this.prisma as any).customerCreditSettlement.findFirst({
      where: { id: args.settlementId, orgId: args.orgId },
      include: {
        store: { select: { code: true, address: true, name: true, phone: true, gstin: true, footerNote: true } },
        customer: { select: { fullName: true, phone: true } }
      }
    } as any)) as any;
    if (!settlement) throw new ForbiddenException('Invalid credit settlement');

    const referenceNo = settlement.referenceNo ?? `DUE/${settlement.store.code}/${settlement.id.toString().slice(-6).toUpperCase()}`;
    const paymentLine = `${settlement.method}${settlement.upiRef ? ` (${settlement.upiRef})` : ''}`;

    return renderThermalCreditSettlementHtml({
      storeName: settlement.store.name,
      storeAddress: settlement.store.address,
      storePhone: settlement.store.phone ?? undefined,
      gstin: settlement.store.gstin ?? undefined,
      footerNote: settlement.store.footerNote ?? undefined,
      referenceNo,
      settlementDateIso: formatInvoiceDate(settlement.createdAt),
      customerName: settlement.customer.fullName,
      customerPhone: settlement.customer.phone ?? '',
      amountRupees: paiseToRupeesString(settlement.amountPaise),
      paymentLine
    });
  }

  async generateCreditSettlementPrint(args: {
    orgId: string;
    userStoreId?: string;
    role: string;
    settlementId: string;
    format: PrintFormat;
  }) {
    const settlement = (await (this.prisma as any).customerCreditSettlement.findFirst({
      where: { id: args.settlementId, orgId: args.orgId },
      include: {
        store: { select: { code: true, address: true, name: true, phone: true, gstin: true, footerNote: true } },
        customer: { select: { fullName: true, phone: true } }
      }
    } as any)) as any;
    if (!settlement) throw new ForbiddenException('Invalid credit settlement');
    if (args.userStoreId && settlement.storeId !== args.userStoreId && args.role !== 'ADMIN') {
      throw new ForbiddenException('Credit settlement not accessible');
    }

    const referenceNo = settlement.referenceNo ?? `DUE/${settlement.store.code}/${settlement.id.toString().slice(-6).toUpperCase()}`;
    if (args.format === PrintFormat.THERMAL_80MM) {
      const html = await this.renderThermalHtmlForCreditSettlement({ orgId: args.orgId, settlementId: settlement.id });
      const dir = await this.ensurePrintDir();
      const base = `credit_settlement_${referenceNo.replaceAll('/', '_')}_${Date.now()}.html`;
      const htmlPath = path.join(dir, base);
      await fs.writeFile(htmlPath, html, 'utf8');

      const job = await this.prisma.printJob.create({
        data: {
          orgId: args.orgId,
          kind: 'CREDIT_SETTLEMENT',
          creditSettlementId: settlement.id,
          format: PrintFormat.THERMAL_80MM,
          htmlPath,
          htmlSnapshot: html
        } as any,
        select: { id: true }
      } as any);

      return { jobId: job.id, format: args.format, htmlPath, html };
    }

    const html = renderA4CreditSettlementHtml({
      storeName: settlement.store.name,
      storeAddress: settlement.store.address,
      storePhone: settlement.store.phone ?? undefined,
      gstin: settlement.store.gstin ?? undefined,
      footerNote: settlement.store.footerNote ?? undefined,
      referenceNo,
      settlementDate: formatInvoiceDate(settlement.createdAt),
      customerName: settlement.customer.fullName,
      customerPhone: settlement.customer.phone ?? '',
      amountRupees: paiseToRupeesString(settlement.amountPaise),
      paymentMethod: settlement.method,
      paymentRef: settlement.upiRef ?? null
    });

    const executablePath = resolveChromeExecutablePath();
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });

      const dir = await this.ensurePrintDir();
      const base = `credit_settlement_${referenceNo.replaceAll('/', '_')}_${Date.now()}.pdf`;
      const filePath = path.join(dir, base);
      await fs.writeFile(filePath, pdf);

      const job = await this.prisma.printJob.create({
        data: {
          orgId: args.orgId,
          kind: 'CREDIT_SETTLEMENT',
          creditSettlementId: settlement.id,
          format: PrintFormat.A4,
          pdfPath: filePath
        } as any,
        select: { id: true }
      } as any);

      return { jobId: job.id, format: args.format, pdfPath: filePath };
    } finally {
      await browser.close();
    }
  }

  async getPrintJob(orgId: string, id: string) {
    return this.prisma.printJob.findFirst({
      where: { id, orgId },
      select: { id: true, format: true, pdfPath: true, htmlPath: true, htmlSnapshot: true, createdAt: true }
    });
  }
}
