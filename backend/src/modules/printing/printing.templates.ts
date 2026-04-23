import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { env } from '../env/env';

export async function buildUpiQrDataUrl(args: { invoiceNo: string; amountRupees: number }) {
  if (!env.UPI_VPA || !env.UPI_PAYEE_NAME) return undefined;

  const tn = `Sutra ERP ${args.invoiceNo}`;
  const uri =
    `upi://pay?pa=${encodeURIComponent(env.UPI_VPA)}` +
    `&pn=${encodeURIComponent(env.UPI_PAYEE_NAME)}` +
    `&am=${encodeURIComponent(args.amountRupees.toFixed(2))}` +
    `&cu=INR` +
    `&tn=${encodeURIComponent(tn)}`;

  return QRCode.toDataURL(uri, { margin: 1, width: 256 });
}

export function tryLoadSutraLogoDataUrl() {
  const resolveExisting = (paths: string[]) => {
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }
    return undefined;
  };

  const trySvg = resolveExisting([
    path.resolve(process.cwd(), 'Sutra-Logo.svg'),
    path.resolve(process.cwd(), '..', 'Sutra-Logo.svg'),
    path.resolve(__dirname, '..', '..', '..', 'Sutra-Logo.svg'),
    path.resolve(__dirname, '..', '..', '..', '..', 'Sutra-Logo.svg')
  ]);
  if (trySvg) {
    const buf = fs.readFileSync(trySvg);
    return `data:image/svg+xml;base64,${buf.toString('base64')}`;
  }

  const tryPng = resolveExisting([
    path.resolve(process.cwd(), 'Sutra-Logo.png'),
    path.resolve(process.cwd(), '..', 'Sutra-Logo.png'),
    path.resolve(__dirname, '..', '..', '..', 'Sutra-Logo.png'),
    path.resolve(__dirname, '..', '..', '..', '..', 'Sutra-Logo.png')
  ]);
  if (tryPng) {
    const buf = fs.readFileSync(tryPng);
    return `data:image/png;base64,${buf.toString('base64')}`;
  }

  const tryIco = resolveExisting([
    path.resolve(process.cwd(), 'Sutra-Logo.ico'),
    path.resolve(process.cwd(), '..', 'Sutra-Logo.ico'),
    path.resolve(__dirname, '..', '..', '..', 'Sutra-Logo.ico'),
    path.resolve(__dirname, '..', '..', '..', '..', 'Sutra-Logo.ico')
  ]);
  if (tryIco) {
    const buf = fs.readFileSync(tryIco);
    return `data:image/x-icon;base64,${buf.toString('base64')}`;
  }

  return undefined;
}

export function renderA4InvoiceHtml(input: {
  storeName: string;
  storeAddress: string;
  storePhone?: string;
  gstin?: string;
  footerNote?: string;
  invoiceNo: string;
  invoiceDate: string;
  placeOfSupplyStateCode: string;
  buyerName: string;
  buyerPhone: string;
  buyerGstin?: string;
  buyerAddress?: string;
  buyerPincode?: string;
  isWalkInCustomer?: boolean;
  deliveryAddress?: string;
  deliveryPincode?: string;
  paymentMethod?: string;
  paymentRef?: string;
  loyaltyRedeemPoints?: number;
  couponCode?: string;
  stitching?: {
    orderCode: string;
    productName: string;
    productCategory: string;
    materialSource: 'STORE' | 'CUSTOMER';
    materialName?: string;
    materialUsageMeters?: string;
    colorName?: string;
    colorCode: string;
    deliveryDate: string;
    measurements?: Record<string, number>;
  };
  items: Array<{
    name: string;
    hsn: string;
    qty: string;
    unitPriceRupees: string;
    discountRupees: string;
    gstRatePercent: string;
    lineTaxableRupees: string;
  }>;
  totals: {
    subtotalRupees: string;
    discountRupees: string;
    loyaltyRupees?: string;
    couponRupees?: string;
    payableRupees?: string;
    taxableRupees: string;
    cgstRupees: string;
    sgstRupees: string;
    igstRupees: string;
    grandTotalRupees: string;
  };
  upiQrDataUrl?: string;
}) {
  const logo = tryLoadSutraLogoDataUrl();

  const rows = input.items
    .map(
      (i, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escapeHtml(i.name)}</td>
        <td>${escapeHtml(i.hsn)}</td>
        <td>${escapeHtml(i.qty)}</td>
        <td class="right">₹${escapeHtml(i.unitPriceRupees)}</td>
        <td class="right">${escapeHtml(i.gstRatePercent)}%</td>
        <td class="right">₹${escapeHtml(i.lineTaxableRupees)}</td>
      </tr>
    `
    )
    .join('');

  const qrBlock = input.upiQrDataUrl
    ? `
      <div style="border:1px solid #eee;border-radius:10px;padding:10px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Pay via UPI</div>
        <img src="${input.upiQrDataUrl}" style="width:140px;height:140px;display:block;" />
        <div style="font-size:10px;color:#444;margin-top:8px;">UPI: ${escapeHtml(env.UPI_VPA ?? '')}</div>
      </div>
    `
    : '';

  const amountWords = amountInWordsINR(input.totals.grandTotalRupees);

  const deliveryAddress = input.deliveryAddress
    ? input.deliveryAddress
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `${escapeHtml(l)}<br>`)
        .join('')
    : '';

  const showDelivery =
    !input.isWalkInCustomer && (!!input.deliveryAddress?.trim() || !!input.deliveryPincode?.trim()) && !input.buyerGstin;

  const gstLine = input.gstin ? `<div>GSTIN: ${escapeHtml(input.gstin)}</div>` : '';
  const phoneLine = input.storePhone ? `<div>Phone: ${escapeHtml(input.storePhone)}</div>` : '';
  const buyerGstinLine = input.buyerGstin ? `<div class="muted" style="margin-top:6px;">GSTIN: ${escapeHtml(input.buyerGstin)}</div>` : '';
  const buyerAddr =
    input.buyerAddress
      ? input.buyerAddress
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => `${escapeHtml(l)}<br>`)
          .join('')
      : '';
  const buyerAddrLine =
    buyerAddr || input.buyerPincode
      ? `<div class="muted" style="margin-top:6px;">${buyerAddr || ''}${input.buyerPincode ? `Pincode: ${escapeHtml(input.buyerPincode)}` : ''}</div>`
      : '';

  const stitchingBlock = input.stitching
    ? (() => {
        const st = input.stitching!;
        const materialLabel =
          st.materialSource === 'CUSTOMER'
            ? 'Customer Material'
            : st.materialName
              ? `${escapeHtml(st.materialName)}${st.materialUsageMeters ? ` · ${escapeHtml(st.materialUsageMeters)} m` : ''}`
              : st.materialUsageMeters
                ? `${escapeHtml(st.materialUsageMeters)} m`
                : '—';
        const colorLabel = st.colorName?.trim() ? escapeHtml(st.colorName.trim()) : escapeHtml(st.colorCode);
        const colorSwatch = `<span style="display:inline-block;height:12px;width:12px;border-radius:4px;border:1px solid #ddd;background:${escapeHtml(st.colorCode)};"></span>`;
        const meas = st.measurements ?? {};
        const measRows = Object.entries(meas)
          .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="right">${escapeHtml(String(v))}</td></tr>`)
          .join('');

        return `
          <div style="margin-top:14px;border:1px solid #eee;border-radius:12px;padding:12px;">
            <div style="font-weight:800;margin-bottom:8px;">Stitching Details</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr><th style="text-align:left;padding:8px;border-bottom:1px solid #eee;background:#fff;">Field</th><th style="text-align:left;padding:8px;border-bottom:1px solid #eee;background:#fff;">Value</th></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;width:160px;">Order</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(st.orderCode)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Dress</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(st.productName)} <span class="muted">· ${escapeHtml(st.productCategory)}</span></td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Material</td><td style="padding:8px;border-bottom:1px solid #eee;">${materialLabel}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Color</td><td style="padding:8px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px;">${colorSwatch}<span>${colorLabel}</span><span class="muted">${escapeHtml(st.colorCode)}</span></td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">Delivery</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(st.deliveryDate)}</td></tr>
            </table>
            ${
              measRows
                ? `
                  <div style="height:10px;"></div>
                  <div style="font-weight:700;margin-bottom:6px;">Measurements</div>
                  <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <tr><th style="text-align:left;padding:8px;border-bottom:1px solid #eee;background:#fff;">Field</th><th style="text-align:right;padding:8px;border-bottom:1px solid #eee;background:#fff;">Value</th></tr>
                    ${measRows}
                  </table>
                `
                : ''
            }
          </div>
        `;
      })()
    : '';

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: 'Noto Sans', 'DejaVu Sans', Arial, sans-serif; margin: 40px; color:#111; }
        .container { max-width: 900px; margin: auto; }
        .header { display:flex; justify-content:space-between; margin-bottom: 24px; align-items:flex-start; }
        .logo { height: 70px; }
        .company { text-align:right; font-size: 13px; color:#111; }
        .title { text-align:center; font-size: 26px; margin: 18px 0 22px 0; letter-spacing: 0.4px; }
        .info { display:flex; gap: 16px; margin-bottom: 22px; }
        .card { flex:1; background:#f8f8f8; padding: 14px; border-radius: 10px; font-size: 13px; }
        table { width:100%; border-collapse: collapse; font-size: 13px; }
        th, td { padding: 12px; border-bottom: 1px solid #eee; }
        th { text-align:left; background:#fff; }
        .right { text-align:right; }
        .summary { margin-top: 22px; display:flex; justify-content:space-between; align-items:flex-start; }
        .totals { width: 320px; font-size: 13px; }
        .totals div { display:flex; justify-content:space-between; padding: 4px 0; }
        .total-final { font-weight: 800; border-top: 2px solid #111; padding-top: 10px; margin-top: 6px; }
        .footer { margin-top: 60px; display:flex; justify-content:space-between; align-items:flex-end; font-size: 13px; }
        .signature-line { border-top: 1px solid #111; width: 220px; margin-top: 40px; }
        .muted { color:#555; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logo ? `<img src="${logo}" class="logo" />` : `<div style="height:70px;width:150px;"></div>`}
          <div class="company">
            <div style="font-size:18px;font-weight:800;">${escapeHtml(input.storeName)}</div>
            <div>${escapeHtml(input.storeAddress)}</div>
            ${phoneLine}
            ${gstLine}
          </div>
        </div>

        <div class="title">TAX INVOICE</div>

        <div class="info">
          <div class="card">
            <strong>Customer</strong><br>
            ${escapeHtml(input.buyerName)}<br>
            ${input.buyerPhone ? escapeHtml(input.buyerPhone) : '<span class="muted">—</span>'}
            ${buyerGstinLine}
            ${buyerAddrLine}
          </div>

          ${
            showDelivery
              ? `
                <div class="card">
                  <strong>Delivery Address</strong><br>
                  ${deliveryAddress || '<span class="muted">—</span><br>'}
                  ${input.deliveryPincode ? `Pincode: ${escapeHtml(input.deliveryPincode)}` : ''}
                </div>
              `
              : ''
          }

          <div class="card">
            <strong>Invoice</strong><br>
            ${escapeHtml(input.invoiceNo)}<br>
            ${escapeHtml(input.invoiceDate)}<br>
            POS: ${escapeHtml(input.placeOfSupplyStateCode)}
          </div>
        </div>

        <table>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>HSN</th>
            <th>Qty</th>
            <th class="right">Price</th>
            <th class="right">GST</th>
            <th class="right">Total</th>
          </tr>
          ${rows}
        </table>
        ${stitchingBlock}

        <div class="summary">
          <div>
            ${input.upiQrDataUrl ? `<img src="${input.upiQrDataUrl}" style="width:120px;height:120px;" />` : ''}
            <div style="margin-top:6px;" class="muted">Scan & Pay</div>
            <div class="muted">Amount: ₹${escapeHtml(input.totals.grandTotalRupees)}</div>
          </div>
          <div class="totals">
            <div><span>Subtotal</span><span>₹${escapeHtml(input.totals.subtotalRupees)}</span></div>
            <div><span>Discount</span><span>-₹${escapeHtml(input.totals.discountRupees)}</span></div>
            ${
              input.totals.loyaltyRupees && (input.loyaltyRedeemPoints ?? 0) > 0
                ? `<div><span>Loyalty Points (${escapeHtml(String(input.loyaltyRedeemPoints))} pts)</span><span>-₹${escapeHtml(input.totals.loyaltyRupees)}</span></div>`
                : ''
            }
            <div><span>Taxable</span><span>₹${escapeHtml(input.totals.taxableRupees)}</span></div>
            <div><span>CGST</span><span>₹${escapeHtml(input.totals.cgstRupees)}</span></div>
            <div><span>SGST</span><span>₹${escapeHtml(input.totals.sgstRupees)}</span></div>
            <div><span>IGST</span><span>₹${escapeHtml(input.totals.igstRupees)}</span></div>
            <div class="total-final"><span>Total</span><span>₹${escapeHtml(input.totals.grandTotalRupees)}</span></div>
            ${
              input.totals.couponRupees && input.totals.couponRupees !== '0.00'
                ? `<div><span>Coupon${input.couponCode ? ` (${escapeHtml(input.couponCode)})` : ''}</span><span>-₹${escapeHtml(input.totals.couponRupees)}</span></div>`
                : ''
            }
            ${
              input.totals.payableRupees
                ? `<div class="total-final"><span>Payable</span><span>₹${escapeHtml(input.totals.payableRupees)}</span></div>`
                : ''
            }
            <div class="muted" style="margin-top:10px;">Amount in words: ${escapeHtml(amountWords)}</div>
          </div>
        </div>

        <div class="footer">
          <div>${escapeHtml(input.footerNote?.trim() || 'Thank you for your order')}</div>
          <div style="text-align:right;">
            Authorized Signature
            <div class="signature-line"></div>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

export function renderThermalReceiptHtml(input: {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  gstin?: string;
  footerNote?: string;
  invoiceNo: string;
  invoiceDateIso: string;
  buyerName?: string;
  buyerPhone?: string;
  buyerGstin?: string;
  buyerAddress?: string;
  buyerPincode?: string;
  paymentLine?: string;
  logoDataUrl?: string;
  upiQrDataUrl?: string;
  loyaltyRedeemPoints?: number;
  couponCode?: string;
  stitching?: {
    orderCode: string;
    productName: string;
    productCategory: string;
    materialSource: 'STORE' | 'CUSTOMER';
    materialName?: string;
    materialUsageMeters?: string;
    colorName?: string;
    colorCode: string;
    deliveryDate: string;
    measurements?: Record<string, number>;
  };
  items: Array<{ name: string; qty: string; rateRupees: string; amountRupees: string }>;
  totals: {
    subtotalRupees: string;
    discountRupees: string;
    loyaltyRupees?: string;
    couponRupees?: string;
    payableRupees?: string;
    taxableRupees: string;
    cgstRupees: string;
    sgstRupees: string;
    igstRupees: string;
    grandTotalRupees: string;
  };
}) {
  const logo = input.logoDataUrl ?? tryLoadSutraLogoDataUrl();
  const headerLogo = logo
    ? `<img src="${logo}" style="width:22mm;height:22mm;object-fit:contain;display:block;margin:0 auto 4px auto;" />`
    : '';

  const headerAddress = input.storeAddress ? `<div class="muted center">${escapeHtml(input.storeAddress)}</div>` : '';
  const headerPhone = input.storePhone ? `<div class="muted center">Phone: ${escapeHtml(input.storePhone)}</div>` : '';
  const headerGstin = input.gstin ? `<div class="muted center">GSTIN: ${escapeHtml(input.gstin)}</div>` : '';
  const paymentLine = input.paymentLine ? `<div class="muted">Payment: ${escapeHtml(input.paymentLine)}</div>` : '';
  const customerBlock = input.buyerName
    ? `
      <div class="line"></div>
      <div><strong>Customer</strong></div>
      <div>${escapeHtml(input.buyerName)}</div>
      ${input.buyerPhone ? `<div>${escapeHtml(input.buyerPhone)}</div>` : ''}
      ${input.buyerGstin ? `<div class="muted">GSTIN: ${escapeHtml(input.buyerGstin)}</div>` : ''}
      ${input.buyerAddress ? `<div class="muted">${escapeHtml(input.buyerAddress)}${input.buyerPincode ? ` - ${escapeHtml(input.buyerPincode)}` : ''}</div>` : input.buyerPincode ? `<div class="muted">Pincode: ${escapeHtml(input.buyerPincode)}</div>` : ''}
    `
    : '';

  const items = input.items
    .map(
      (i) => `
      <div class="item">
        <div class="name">${escapeHtml(i.name)}</div>
        <div class="sub">
          <div class="muted">${escapeHtml(i.qty)} x ₹${escapeHtml(i.rateRupees)}</div>
          <div class="amt">₹${escapeHtml(i.amountRupees)}</div>
        </div>
      </div>
    `
    )
    .join('');

  const stitching =
    input.stitching
      ? (() => {
          const st = input.stitching!;
          const materialLabel =
            st.materialSource === 'CUSTOMER'
              ? 'Customer Material'
              : st.materialName
                ? `${escapeHtml(st.materialName)}${st.materialUsageMeters ? ` · ${escapeHtml(st.materialUsageMeters)} m` : ''}`
                : st.materialUsageMeters
                  ? `${escapeHtml(st.materialUsageMeters)} m`
                  : '—';
          const colorLabel = st.colorName?.trim() ? escapeHtml(st.colorName.trim()) : escapeHtml(st.colorCode);
          const colorSwatch = `<span style="display:inline-block;height:10px;width:10px;border-radius:3px;border:1px solid #ddd;background:${escapeHtml(st.colorCode)};vertical-align:middle;"></span>`;
          const meas = st.measurements ?? {};
          const measLines = Object.entries(meas)
            .map(([k, v]) => `<div class="item"><span class="muted">${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`)
            .join('');

          return `
            <div class="line"></div>
            <div><strong>Stitching</strong></div>
            <div class="item"><span>Order</span><span>${escapeHtml(st.orderCode)}</span></div>
            <div class="item"><span>Dress</span><span>${escapeHtml(st.productName)}</span></div>
            <div class="item"><span>Material</span><span>${materialLabel}</span></div>
            <div class="item"><span>Color</span><span style="display:flex;align-items:center;gap:6px;">${colorSwatch}<span>${colorLabel}</span></span></div>
            <div class="item"><span>Delivery</span><span>${escapeHtml(st.deliveryDate)}</span></div>
            ${measLines ? `<div class="muted" style="margin-top:6px;">Measurements</div>${measLines}` : ''}
          `;
        })()
      : '';

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'DejaVu Sans Mono', 'Noto Sans Mono', monospace; width: 280px; margin: auto; font-size: 13px; color: #111; }
          .center { text-align: center; }
          .muted { color:#333; font-size: 12px; }
          .title { font-size: 14px; font-weight: 800; }
          .line { border-top: 1px dashed black; margin: 8px 0; }
          .item { display:flex; justify-content:space-between; }
          .amt { font-weight: 800; }
          .total { font-weight: bold; font-size: 15px; }
          .logo { display:block; margin: 0 auto 6px auto; max-width: 90px; max-height: 36px; width: auto; height: auto; object-fit: contain; filter: grayscale(1) contrast(1.15); }
          .small { font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="center">
          ${logo ? `<img src="${logo}" class="logo" />` : ''}
          <strong>${escapeHtml(input.storeName)}</strong><br>
          ${input.storeAddress ? `${escapeHtml(input.storeAddress)}<br>` : ''}
          ${input.storePhone ? `Phone: ${escapeHtml(input.storePhone)}<br>` : ''}
          ${input.gstin ? `GSTIN: ${escapeHtml(input.gstin)}` : ''}
        </div>

        <div class="line"></div>

        <div>Invoice: ${escapeHtml(input.invoiceNo)}</div>
        <div>Date: ${escapeHtml(input.invoiceDateIso)}</div>
        ${paymentLine}

        ${customerBlock}

        <div class="line"></div>
        ${items}
        ${stitching}

        <div class="line"></div>

        <div class="item"><span>Subtotal</span><span>₹${escapeHtml(input.totals.subtotalRupees)}</span></div>
        <div class="item"><span>Discount</span><span>-₹${escapeHtml(input.totals.discountRupees)}</span></div>
        ${
          input.totals.loyaltyRupees && (input.loyaltyRedeemPoints ?? 0) > 0
            ? `<div class="item"><span>Loyalty Points (${escapeHtml(String(input.loyaltyRedeemPoints))} pts)</span><span>-₹${escapeHtml(input.totals.loyaltyRupees)}</span></div>`
            : ''
        }
        <div class="item"><span>Taxable</span><span>₹${escapeHtml(input.totals.taxableRupees)}</span></div>
        <div class="item"><span>CGST</span><span>₹${escapeHtml(input.totals.cgstRupees)}</span></div>
        <div class="item"><span>SGST</span><span>₹${escapeHtml(input.totals.sgstRupees)}</span></div>
        <div class="item"><span>IGST</span><span>₹${escapeHtml(input.totals.igstRupees)}</span></div>

        <div class="line"></div>

        <div class="item total"><span>Total</span><span>₹${escapeHtml(input.totals.grandTotalRupees)}</span></div>
        ${
          input.totals.couponRupees && input.totals.couponRupees !== '0.00'
            ? `<div class="item"><span>Coupon${input.couponCode ? ` (${escapeHtml(input.couponCode)})` : ''}</span><span>-₹${escapeHtml(input.totals.couponRupees)}</span></div>`
            : ''
        }
        ${input.totals.payableRupees ? `<div class="item total"><span>Payable</span><span>₹${escapeHtml(input.totals.payableRupees)}</span></div>` : ''}

        ${input.upiQrDataUrl ? `
          <div class="line"></div>
          <div class="center small">
            Scan & Pay<br>
            <img src="${input.upiQrDataUrl}" style="width:120px;height:120px;" />
          </div>
        ` : ''}

        <div class="line"></div>

        <div class="center small">${escapeHtml(input.footerNote?.trim() || 'Thank You')}</div>
      </body>
    </html>
  `;
}

export function renderA4ReturnHtml(input: {
  storeName: string;
  storeAddress: string;
  storePhone?: string;
  gstin?: string;
  footerNote?: string;
  returnNo: string;
  returnDate: string;
  originalInvoiceNo: string;
  originalInvoiceDate: string;
  buyerName: string;
  buyerPhone: string;
  isWalkInCustomer?: boolean;
  creditMode: 'LOYALTY' | 'COUPON';
  pointsCredited?: number;
  couponCode?: string | null;
  items: Array<{
    name: string;
    hsn: string;
    qty: string;
    gstRatePercent: string;
    lineTaxableRupees: string;
    lineTaxRupees: string;
    lineTotalRupees: string;
  }>;
  totals: {
    taxableRupees: string;
    cgstRupees: string;
    sgstRupees: string;
    igstRupees: string;
    grandTotalRupees: string;
  };
}) {
  const logo = tryLoadSutraLogoDataUrl();
  const gstLine = input.gstin ? `<div>GSTIN: ${escapeHtml(input.gstin)}</div>` : '';
  const phoneLine = input.storePhone ? `<div>Phone: ${escapeHtml(input.storePhone)}</div>` : '';

  const creditLabel =
    input.creditMode === 'LOYALTY'
      ? `Loyalty Points: ${String(input.pointsCredited ?? 0)} pts`
      : `Coupon: ${escapeHtml(input.couponCode ?? '')}`;

  const rows = input.items
    .map(
      (i, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escapeHtml(i.name)}</td>
        <td>${escapeHtml(i.hsn)}</td>
        <td>${escapeHtml(i.qty)}</td>
        <td class="right">${escapeHtml(i.gstRatePercent)}%</td>
        <td class="right">₹${escapeHtml(i.lineTotalRupees)}</td>
      </tr>
    `
    )
    .join('');

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: 'Noto Sans', 'DejaVu Sans', Arial, sans-serif; margin: 40px; color:#111; }
        .container { max-width: 900px; margin: auto; }
        .header { display:flex; justify-content:space-between; margin-bottom: 24px; align-items:flex-start; }
        .logo { height: 70px; }
        .company { text-align:right; font-size: 13px; color:#111; }
        .title { text-align:center; font-size: 26px; margin: 18px 0 22px 0; letter-spacing: 0.4px; }
        .info { display:flex; gap: 16px; margin-bottom: 22px; }
        .card { flex:1; background:#f8f8f8; padding: 14px; border-radius: 10px; font-size: 13px; }
        table { width:100%; border-collapse: collapse; font-size: 13px; }
        th, td { padding: 12px; border-bottom: 1px solid #eee; }
        th { text-align:left; background:#fff; }
        .right { text-align:right; }
        .summary { margin-top: 22px; display:flex; justify-content:space-between; align-items:flex-start; }
        .totals { width: 320px; font-size: 13px; }
        .totals div { display:flex; justify-content:space-between; padding: 4px 0; }
        .total-final { font-weight: 800; border-top: 2px solid #111; padding-top: 10px; margin-top: 6px; }
        .footer { margin-top: 60px; display:flex; justify-content:space-between; align-items:flex-end; font-size: 13px; }
        .signature-line { border-top: 1px solid #111; width: 220px; margin-top: 40px; }
        .muted { color:#555; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logo ? `<img src="${logo}" class="logo" />` : `<div style="height:70px;width:150px;"></div>`}
          <div class="company">
            <div style="font-size:18px;font-weight:800;">${escapeHtml(input.storeName)}</div>
            <div>${escapeHtml(input.storeAddress)}</div>
            ${phoneLine}
            ${gstLine}
          </div>
        </div>

        <div class="title">RETURN RECEIPT</div>

        <div class="info">
          <div class="card">
            <strong>Customer</strong><br>
            ${escapeHtml(input.buyerName)}<br>
            ${input.buyerPhone ? escapeHtml(input.buyerPhone) : '<span class="muted">—</span>'}
            ${input.isWalkInCustomer ? `<div class="muted" style="margin-top:6px;">Walk-in</div>` : ''}
          </div>

          <div class="card">
            <strong>Original Invoice</strong><br>
            ${escapeHtml(input.originalInvoiceNo)}<br>
            ${escapeHtml(input.originalInvoiceDate)}
          </div>

          <div class="card">
            <strong>Return</strong><br>
            ${escapeHtml(input.returnNo)}<br>
            ${escapeHtml(input.returnDate)}<br>
            ${creditLabel}
          </div>
        </div>

        <table>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>HSN</th>
            <th>Qty</th>
            <th class="right">GST</th>
            <th class="right">Total</th>
          </tr>
          ${rows}
        </table>

        <div class="summary">
          <div>
            <div class="muted">Return Amount: ₹${escapeHtml(input.totals.grandTotalRupees)}</div>
          </div>
          <div class="totals">
            <div><span>Taxable</span><span>₹${escapeHtml(input.totals.taxableRupees)}</span></div>
            <div><span>CGST</span><span>₹${escapeHtml(input.totals.cgstRupees)}</span></div>
            <div><span>SGST</span><span>₹${escapeHtml(input.totals.sgstRupees)}</span></div>
            <div><span>IGST</span><span>₹${escapeHtml(input.totals.igstRupees)}</span></div>
            <div class="total-final"><span>Return Amount</span><span>₹${escapeHtml(input.totals.grandTotalRupees)}</span></div>
          </div>
        </div>

        <div class="footer">
          <div>${escapeHtml(input.footerNote?.trim() || 'Thank you')}</div>
          <div style="text-align:right;">
            Authorized Signature
            <div class="signature-line"></div>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

export function renderThermalReturnReceiptHtml(input: {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  gstin?: string;
  footerNote?: string;
  returnNo: string;
  returnDateIso: string;
  originalInvoiceNo: string;
  buyerName?: string;
  buyerPhone?: string;
  creditLine?: string;
  items: Array<{ name: string; qty: string; amountRupees: string }>;
  totals: { taxableRupees: string; cgstRupees: string; sgstRupees: string; igstRupees: string; grandTotalRupees: string };
}) {
  const logo = tryLoadSutraLogoDataUrl();
  const paymentLine = input.creditLine ? `<div class="muted">${escapeHtml(input.creditLine)}</div>` : '';
  const customerBlock = input.buyerName
    ? `
      <div class="line"></div>
      <div><strong>Customer</strong></div>
      <div>${escapeHtml(input.buyerName)}</div>
      ${input.buyerPhone ? `<div>${escapeHtml(input.buyerPhone)}</div>` : ''}
    `
    : '';

  const items = input.items
    .map(
      (i) => `
      <div class="item">
        <div class="name">${escapeHtml(i.name)}</div>
        <div class="sub">
          <div class="muted">${escapeHtml(i.qty)}</div>
          <div class="amt">₹${escapeHtml(i.amountRupees)}</div>
        </div>
      </div>
    `
    )
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'DejaVu Sans Mono', 'Noto Sans Mono', monospace; width: 280px; margin: auto; font-size: 13px; color: #111; }
          .center { text-align: center; }
          .muted { color:#333; font-size: 12px; }
          .line { border-top: 1px dashed black; margin: 8px 0; }
          .item { display:flex; justify-content:space-between; }
          .amt { font-weight: 800; }
          .total { font-weight: bold; font-size: 15px; }
          .logo { display:block; margin: 0 auto 6px auto; max-width: 90px; max-height: 36px; width: auto; height: auto; object-fit: contain; filter: grayscale(1) contrast(1.15); }
          .small { font-size: 12px; }
          .name { max-width: 160px; }
          .sub { display:flex; gap:10px; justify-content:space-between; width: 100%; }
        </style>
      </head>
      <body>
        <div class="center">
          ${logo ? `<img src="${logo}" class="logo" />` : ''}
          <strong>${escapeHtml(input.storeName)}</strong><br>
          ${input.storeAddress ? `${escapeHtml(input.storeAddress)}<br>` : ''}
          ${input.storePhone ? `Phone: ${escapeHtml(input.storePhone)}<br>` : ''}
          ${input.gstin ? `GSTIN: ${escapeHtml(input.gstin)}` : ''}
        </div>

        <div class="line"></div>

        <div><strong>RETURN RECEIPT</strong></div>
        <div>Return: ${escapeHtml(input.returnNo)}</div>
        <div>Date: ${escapeHtml(input.returnDateIso)}</div>
        <div>Invoice: ${escapeHtml(input.originalInvoiceNo)}</div>
        ${paymentLine}

        ${customerBlock}

        <div class="line"></div>
        ${items}

        <div class="line"></div>

        <div class="item"><span>Taxable</span><span>₹${escapeHtml(input.totals.taxableRupees)}</span></div>
        <div class="item"><span>CGST</span><span>₹${escapeHtml(input.totals.cgstRupees)}</span></div>
        <div class="item"><span>SGST</span><span>₹${escapeHtml(input.totals.sgstRupees)}</span></div>
        <div class="item"><span>IGST</span><span>₹${escapeHtml(input.totals.igstRupees)}</span></div>

        <div class="line"></div>

        <div class="item total"><span>Return Amt</span><span>₹${escapeHtml(input.totals.grandTotalRupees)}</span></div>

        <div class="line"></div>

        <div class="center small">${escapeHtml(input.footerNote?.trim() || 'Thank You')}</div>
      </body>
    </html>
  `;
}

export function renderA4CreditReceiptHtml(input: {
  storeName: string;
  storeAddress: string;
  storePhone?: string;
  gstin?: string;
  footerNote?: string;
  receiptNo: string;
  receiptDate: string;
  customerName: string;
  customerPhone: string;
  customerGstin?: string | null;
  customerAddress?: string | null;
  customerStateCode?: string | null;
  amountRupees: string;
  paymentMethod: string;
  paymentRef?: string | null;
}) {
  const logo = tryLoadSutraLogoDataUrl();
  const gstinLine = input.gstin ? `<div>GSTIN: ${escapeHtml(input.gstin)}</div>` : '';
  const phoneLine = input.storePhone ? `<div>Phone: ${escapeHtml(input.storePhone)}</div>` : '';
  const custGstin = input.customerGstin ? `<div>GSTIN: ${escapeHtml(input.customerGstin)}</div>` : '';
  const custState = input.customerStateCode ? `<div>State: ${escapeHtml(input.customerStateCode)}</div>` : '';
  const custAddr = input.customerAddress ? `<div>${escapeHtml(input.customerAddress)}</div>` : '';

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: 'Noto Sans', 'DejaVu Sans', Arial, sans-serif; margin: 40px; color:#111; }
        .container { max-width: 900px; margin: auto; }
        .header { display:flex; justify-content:space-between; margin-bottom: 24px; align-items:flex-start; }
        .logo { height: 70px; }
        .company { text-align:right; font-size: 13px; color:#111; }
        .title { text-align:center; font-size: 26px; margin: 18px 0 22px 0; letter-spacing: 0.4px; }
        .info { display:flex; gap: 16px; margin-bottom: 22px; }
        .card { flex:1; background:#f8f8f8; padding: 14px; border-radius: 10px; font-size: 13px; }
        .summary { margin-top: 22px; display:flex; justify-content:flex-end; }
        .totals { width: 360px; font-size: 13px; }
        .totals div { display:flex; justify-content:space-between; padding: 4px 0; }
        .total-final { font-weight: 800; border-top: 2px solid #111; padding-top: 10px; margin-top: 6px; }
        .muted { color:#555; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logo ? `<img src="${logo}" class="logo" />` : `<div style="height:70px;width:150px;"></div>`}
          <div class="company">
            <div style="font-size:18px;font-weight:800;">${escapeHtml(input.storeName)}</div>
            <div>${escapeHtml(input.storeAddress)}</div>
            ${phoneLine}
            ${gstinLine}
          </div>
        </div>

        <div class="title">CREDIT RECEIPT</div>

        <div class="info">
          <div class="card">
            <strong>Customer</strong><br>
            ${escapeHtml(input.customerName)}<br>
            ${escapeHtml(input.customerPhone)}<br>
            ${custGstin}
            ${custState}
            ${custAddr}
          </div>
          <div class="card">
            <strong>Receipt</strong><br>
            ${escapeHtml(input.receiptNo)}<br>
            ${escapeHtml(input.receiptDate)}
          </div>
          <div class="card">
            <strong>Payment</strong><br>
            ${escapeHtml(input.paymentMethod)}${input.paymentRef ? ` (${escapeHtml(input.paymentRef)})` : ''}<br>
            <span class="muted">No GST applied</span>
          </div>
        </div>

        <div class="summary">
          <div class="totals">
            <div><span>Amount</span><span>₹${escapeHtml(input.amountRupees)}</span></div>
            <div class="total-final"><span>Credit Added</span><span>₹${escapeHtml(input.amountRupees)}</span></div>
          </div>
        </div>

        <div class="muted" style="margin-top: 60px; text-align:center;">
          ${escapeHtml(input.footerNote?.trim() || 'Thank You')}
        </div>
      </div>
    </body>
  </html>
  `;
}

export function renderA4CreditSettlementHtml(input: {
  storeName: string;
  storeAddress: string;
  storePhone?: string;
  gstin?: string;
  footerNote?: string;
  referenceNo: string;
  settlementDate: string;
  customerName: string;
  customerPhone: string;
  amountRupees: string;
  paymentMethod: string;
  paymentRef?: string | null;
}) {
  const logo = tryLoadSutraLogoDataUrl();
  const gstinLine = input.gstin ? `<div>GSTIN: ${escapeHtml(input.gstin)}</div>` : '';
  const phoneLine = input.storePhone ? `<div>Phone: ${escapeHtml(input.storePhone)}</div>` : '';

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: 'Noto Sans', 'DejaVu Sans', Arial, sans-serif; margin: 40px; color:#111; }
        .container { max-width: 900px; margin: auto; }
        .header { display:flex; justify-content:space-between; margin-bottom: 24px; align-items:flex-start; }
        .logo { height: 70px; }
        .company { text-align:right; font-size: 13px; color:#111; }
        .title { text-align:center; font-size: 26px; margin: 18px 0 22px 0; letter-spacing: 0.4px; }
        .info { display:flex; gap: 16px; margin-bottom: 22px; }
        .card { flex:1; background:#f8f8f8; padding: 14px; border-radius: 10px; font-size: 13px; }
        .summary { margin-top: 22px; display:flex; justify-content:flex-end; }
        .totals { width: 360px; font-size: 13px; }
        .totals div { display:flex; justify-content:space-between; padding: 4px 0; }
        .total-final { font-weight: 800; border-top: 2px solid #111; padding-top: 10px; margin-top: 6px; }
        .muted { color:#555; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logo ? `<img src="${logo}" class="logo" />` : `<div style="height:70px;width:150px;"></div>`}
          <div class="company">
            <div style="font-size:18px;font-weight:800;">${escapeHtml(input.storeName)}</div>
            <div>${escapeHtml(input.storeAddress)}</div>
            ${phoneLine}
            ${gstinLine}
          </div>
        </div>

        <div class="title">DUE SETTLEMENT RECEIPT</div>

        <div class="info">
          <div class="card">
            <strong>Customer</strong><br>
            ${escapeHtml(input.customerName)}<br>
            ${escapeHtml(input.customerPhone)}<br>
          </div>
          <div class="card">
            <strong>Settlement</strong><br>
            ${escapeHtml(input.referenceNo)}<br>
            ${escapeHtml(input.settlementDate)}
          </div>
          <div class="card">
            <strong>Payment</strong><br>
            ${escapeHtml(input.paymentMethod)}${input.paymentRef ? ` (${escapeHtml(input.paymentRef)})` : ''}<br>
            <span class="muted">No GST applied</span>
          </div>
        </div>

        <div class="summary">
          <div class="totals">
            <div><span>Amount</span><span>₹${escapeHtml(input.amountRupees)}</span></div>
            <div class="total-final"><span>Due Settled</span><span>₹${escapeHtml(input.amountRupees)}</span></div>
          </div>
        </div>

        <div class="muted" style="margin-top: 60px; text-align:center;">
          ${escapeHtml(input.footerNote?.trim() || 'Thank You')}
        </div>
      </div>
    </body>
  </html>
  `;
}

export function renderThermalCreditReceiptHtml(input: {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  gstin?: string;
  footerNote?: string;
  receiptNo: string;
  receiptDateIso: string;
  customerName: string;
  customerPhone: string;
  amountRupees: string;
  paymentLine: string;
}) {
  const logo = tryLoadSutraLogoDataUrl();
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'DejaVu Sans Mono', 'Noto Sans Mono', monospace; width: 280px; margin: auto; font-size: 13px; color: #111; }
          .center { text-align: center; }
          .muted { color:#333; font-size: 12px; }
          .line { border-top: 1px dashed black; margin: 8px 0; }
          .row { display:flex; justify-content:space-between; }
          .total { font-weight: bold; font-size: 15px; }
          .logo { display:block; margin: 0 auto 6px auto; max-width: 90px; max-height: 36px; width: auto; height: auto; object-fit: contain; filter: grayscale(1) contrast(1.15); }
        </style>
      </head>
      <body>
        <div class="center">
          ${logo ? `<img src="${logo}" class="logo" />` : ''}
          <strong>${escapeHtml(input.storeName)}</strong><br>
          ${input.storeAddress ? `${escapeHtml(input.storeAddress)}<br>` : ''}
          ${input.storePhone ? `Phone: ${escapeHtml(input.storePhone)}<br>` : ''}
          ${input.gstin ? `GSTIN: ${escapeHtml(input.gstin)}` : ''}
        </div>

        <div class="line"></div>

        <div><strong>CREDIT RECEIPT</strong></div>
        <div>Receipt: ${escapeHtml(input.receiptNo)}</div>
        <div>Date: ${escapeHtml(input.receiptDateIso)}</div>
        <div class="muted">No GST applied</div>

        <div class="line"></div>

        <div><strong>Customer</strong></div>
        <div>${escapeHtml(input.customerName)}</div>
        <div>${escapeHtml(input.customerPhone)}</div>

        <div class="line"></div>

        <div class="row"><span>Payment</span><span>${escapeHtml(input.paymentLine)}</span></div>
        <div class="row total"><span>Amount</span><span>₹${escapeHtml(input.amountRupees)}</span></div>

        <div class="line"></div>

        <div class="center muted">${escapeHtml(input.footerNote?.trim() || 'Thank You')}</div>
      </body>
    </html>
  `;
}

export function renderThermalCreditSettlementHtml(input: {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  gstin?: string;
  footerNote?: string;
  referenceNo: string;
  settlementDateIso: string;
  customerName: string;
  customerPhone: string;
  amountRupees: string;
  paymentLine: string;
}) {
  const logo = tryLoadSutraLogoDataUrl();
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'DejaVu Sans Mono', 'Noto Sans Mono', monospace; width: 280px; margin: auto; font-size: 13px; color: #111; }
          .center { text-align: center; }
          .muted { color:#333; font-size: 12px; }
          .line { border-top: 1px dashed black; margin: 8px 0; }
          .row { display:flex; justify-content:space-between; }
          .total { font-weight: bold; font-size: 15px; }
          .logo { display:block; margin: 0 auto 6px auto; max-width: 90px; max-height: 36px; width: auto; height: auto; object-fit: contain; filter: grayscale(1) contrast(1.15); }
        </style>
      </head>
      <body>
        <div class="center">
          ${logo ? `<img src="${logo}" class="logo" />` : ''}
          <strong>${escapeHtml(input.storeName)}</strong><br>
          ${input.storeAddress ? `${escapeHtml(input.storeAddress)}<br>` : ''}
          ${input.storePhone ? `Phone: ${escapeHtml(input.storePhone)}<br>` : ''}
          ${input.gstin ? `GSTIN: ${escapeHtml(input.gstin)}` : ''}
        </div>

        <div class="line"></div>

        <div><strong>DUE SETTLEMENT RECEIPT</strong></div>
        <div>Ref: ${escapeHtml(input.referenceNo)}</div>
        <div>Date: ${escapeHtml(input.settlementDateIso)}</div>
        <div class="muted">No GST applied</div>

        <div class="line"></div>

        <div><strong>Customer</strong></div>
        <div>${escapeHtml(input.customerName)}</div>
        <div>${escapeHtml(input.customerPhone)}</div>

        <div class="line"></div>

        <div class="row"><span>Payment</span><span>${escapeHtml(input.paymentLine)}</span></div>
        <div class="row total"><span>Amount</span><span>₹${escapeHtml(input.amountRupees)}</span></div>

        <div class="line"></div>

        <div class="center muted">${escapeHtml(input.footerNote?.trim() || 'Thank You')}</div>
      </body>
    </html>
  `;
}

function escapeHtml(v: string) {
  return v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function amountInWordsINR(amount: string) {
  const m = amount.trim().match(/^(-?\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return 'INR';
  const neg = m[1].startsWith('-');
  const rupees = parseInt(m[1].replace('-', ''), 10);
  const paise = parseInt((m[2] ?? '0').padEnd(2, '0'), 10);

  const words = numberToWordsIndian(rupees);
  const paiseWords = paise ? `${numberToWordsIndian(paise)} Paise` : '';

  const core = `${words} Rupees${paiseWords ? ` and ${paiseWords}` : ''} Only`;
  return neg ? `Minus ${core}` : core;
}

function numberToWordsIndian(n: number) {
  if (!Number.isFinite(n) || n < 0) return 'Zero';
  if (n === 0) return 'Zero';

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (x: number) => {
    if (x === 0) return '';
    if (x < 20) return ones[x];
    const t = Math.floor(x / 10);
    const o = x % 10;
    return `${tens[t]}${o ? ` ${ones[o]}` : ''}`;
  };

  const threeDigits = (x: number) => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    const hPart = h ? `${ones[h]} Hundred` : '';
    const rPart = twoDigits(r);
    if (hPart && rPart) return `${hPart} ${rPart}`;
    return `${hPart}${rPart ? (hPart ? ' ' : '') + rPart : ''}`.trim();
  };

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
