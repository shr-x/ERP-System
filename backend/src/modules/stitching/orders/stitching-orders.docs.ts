import { tryLoadSutraLogoDataUrl } from '../../printing/printing.templates';

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderStitchingCustomerBillA4(input: {
  storeName: string;
  gstin?: string;
  storePhone?: string;
  storeAddress?: string;
  orderCode: string;
  invoiceNo?: string;
  customerName: string;
  customerPhone?: string;
  productName: string;
  productCategory: string;
  materialSource: 'STORE' | 'CUSTOMER';
  materialName?: string;
  materialUsageMeters?: string;
  colorName?: string;
  colorCode: string;
  imageUrl?: string;
  deliveryDate: string;
  measurements: Record<string, number>;
  priceRupees: string;
  gstRupees: string;
  totalRupees: string;
}) {
  const logo = tryLoadSutraLogoDataUrl();
  const rows = Object.entries(input.measurements)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td style="text-align:right;">${escapeHtml(String(v))}</td></tr>`)
    .join('');

  const img = input.imageUrl
    ? `
      <div style="position:relative;width:220px;border-radius:12px;border:1px solid #eee;overflow:hidden;">
        <img src="${escapeHtml(input.imageUrl)}" style="width:100%;height:auto;display:block;" />
        <div style="position:absolute;left:0;right:0;bottom:0;background:rgba(220,220,220,0.7);color:#000;font-size:11px;padding:6px 8px;text-align:center;">
          Colour is mentioned above and this image is just for reference
        </div>
      </div>
    `
    : '';

  const materialLabel =
    input.materialSource === 'CUSTOMER'
      ? 'Customer Material'
      : input.materialName
        ? `${escapeHtml(input.materialName)}${input.materialUsageMeters ? ` · ${escapeHtml(input.materialUsageMeters)} m` : ''}`
        : input.materialUsageMeters
          ? `${escapeHtml(input.materialUsageMeters)} m`
          : '—';

  const colorLabel = input.colorName?.trim() ? escapeHtml(input.colorName.trim()) : escapeHtml(input.colorCode);
  const colorSwatch = `<span style="display:inline-block;height:12px;width:12px;border-radius:4px;border:1px solid #ddd;background:${escapeHtml(input.colorCode)};"></span>`;

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color:#111; }
        .header { display:flex; justify-content:space-between; align-items:flex-start; gap: 16px; }
        .title { font-size: 22px; font-weight: 800; margin: 18px 0 8px 0; }
        .muted { color:#555; font-size: 12px; }
        .card { background:#f8f8f8; padding: 14px; border-radius: 12px; }
        table { width:100%; border-collapse: collapse; font-size: 13px; }
        th, td { padding: 10px; border-bottom: 1px solid #eee; }
        th { text-align:left; background:#fff; }
        .kv td { border-bottom: 1px solid #eee; }
        .kv td:first-child { width: 140px; color:#333; font-weight: 700; }
        .kv td:last-child { color:#111; }
        .grid { display:grid; grid-template-columns: 1fr 260px; gap: 16px; margin-top: 14px; }
        .amounts { margin-top: 12px; font-size: 13px; }
        .amounts div { display:flex; justify-content:space-between; padding: 4px 0; }
        .total { font-weight: 800; border-top: 2px solid #111; padding-top: 8px; margin-top: 6px; }
      </style>
    </head>
    <body>
      <div class="header">
        ${logo ? `<img src="${logo}" style="height:54px;" />` : `<div style="height:54px;width:120px;"></div>`}
        <div style="text-align:right;">
          <div style="font-weight:800;">${escapeHtml(input.storeName)}</div>
          ${input.gstin ? `<div class="muted">GSTIN: ${escapeHtml(input.gstin)}</div>` : ''}
          ${input.storePhone ? `<div class="muted">Phone: ${escapeHtml(input.storePhone)}</div>` : ''}
          ${input.storeAddress ? `<div class="muted">${escapeHtml(input.storeAddress)}</div>` : ''}
          <div class="muted">Stitching Bill</div>
        </div>
      </div>

      <div class="title">Order ${escapeHtml(input.orderCode)}</div>
      <div class="muted">${input.invoiceNo ? `Invoice: ${escapeHtml(input.invoiceNo)} · ` : ''}Delivery: ${escapeHtml(input.deliveryDate)}</div>

      <div class="grid">
        <div class="card">
          <div style="font-weight:800;margin-bottom:8px;">Customer</div>
          <div>${escapeHtml(input.customerName)}</div>
          <div class="muted">${input.customerPhone ? escapeHtml(input.customerPhone) : '—'}</div>

          <div style="height:12px;"></div>
          <div style="font-weight:800;margin-bottom:8px;">Order Details</div>
          <table class="kv">
            <tr>
              <td>Dress</td>
              <td>${escapeHtml(input.productName)} <span class="muted">· ${escapeHtml(input.productCategory)}</span></td>
            </tr>
            <tr>
              <td>Material</td>
              <td>${materialLabel}</td>
            </tr>
            <tr>
              <td>Color</td>
              <td style="display:flex;align-items:center;gap:8px;">
                ${colorSwatch}
                <span>${colorLabel}</span>
                <span class="muted">${escapeHtml(input.colorCode)}</span>
              </td>
            </tr>
          </table>

          <div style="height:12px;"></div>
          <div style="font-weight:800;margin-bottom:8px;">Measurements</div>
          <table>
            <tr><th>Field</th><th style="text-align:right;">Value</th></tr>
            ${rows}
          </table>

          <div class="amounts">
            <div><span>Price</span><span>₹${escapeHtml(input.priceRupees)}</span></div>
            <div><span>GST</span><span>₹${escapeHtml(input.gstRupees)}</span></div>
            <div class="total"><span>Total</span><span>₹${escapeHtml(input.totalRupees)}</span></div>
          </div>
        </div>

        <div>
          ${img}
        </div>
      </div>
    </body>
  </html>
  `;
}

export function renderStitchingCustomerBillThermal(input: {
  storeName: string;
  gstin?: string;
  orderCode: string;
  invoiceNo?: string;
  customerName: string;
  customerPhone?: string;
  productName: string;
  materialSource: 'STORE' | 'CUSTOMER';
  materialName?: string;
  materialUsageMeters?: string;
  colorName?: string;
  colorCode: string;
  deliveryDate: string;
  priceRupees: string;
  gstRupees: string;
  totalRupees: string;
}) {
  const materialLabel =
    input.materialSource === 'CUSTOMER'
      ? 'Customer Material'
      : input.materialName
        ? `${escapeHtml(input.materialName)}${input.materialUsageMeters ? ` · ${escapeHtml(input.materialUsageMeters)} m` : ''}`
        : input.materialUsageMeters
          ? `${escapeHtml(input.materialUsageMeters)} m`
          : '—';

  const colorLabel = input.colorName?.trim() ? escapeHtml(input.colorName.trim()) : escapeHtml(input.colorCode);
  const colorSwatch = `<span style="display:inline-block;height:10px;width:10px;border-radius:3px;border:1px solid #ddd;background:${escapeHtml(input.colorCode)};"></span>`;

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { width: 80mm; font-family: Arial, sans-serif; margin: 0; padding: 8px; color:#111; }
        .title { font-weight: 800; font-size: 16px; }
        .muted { color:#555; font-size: 12px; }
        .row { display:flex; justify-content:space-between; margin-top: 4px; }
        .box { border-top: 1px dashed #999; margin-top: 10px; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="title">${escapeHtml(input.storeName)}</div>
      ${input.gstin ? `<div class="muted">GSTIN: ${escapeHtml(input.gstin)}</div>` : ''}
      <div class="muted">Stitching Bill</div>
      <div class="box">
        <div class="row"><span>Order</span><span>${escapeHtml(input.orderCode)}</span></div>
        ${input.invoiceNo ? `<div class="row"><span>Invoice</span><span>${escapeHtml(input.invoiceNo)}</span></div>` : ''}
        <div class="row"><span>Delivery</span><span>${escapeHtml(input.deliveryDate)}</span></div>
      </div>
      <div class="box">
        <div style="font-weight:700;margin-bottom:6px;">Customer</div>
        <div>${escapeHtml(input.customerName)}</div>
        <div class="muted">${input.customerPhone ? escapeHtml(input.customerPhone) : '—'}</div>
      </div>
      <div class="box">
        <div style="font-weight:700;margin-bottom:6px;">Order Details</div>
        <div class="row"><span>Dress</span><span>${escapeHtml(input.productName)}</span></div>
        <div class="row"><span>Material</span><span>${materialLabel}</span></div>
        <div class="row" style="align-items:center;gap:8px;"><span>Color</span><span style="display:flex;align-items:center;gap:6px;">${colorSwatch}<span>${colorLabel}</span></span></div>
      </div>
      <div class="box">
        <div class="row"><span>Price</span><span>₹${escapeHtml(input.priceRupees)}</span></div>
        <div class="row"><span>GST</span><span>₹${escapeHtml(input.gstRupees)}</span></div>
        <div class="row" style="font-weight:800;"><span>Total</span><span>₹${escapeHtml(input.totalRupees)}</span></div>
      </div>
    </body>
  </html>
  `;
}

export function renderStitchingTailorSlipA4(input: {
  storeName: string;
  gstin?: string;
  storePhone?: string;
  storeAddress?: string;
  orderCode: string;
  productName: string;
  productCategory: string;
  materialSource: 'STORE' | 'CUSTOMER';
  materialName?: string;
  colorName?: string;
  colorCode: string;
  imageUrl?: string;
  deliveryDate: string;
  measurements: Record<string, number>;
  materialUsageMeters?: string;
}) {
  const logo = tryLoadSutraLogoDataUrl();
  const rows = Object.entries(input.measurements)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td style="text-align:right;">${escapeHtml(String(v))}</td></tr>`)
    .join('');
  const img = input.imageUrl
    ? `
      <div style="position:relative;width:240px;border-radius:12px;border:1px solid #eee;overflow:hidden;">
        <img src="${escapeHtml(input.imageUrl)}" style="width:100%;height:auto;display:block;" />
        <div style="position:absolute;left:0;right:0;bottom:0;background:rgba(220,220,220,0.7);color:#000;font-size:11px;padding:6px 8px;text-align:center;">
          Colour is mentioned above and this image is just for reference
        </div>
      </div>
    `
    : '';
  const material =
    input.materialSource === 'CUSTOMER'
      ? 'Customer Material'
      : input.materialName
        ? `${escapeHtml(input.materialName)}${input.materialUsageMeters ? ` · ${escapeHtml(input.materialUsageMeters)} m` : ''}`
        : input.materialUsageMeters
          ? `${escapeHtml(input.materialUsageMeters)} m`
          : '—';

  const colorLabel = input.colorName?.trim() ? escapeHtml(input.colorName.trim()) : escapeHtml(input.colorCode);
  const colorSwatch = `<span style="display:inline-block;height:12px;width:12px;border-radius:4px;border:1px solid #ddd;background:${escapeHtml(input.colorCode)};vertical-align:middle;"></span>`;

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color:#111; }
        .header { display:flex; justify-content:space-between; align-items:flex-start; gap: 16px; }
        .title { font-size: 22px; font-weight: 800; margin: 18px 0 8px 0; }
        .muted { color:#555; font-size: 12px; }
        .card { background:#f8f8f8; padding: 14px; border-radius: 12px; }
        table { width:100%; border-collapse: collapse; font-size: 13px; }
        th, td { padding: 10px; border-bottom: 1px solid #eee; }
        th { text-align:left; background:#fff; }
        .grid { display:grid; grid-template-columns: 1fr 260px; gap: 16px; margin-top: 14px; }
      </style>
    </head>
    <body>
      <div class="header">
        ${logo ? `<img src="${logo}" style="height:54px;" />` : `<div style="height:54px;width:120px;"></div>`}
        <div style="text-align:right;">
          <div style="font-weight:800;">${escapeHtml(input.storeName)}</div>
          ${input.gstin ? `<div class="muted">GSTIN: ${escapeHtml(input.gstin)}</div>` : ''}
          ${input.storePhone ? `<div class="muted">Phone: ${escapeHtml(input.storePhone)}</div>` : ''}
          ${input.storeAddress ? `<div class="muted">${escapeHtml(input.storeAddress)}</div>` : ''}
          <div class="muted">Tailor Slip</div>
        </div>
      </div>

      <div class="title">Order ${escapeHtml(input.orderCode)}</div>
      <div style="font-weight:800;font-size:13px;">${escapeHtml(input.productName)} · ${escapeHtml(input.productCategory)} · ${colorSwatch} ${colorLabel} <span style="font-weight:800;">(${escapeHtml(input.colorCode)})</span></div>
      <div style="font-weight:800;font-size:13px;">Delivery: ${escapeHtml(input.deliveryDate)} · Material: ${material}</div>

      <div class="grid">
        <div class="card">
          <div style="font-weight:800;margin-bottom:8px;">Measurements</div>
          <table>
            <tr><th>Field</th><th style="text-align:right;">Value</th></tr>
            ${rows}
          </table>
        </div>
        <div>
          ${img}
        </div>
      </div>
    </body>
  </html>
  `;
}

export function renderStitchingTailorSlipThermal(input: {
  storeName: string;
  gstin?: string;
  orderCode: string;
  productName: string;
  materialSource: 'STORE' | 'CUSTOMER';
  materialName?: string;
  colorName?: string;
  colorCode: string;
  imageUrl?: string;
  deliveryDate: string;
  measurements: Record<string, number>;
  materialUsageMeters?: string;
}) {
  const rows = Object.entries(input.measurements)
    .map(([k, v]) => `<div style="display:flex;justify-content:space-between;"><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`)
    .join('');

  const img = input.imageUrl
    ? `
      <div style="position:relative;width:100%;border-radius:10px;border:1px solid #eee;overflow:hidden;margin:8px 0;">
        <img src="${escapeHtml(input.imageUrl)}" style="width:100%;height:auto;display:block;" />
        <div style="position:absolute;left:0;right:0;bottom:0;background:rgba(220,220,220,0.7);color:#000;font-size:11px;padding:6px 8px;text-align:center;">
          Colour is mentioned above and this image is just for reference
        </div>
      </div>
    `
    : '';

  const material =
    input.materialSource === 'CUSTOMER'
      ? `<div>Material: Customer Material</div>`
      : input.materialName
        ? `<div>Material: ${escapeHtml(input.materialName)}${input.materialUsageMeters ? ` · ${escapeHtml(input.materialUsageMeters)} m` : ''}</div>`
        : input.materialUsageMeters
          ? `<div>Material: ${escapeHtml(input.materialUsageMeters)} m</div>`
          : '';

  const colorLabel = input.colorName?.trim() ? escapeHtml(input.colorName.trim()) : escapeHtml(input.colorCode);
  const colorSwatch = `<span style="display:inline-block;height:10px;width:10px;border-radius:3px;border:1px solid #ddd;background:${escapeHtml(input.colorCode)};vertical-align:middle;"></span>`;

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { width: 80mm; font-family: Arial, sans-serif; margin: 0; padding: 8px; color:#111; }
        .title { font-weight: 800; font-size: 16px; }
        .muted { color:#555; font-size: 12px; }
        .box { border-top: 1px dashed #999; margin-top: 10px; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="title">${escapeHtml(input.storeName)}</div>
      ${input.gstin ? `<div class="muted">GSTIN: ${escapeHtml(input.gstin)}</div>` : ''}
      <div class="title">ORDER ${escapeHtml(input.orderCode)}</div>
      <div style="font-weight:800;font-size:12px;">${escapeHtml(input.productName)} · ${colorSwatch} ${colorLabel} <span style="font-weight:800;">(${escapeHtml(input.colorCode)})</span></div>
      <div style="font-weight:800;font-size:12px;">Delivery: ${escapeHtml(input.deliveryDate)}</div>
      ${img}
      <div class="box">
        <div style="font-weight:700;margin-bottom:6px;">Measurements</div>
        ${rows || '<div class="muted">—</div>'}
      </div>
      <div class="box">
        ${material || '<div class="muted">Material: —</div>'}
      </div>
    </body>
  </html>
  `;
}
