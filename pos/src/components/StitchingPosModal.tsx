import { useEffect, useMemo, useState } from 'react';
import { apiBaseUrl, apiFetch } from '../lib/api';
import { StBadge, StButton, StInput, StLabel, StSelect } from './stitching/AdminUi';

type TemplateCategory = 'FULL_SET' | 'TOP' | 'PANTS' | 'SLEEVES';
type MeasurementProfile = { id: string; measurementName: string; fields: string[] };
type Color = { id: string; colorName: string; colorCode: string; imageUrl?: string | null };
type MaterialConfig = { id: string; erpMaterialId: string; metersRequired: string };
type Template = {
  id: string;
  name: string;
  category: TemplateCategory;
  measurementProfiles: MeasurementProfile[];
  colors: Color[];
  materialConfigs: MaterialConfig[];
};

type Tailor = { id: string; name: string; phone: string };
type MaterialRow = { id: string; name: string; code: string; qtyAvailableMeters: string; imageUrl?: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  billCustomer: { id: string; fullName: string; phone?: string | null } | null;
  billCustomerPhone: string;
  onCreated: (input: { stitchingOrderId: string; stitchingOrderCode: string; tailorPhone?: string; stitchingServiceProductId: string; unitPriceRupees: number }) => void;
};

function errorMessage(e: unknown, fallback: string) {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}

function resolveImageUrl(url?: string | null) {
  const u = (url || '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/')) return `${apiBaseUrl()}${u}`;
  return u;
}

export function StitchingPosModal({ open, onClose, onCreated, billCustomer, billCustomerPhone }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tailors, setTailors] = useState<Tailor[]>([]);
  const [templateId, setTemplateId] = useState('');
  const template = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId]);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  const [materialSource, setMaterialSource] = useState<'STORE' | 'CUSTOMER'>('STORE');
  const [colorCode, setColorCode] = useState('#000000');
  const selectedTemplateColor = useMemo(
    () => (template?.colors || []).find((c) => c.colorCode === colorCode) || null,
    [template, colorCode]
  );
  const [selectedColorName, setSelectedColorName] = useState('Custom');
  const [sizeName, setSizeName] = useState('');
  const sizeProfile = useMemo(
    () => template?.measurementProfiles.find((p) => p.measurementName === sizeName) || null,
    [template, sizeName]
  );

  const [measurements, setMeasurements] = useState<Record<string, string>>({});

  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerLabel, setSelectedCustomerLabel] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [priceRupees, setPriceRupees] = useState('');

  const [tailorId, setTailorId] = useState('');
  const [tailorCostRupees, setTailorCostRupees] = useState('');
  const [gstOnTailor, setGstOnTailor] = useState(false);
  const [tailorGstRatePercent, setTailorGstRatePercent] = useState('0');

  const [materialConfigId, setMaterialConfigId] = useState('');
  const materialConfig = useMemo(
    () => template?.materialConfigs.find((m) => m.id === materialConfigId) || null,
    [template, materialConfigId]
  );
  const [materialUsageMeters, setMaterialUsageMeters] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
  const autoTemplateImageUrl = useMemo(() => {
    const bySelected = (template?.colors || []).find((c) => c.colorCode === colorCode && (c.imageUrl || '').trim())?.imageUrl || '';
    const first = (template?.colors || []).find((c) => (c.imageUrl || '').trim())?.imageUrl || '';
    return (bySelected || first || '').trim();
  }, [template, colorCode]);

  useEffect(() => {
    if (!open) return;
    const p = billCustomerPhone || (billCustomer?.phone ?? '') || '';
    setCustomerPhone(p);
    setSelectedCustomerId(billCustomer?.id || null);
    setSelectedCustomerLabel(
      billCustomer ? `${billCustomer.fullName}${billCustomer.phone ? ` · ${billCustomer.phone}` : ''}` : ''
    );
    setStep(1);
    setError(null);
    setMaterialSource('STORE');
    setSelectedColorName('Custom');
  }, [open, billCustomerPhone, billCustomer]);

  useEffect(() => {
    const phone = customerPhone.trim();
    if (!/^\d{10}$/.test(phone)) {
      if (selectedCustomerId && billCustomer?.phone !== phone) {
        setSelectedCustomerId(null);
        setSelectedCustomerLabel('');
      }
      return;
    }
    let active = true;
    const t = window.setTimeout(() => {
      (async () => {
        try {
          const res = await apiFetch<{ customers: Array<{ id: string; fullName: string; phone?: string | null }> }>(
            `/customers?q=${encodeURIComponent(phone)}`
          );
          if (!active) return;
          const exact = (res.customers || []).find((c) => (c.phone ?? '') === phone) || null;
          if (!exact) {
            setSelectedCustomerId(null);
            setSelectedCustomerLabel('');
            return;
          }
          setSelectedCustomerId(exact.id);
          setSelectedCustomerLabel(`${exact.fullName}${exact.phone ? ` · ${exact.phone}` : ''}`);
        } catch {
          if (!active) return;
          return;
        }
      })();
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [customerPhone, billCustomer?.id, billCustomer?.phone, selectedCustomerId]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!open) return;
      try {
        setError(null);
        const [tRes, tlRes] = await Promise.all([
          apiFetch<{ templates: Template[] }>('/pos/stitching/templates'),
          apiFetch<{ tailors: Tailor[] }>('/pos/stitching/tailors')
        ]);
        if (!active) return;
        setTemplates(tRes.templates || []);
        setTailors(tlRes.tailors || []);
        const firstId = tRes.templates?.[0]?.id || '';
        setTemplateId((prev) => prev || firstId);
      } catch (e: unknown) {
        if (!active) return;
        setError(errorMessage(e, 'Failed to load stitching templates'));
      }
    })();
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!template) return;
    const defaultColor = template.colors?.[0]?.colorCode || '#000000';
    setColorCode((prev) =>
      materialSource === 'STORE'
        ? (template.colors.some((c) => c.colorCode === prev) ? prev : defaultColor)
        : (prev || defaultColor)
    );
    const defaultSize = template.measurementProfiles?.[0]?.measurementName || '';
    setSizeName((prev) => (prev && template.measurementProfiles.some((p) => p.measurementName === prev) ? prev : defaultSize));
    const defaultMaterial = template.materialConfigs?.[0]?.id || '';
    setMaterialConfigId((prev) => (prev && template.materialConfigs.some((m) => m.id === prev) ? prev : defaultMaterial));
  }, [template, materialSource]);

  useEffect(() => {
    if (materialSource === 'CUSTOMER') {
      setMaterialConfigId('');
      setMaterialUsageMeters('');
      if (selectedColorName.trim()) return;
      setSelectedColorName('Custom');
      return;
    }
    if (selectedTemplateColor?.colorName?.trim()) setSelectedColorName(selectedTemplateColor.colorName.trim());
  }, [materialSource, selectedTemplateColor?.colorName, selectedColorName]);

  useEffect(() => {
    if (!open) return;
    if (!template?.materialConfigs?.length) { setMaterialRows([]); return; }
    const ids = Array.from(new Set(template.materialConfigs.map((x) => x.erpMaterialId).filter(Boolean)));
    if (!ids.length) { setMaterialRows([]); return; }
    let active = true;
    (async () => {
      try {
        const res = await apiFetch<{ materials: MaterialRow[] }>(`/erp/materials/by-ids?ids=${encodeURIComponent(ids.join(','))}`);
        if (!active) return;
        setMaterialRows(res.materials || []);
      } catch {
        if (!active) return;
        setMaterialRows([]);
      }
    })();
    return () => { active = false; };
  }, [open, template?.id]);

  useEffect(() => {
    if (!sizeProfile) { setMeasurements({}); return; }
    setMeasurements((prev) => {
      const next: Record<string, string> = {};
      for (const f of sizeProfile.fields) next[f] = prev[f] || '';
      return next;
    });
  }, [sizeProfile]);

  useEffect(() => {
    if (!materialConfig) { setMaterialUsageMeters(''); return; }
    setMaterialUsageMeters((prev) => (prev ? prev : materialConfig.metersRequired || ''));
  }, [materialConfig]);

  async function createOrder() {
    setBusy(true);
    setError(null);
    try {
      if (!templateId) throw new Error('Select a template');
      const p = Number(priceRupees);
      if (!Number.isFinite(p) || p <= 0) throw new Error('Enter price');
      if (!deliveryDate) throw new Error('Select delivery date');
      const isoDelivery = `${deliveryDate}T00:00:00.000Z`;

      const meas: Record<string, number> = {};
      for (const [k, v] of Object.entries(measurements)) {
        if (!String(v).trim()) continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid measurement: ${k}`);
        meas[k] = n;
      }

      const tCost = tailorCostRupees.trim() ? Number(tailorCostRupees) : undefined;
      if (tCost !== undefined && (!Number.isFinite(tCost) || tCost < 0)) throw new Error('Invalid tailor cost');
      const tgst = tailorGstRatePercent.trim() ? Number(tailorGstRatePercent) : 0;
      if (!Number.isFinite(tgst) || tgst < 0 || tgst > 100) throw new Error('Invalid tailor GST rate');

      const payload = {
        productTemplateId: templateId,
        erpCustomerId: selectedCustomerId || undefined,
        materialSource,
        selectedColorName: selectedColorName.trim() || undefined,
        selectedColorCode: colorCode,
        selectedColorImageUrl: materialSource === 'CUSTOMER' && autoTemplateImageUrl ? autoTemplateImageUrl : undefined,
        sizeName: sizeName || undefined,
        measurements: Object.keys(meas).length ? meas : undefined,
        erpMaterialId: materialSource === 'STORE' && materialConfig ? materialConfig.erpMaterialId : undefined,
        materialUsageMeters:
          materialSource === 'STORE' && materialConfig ? Number(materialUsageMeters || materialConfig.metersRequired) : undefined,
        tailorId: tailorId || undefined,
        deliveryDate: isoDelivery,
        priceRupees: p,
        tailorCostRupees: tCost,
        gstOnTailor,
        tailorGstRatePercent: gstOnTailor ? tgst : 0
      };

      const res = await apiFetch<{
        order: { id: string; orderCode: string; tailor?: { phone: string } | null };
        stitchingServiceProduct: { id: string };
      }>('/pos/stitching/orders', { method: 'POST', body: JSON.stringify(payload) });

      onCreated({
        stitchingOrderId: res.order.id,
        stitchingOrderCode: res.order.orderCode,
        tailorPhone: res.order.tailor?.phone || undefined,
        stitchingServiceProductId: res.stitchingServiceProduct.id,
        unitPriceRupees: p
      });
      onClose();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to create stitching order'));
    } finally {
      setBusy(false);
    }
  }

  const steps: Array<{ id: 1 | 2 | 3 | 4 | 5; label: string }> = [
    { id: 1, label: 'Template' },
    { id: 2, label: 'Measurements' },
    { id: 3, label: 'Material' },
    { id: 4, label: 'Customer' },
    { id: 5, label: 'Tailor' }
  ];

  const stepIsValid = (() => {
    if (step === 1) {
      const p = Number(priceRupees);
      return Boolean(templateId) && Boolean(deliveryDate) && Number.isFinite(p) && p > 0;
    }
    if (step === 3) {
      if (materialSource === 'CUSTOMER') return true;
      if (!materialConfig) return true;
      const n = Number(materialUsageMeters || materialConfig.metersRequired);
      return Number.isFinite(n) && n > 0;
    }
    if (step === 4) {
      const phone = customerPhone.trim();
      if (!phone) return true;
      return /^\d{10}$/.test(phone);
    }
    if (step === 5) {
      const tCost = tailorCostRupees.trim() ? Number(tailorCostRupees) : undefined;
      if (tCost !== undefined && (!Number.isFinite(tCost) || tCost < 0)) return false;
      const tgst = tailorGstRatePercent.trim() ? Number(tailorGstRatePercent) : 0;
      if (!Number.isFinite(tgst) || tgst < 0 || tgst > 100) return false;
      return true;
    }
    return true;
  })();

  if (!open) return null;

  return (
    <div className="gModalBack" onMouseDown={() => !busy && onClose()}>
      <div className="gModal posModal" style={{ maxWidth: 860 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="gModalHd">
          <div style={{ fontWeight: 900 }}>Stitching</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="gBtn ghost"
              onClick={() => window.open('/backoffice/stitching/new?manageProducts=1', '_blank', 'noopener,noreferrer')}
              disabled={busy}
            >
              Add Template
            </button>
            <button className="gBtn ghost" onClick={onClose} disabled={busy}>Close</button>
          </div>
        </div>
        <div className="gModalBd tw-p-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="tw-border-b tw-border-line tw-bg-white tw-px-5 tw-py-3">
            <div className="tw-flex tw-flex-wrap tw-gap-2">
              {steps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={[
                    'tw-h-9 tw-rounded-full tw-border tw-px-3 tw-text-[12px] tw-font-medium tw-transition',
                    step === s.id ? 'tw-border-slate-400 tw-bg-slate-50 tw-text-ink' : 'tw-border-line tw-bg-white tw-text-muted hover:tw-bg-slate-50'
                  ].join(' ')}
                  onClick={() => setStep(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tw-flex-1 tw-overflow-auto tw-px-5 tw-py-4" style={{ maxHeight: '68vh' }}>
            {error ? <div className="tw-mb-3 tw-rounded-control tw-border tw-border-red-200 tw-bg-red-50 tw-p-3 tw-text-[14px] tw-text-red-800">{error}</div> : null}

            {step === 1 ? (
              <div className="tw-space-y-4">
                <div>
                  <StLabel>Template</StLabel>
                  <StSelect value={templateId} onChange={(e) => setTemplateId(e.target.value)} invalid={!templateId}>
                    <option value="">Select</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
                  </StSelect>
                </div>

                <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                  <div className="tw-col-span-12 md:tw-col-span-6">
                    <StLabel>Material Source</StLabel>
                    <StSelect value={materialSource} onChange={(e) => setMaterialSource(e.target.value as any)}>
                      <option value="STORE">Store material</option>
                      <option value="CUSTOMER">Customer material</option>
                    </StSelect>
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-6 tw-flex tw-items-end">
                    <div className="tw-rounded-card tw-border tw-border-line tw-bg-bg tw-p-3 tw-text-[12px] tw-text-muted tw-w-full">
                      {materialSource === 'STORE'
                        ? 'Store stock will be deducted if material is selected in the Material step.'
                        : 'Store stock will not be deducted for customer material.'}
                    </div>
                  </div>
                </div>

                <div className="tw-grid tw-grid-cols-12 tw-gap-3 tw-items-end">
                  <div className="tw-col-span-12 md:tw-col-span-7">
                    <StLabel>Color</StLabel>
                    <div className="tw-flex tw-flex-wrap tw-gap-2">
                      {(template?.colors || []).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={[
                            'tw-h-10 tw-w-10 tw-rounded-control tw-border tw-transition',
                            c.colorCode === colorCode ? 'tw-border-slate-400 tw-ring-2 tw-ring-slate-100' : 'tw-border-line hover:tw-bg-slate-50'
                          ].join(' ')}
                          onClick={() => setColorCode(c.colorCode)}
                          title={`${c.colorName || 'Color'} · ${c.colorCode}`}
                        >
                          <span className="tw-block tw-h-full tw-w-full tw-rounded-control" style={{ background: c.colorCode }} />
                        </button>
                      ))}
                      {materialSource === 'CUSTOMER' ? (
                        <label className="tw-h-10 tw-w-10 tw-rounded-control tw-border tw-border-line tw-bg-white tw-flex tw-items-center tw-justify-center hover:tw-bg-slate-50">
                          <input
                            type="color"
                            value={colorCode}
                            onChange={(e) => setColorCode(e.target.value)}
                            className="tw-h-6 tw-w-6 tw-border-0 tw-bg-transparent"
                          />
                        </label>
                      ) : null}
                    </div>
                    {materialSource === 'CUSTOMER' ? (
                      <div className="tw-mt-3">
                        <StLabel>Color Name</StLabel>
                        <StInput
                          value={selectedColorName}
                          onChange={(e) => setSelectedColorName(e.target.value)}
                          placeholder="e.g. Wine Red"
                        />
                      </div>
                    ) : selectedTemplateColor?.colorName?.trim() ? (
                      <div className="tw-mt-2 tw-text-[12px] tw-text-muted">Selected: {selectedTemplateColor.colorName}</div>
                    ) : null}
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-5">
                    <StLabel>Preview</StLabel>
                    <div className="tw-mt-1 tw-h-[120px] tw-rounded-card tw-border tw-border-line tw-bg-bg tw-overflow-hidden tw-flex tw-items-center tw-justify-center tw-relative">
                      {(() => {
                        if (materialSource === 'CUSTOMER') {
                          const u = resolveImageUrl(autoTemplateImageUrl || null);
                          if (!u) return <div className="tw-h-10 tw-w-10 tw-rounded-full tw-border tw-border-line tw-bg-white" />;
                          return (
                            <>
                              <img src={u} className="tw-h-full tw-w-full tw-object-cover" alt="template reference" />
                              <div className="tw-absolute tw-inset-x-0 tw-bottom-0 tw-bg-slate-200 tw-bg-opacity-70 tw-text-black tw-text-[11px] tw-px-2 tw-py-1 tw-text-center">
                                Colour is mentioned above and this image is just for reference
                              </div>
                            </>
                          );
                        }
                        const c = (template?.colors || []).find((x) => x.colorCode === colorCode) || null;
                        const u = resolveImageUrl(c?.imageUrl || null);
                        if (!u) return <div className="tw-h-10 tw-w-10 tw-rounded-full tw-border tw-border-line tw-bg-white" />;
                        return (
                          <>
                            <img src={u} className="tw-h-full tw-w-full tw-object-cover" alt={c?.colorCode || 'color'} />
                            <div className="tw-absolute tw-inset-x-0 tw-bottom-0 tw-bg-slate-200 tw-bg-opacity-70 tw-text-black tw-text-[11px] tw-px-2 tw-py-1 tw-text-center">
                              Colour is mentioned above and this image is just for reference
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                  <div className="tw-col-span-12 md:tw-col-span-6">
                    <StLabel>Size</StLabel>
                    <StSelect value={sizeName} onChange={(e) => setSizeName(e.target.value)}>
                      {(template?.measurementProfiles || []).map((p) => <option key={p.id} value={p.measurementName}>{p.measurementName}</option>)}
                    </StSelect>
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-6">
                    <StLabel>Delivery Date</StLabel>
                    <StInput type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} invalid={!deliveryDate} />
                  </div>
                </div>

                <div className="tw-grid tw-grid-cols-12 tw-gap-3 tw-items-end">
                  <div className="tw-col-span-12 md:tw-col-span-6">
                    <StLabel>Price (₹)</StLabel>
                    <StInput value={priceRupees} onChange={(e) => setPriceRupees(e.target.value)} placeholder="e.g. 1200" invalid={!Number.isFinite(Number(priceRupees)) || Number(priceRupees) <= 0} />
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-6">
                    <div className="tw-rounded-card tw-border tw-border-line tw-bg-bg tw-p-3">
                      <div className="tw-text-[12px] tw-text-muted">GST will follow ERP Stitching Service product settings.</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="tw-space-y-3">
                <div className="tw-flex tw-items-center tw-justify-between">
                  <div className="tw-text-[14px] tw-font-medium tw-text-ink">Measurements</div>
                  <StBadge tone="neutral">Optional</StBadge>
                </div>
                {!sizeProfile ? (
                  <div className="tw-text-[12px] tw-text-muted">Select a template and size first</div>
                ) : (
                  <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                    {sizeProfile.fields.map((f) => (
                      <div className="tw-col-span-6" key={f}>
                        <StLabel>{f}</StLabel>
                        <StInput value={measurements[f] || ''} onChange={(e) => setMeasurements({ ...measurements, [f]: e.target.value })} placeholder="number" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="tw-space-y-4">
                <div className="tw-flex tw-items-center tw-justify-between">
                  <div className="tw-text-[14px] tw-font-medium tw-text-ink">Material</div>
                  <StBadge tone="neutral">Optional</StBadge>
                </div>
                {materialSource === 'CUSTOMER' ? (
                  <div className="tw-space-y-3">
                    <div className="tw-rounded-card tw-border tw-border-line tw-bg-bg tw-p-3 tw-text-[12px] tw-text-muted">
                      Material is provided by customer. Store stock will not be deducted.
                    </div>
                    <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                      <div className="tw-col-span-12">
                        <StLabel>Design Reference (auto from selected template)</StLabel>
                        <div className="tw-mt-2 tw-rounded-card tw-border tw-border-line tw-bg-white tw-overflow-hidden tw-relative tw-h-[140px] tw-flex tw-items-center tw-justify-center">
                          {(() => {
                            const u = resolveImageUrl(autoTemplateImageUrl || null);
                            if (!u) return <div className="tw-text-[12px] tw-text-muted">No image available for this template</div>;
                            return <img src={u} className="tw-h-full tw-w-full tw-object-cover" alt="template reference" />;
                          })()}
                          {autoTemplateImageUrl ? (
                            <div className="tw-absolute tw-inset-x-0 tw-bottom-0 tw-bg-slate-200 tw-bg-opacity-70 tw-text-black tw-text-[11px] tw-px-2 tw-py-1 tw-text-center">
                              Colour is mentioned above and this image is just for reference
                            </div>
                          ) : null}
                        </div>
                        <div className="tw-mt-2 tw-text-[12px] tw-text-muted">This image is auto-picked and used only as a print reference.</div>
                      </div>
                    </div>
                  </div>
                ) : !template?.materialConfigs?.length ? (
                  <div className="tw-text-[12px] tw-text-muted">No material configured for this template</div>
                ) : (
                  <div className="tw-grid tw-grid-cols-12 tw-gap-3 tw-items-end">
                    <div className="tw-col-span-12 md:tw-col-span-8">
                      <StLabel>Dress Material</StLabel>
                      <StSelect value={materialConfigId} onChange={(e) => setMaterialConfigId(e.target.value)}>
                        <option value="">None</option>
                        {template.materialConfigs.map((m) => {
                          const row = materialRows.find((x) => x.id === m.erpMaterialId) || null;
                          const label = row ? `${row.name} (${row.code})` : m.erpMaterialId;
                          return <option key={m.id} value={m.id}>{label} · {m.metersRequired} m</option>;
                        })}
                      </StSelect>
                    </div>
                    <div className="tw-col-span-12 md:tw-col-span-4">
                      <StLabel>Usage (m)</StLabel>
                      {(() => {
                        const cfg = materialConfig;
                        const metersValue = cfg ? String(materialUsageMeters || cfg.metersRequired || '') : String(materialUsageMeters || '');
                        const metersNum = cfg ? Number(metersValue || cfg.metersRequired) : NaN;
                        const metersInvalid = cfg ? !Number.isFinite(metersNum) || metersNum <= 0 : false;
                        return (
                          <StInput
                            value={materialUsageMeters}
                            onChange={(e) => setMaterialUsageMeters(e.target.value)}
                            placeholder="e.g. 2.5"
                            disabled={!cfg}
                            invalid={metersInvalid}
                          />
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {step === 4 ? (
              <div className="tw-space-y-4">
                <div className="tw-flex tw-items-center tw-justify-between">
                  <div className="tw-text-[14px] tw-font-medium tw-text-ink">Customer</div>
                  <StBadge tone="neutral">Optional</StBadge>
                </div>
                <div>
                  <StLabel>Customer Phone (10 digits)</StLabel>
                  <StInput
                    value={customerPhone}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerPhone(v);
                      if (selectedCustomerId && (billCustomer?.phone ?? '') !== v.trim()) {
                        setSelectedCustomerId(null);
                        setSelectedCustomerLabel('');
                      }
                    }}
                    placeholder="Leave empty for walk-in"
                    invalid={Boolean(customerPhone.trim()) && !/^\d{10}$/.test(customerPhone.trim())}
                  />
                  <div className="tw-mt-1 tw-text-[12px] tw-text-muted">Auto-detects saved customer by phone</div>
                </div>

                {selectedCustomerId ? (
                  <div className="tw-rounded-card tw-border tw-border-line tw-bg-bg tw-p-3 tw-flex tw-items-center tw-justify-between tw-gap-3">
                    <div className="tw-text-[12px] tw-text-ink">Using: {selectedCustomerLabel}</div>
                    <StButton
                      variant="ghost"
                      onClick={() => {
                        setSelectedCustomerId(null);
                        setSelectedCustomerLabel('');
                      }}
                      type="button"
                    >
                      Clear
                    </StButton>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 5 ? (
              <div className="tw-space-y-4">
                <div className="tw-flex tw-items-center tw-justify-between">
                  <div className="tw-text-[14px] tw-font-medium tw-text-ink">Tailor</div>
                  <StBadge tone="neutral">Optional</StBadge>
                </div>
                <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                  <div className="tw-col-span-12">
                    <StLabel>Tailor</StLabel>
                    <StSelect value={tailorId} onChange={(e) => setTailorId(e.target.value)}>
                      <option value="">Unassigned</option>
                      {tailors.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.phone})</option>)}
                    </StSelect>
                  </div>
                  <div className="tw-col-span-6">
                    <StLabel>Cost (₹)</StLabel>
                    <StInput value={tailorCostRupees} onChange={(e) => setTailorCostRupees(e.target.value)} placeholder="e.g. 600" invalid={Boolean(tailorCostRupees.trim()) && (!Number.isFinite(Number(tailorCostRupees)) || Number(tailorCostRupees) < 0)} />
                  </div>
                  <div className="tw-col-span-6">
                    <StLabel>GST on Tailor</StLabel>
                    <StSelect value={gstOnTailor ? '1' : '0'} onChange={(e) => setGstOnTailor(e.target.value === '1')}>
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </StSelect>
                  </div>
                  <div className="tw-col-span-6">
                    <StLabel>Tailor GST %</StLabel>
                    <StInput value={tailorGstRatePercent} onChange={(e) => setTailorGstRatePercent(e.target.value)} disabled={!gstOnTailor} invalid={gstOnTailor && (!Number.isFinite(Number(tailorGstRatePercent)) || Number(tailorGstRatePercent) <= 0 || Number(tailorGstRatePercent) > 100)} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="tw-border-t tw-border-line tw-bg-white tw-px-5 tw-py-4 tw-flex tw-items-center tw-justify-between tw-gap-3">
            <div className="tw-flex tw-gap-2">
              <StButton
                variant="secondary"
                onClick={() => setStep((prev) => (prev === 1 ? 1 : ((prev - 1) as any)))}
                disabled={busy || step === 1}
                type="button"
              >
                Back
              </StButton>
            </div>

            {step === 5 ? (
              <StButton
                variant="primary"
                onClick={createOrder}
                disabled={busy || !templateId || !deliveryDate || !priceRupees.trim()}
                type="button"
              >
                {busy ? 'Adding…' : 'Add to Bill'}
              </StButton>
            ) : (
              <StButton
                variant="primary"
                onClick={() => setStep((prev) => (prev === 5 ? 5 : ((prev + 1) as any)))}
                disabled={busy || !stepIsValid}
                type="button"
              >
                Continue
              </StButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
