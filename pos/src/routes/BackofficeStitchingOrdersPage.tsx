import { useEffect, useMemo, useState } from 'react';
import { apiFetch, downloadWithAuth } from '../lib/api';
import { useSearchParams } from 'react-router-dom';
import { StBadge, StButton, StCard, StInput, StLabel, StSelect } from '../components/stitching/AdminUi';

type StitchingOrderStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

type Tailor = { id: string; name: string; phone: string; isActive: boolean };

type OrderRow = {
  id: string;
  orderCode: string;
  status: StitchingOrderStatus;
  deliveryDate: string;
  productTemplate?: { id: string; name: string; category: string };
  tailor?: { id: string; name: string };
  customerProfile?: null | { erpCustomer: { id: string; fullName: string; phone?: string | null; isWalkIn: boolean } };
};

type OrderDetail = {
  id: string;
  orderCode: string;
  status: StitchingOrderStatus;
  deliveryDate: string;
  selectedColorCode: string;
  selectedColorImageUrl?: string | null;
  measurementProfileName?: string | null;
  measurements?: Record<string, number> | null;
  erpMaterialId?: string | null;
  erpMaterial?: null | { id: string; code: string; name: string };
  materialUsageMeters?: string | number | null;
  productTemplate: { id: string; name: string; category: string };
  tailor?: { id: string; name: string; phone: string } | null;
  customerProfile?: null | { erpCustomer: { id: string; fullName: string; phone?: string | null; isWalkIn: boolean } };
  tailorCostPaise?: string | null;
  gstOnTailor?: boolean;
  tailorGstRateBp?: number | null;
};

function errorMessage(e: unknown, fallback: string) {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  if (e && typeof e === 'object' && 'status' in e && 'message' in e) {
    const s = (e as any).status;
    const m = (e as any).message;
    if (typeof s === 'number' && typeof m === 'string' && m.trim()) return `HTTP ${s}: ${m}`;
  }
  return fallback;
}

function statusBadgeClass(s: StitchingOrderStatus) {
  if (s === 'COMPLETED') return 'success';
  if (s === 'IN_PROGRESS') return 'warning';
  return 'neutral';
}

async function openPdfFromApi(path: string) {
  const { blob } = await downloadWithAuth(path);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function openHtmlInNewTab(html: string) {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function BackofficeStitchingOrdersPage() {
  const [sp, setSp] = useSearchParams();

  const [q, setQ] = useState(sp.get('q') || '');
  const [status, setStatus] = useState<'' | StitchingOrderStatus>((sp.get('status') as any) || '');
  const [tailorId, setTailorId] = useState(sp.get('tailorId') || '');
  const [fromDate, setFromDate] = useState(sp.get('fromDate') || '');
  const [toDate, setToDate] = useState(sp.get('toDate') || '');

  const [tailors, setTailors] = useState<Tailor[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    if (tailorId) params.set('tailorId', tailorId);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    params.set('page', '1');
    params.set('pageSize', '50');
    return params.toString();
  }, [q, status, tailorId, fromDate, toDate]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const tl = await apiFetch<{ tailors: Tailor[] }>('/stitching/tailors?page=1&pageSize=100');
        if (!active) return;
        setTailors(tl.tailors || []);
      } catch {
        if (!active) return;
        setTailors([]);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (q.trim()) next.set('q', q.trim()); else next.delete('q');
      if (status) next.set('status', status); else next.delete('status');
      if (tailorId) next.set('tailorId', tailorId); else next.delete('tailorId');
      if (fromDate) next.set('fromDate', fromDate); else next.delete('fromDate');
      if (toDate) next.set('toDate', toDate); else next.delete('toDate');
      return next;
    });
  }, [q, status, tailorId, fromDate, toDate]);

  async function loadOrders() {
    const res = await apiFetch<{ total: number; orders: OrderRow[] }>(`/stitching/orders?${qs}`);
    setOrders(res.orders || []);
    setTotal(res.total || 0);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        await loadOrders();
      } catch (e: unknown) {
        if (!active) return;
        setError(errorMessage(e, 'Failed to load orders'));
      }
    })();
    return () => { active = false; };
  }, [qs]);

  async function loadDetail(id: string) {
    const res = await apiFetch<{ order: OrderDetail }>(`/stitching/orders/${id}`);
    setDetail(res.order);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!drawerOpen || !drawerOrderId) return;
      try {
        setError(null);
        setDetail(null);
        await loadDetail(drawerOrderId);
      } catch (e: unknown) {
        if (!active) return;
        setError(errorMessage(e, 'Failed to load order'));
        setDetail(null);
      }
    })();
    return () => { active = false; };
  }, [drawerOpen, drawerOrderId]);

  async function updateOrderStatus(id: string, next: StitchingOrderStatus) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/stitching/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      await loadOrders();
      if (drawerOpen && drawerOrderId === id) await loadDetail(id);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to update status'));
    } finally {
      setBusy(false);
    }
  }

  async function assignTailor(orderIdValue: string, input: { tailorId: string }) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/stitching/orders/${orderIdValue}/assign-tailor`, { method: 'POST', body: JSON.stringify(input) });
      await loadOrders();
      if (drawerOpen && drawerOrderId === orderIdValue) await loadDetail(orderIdValue);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to assign tailor'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-mx-auto tw-max-w-[1280px] tw-px-6 tw-py-6 tw-space-y-8">
      {error ? <div className="tw-rounded-control tw-border tw-border-red-200 tw-bg-red-50 tw-p-3 tw-text-[14px] tw-text-red-800">{error}</div> : null}

      <StCard
        title="Orders"
        right={
          <div className="tw-flex tw-items-center tw-gap-3">
            <div className="tw-text-[12px] tw-text-muted">{total ? `${total} total` : ''}</div>
            <StButton
              variant="secondary"
              onClick={() => {
                setQ('');
                setStatus('');
                setTailorId('');
                setFromDate('');
                setToDate('');
              }}
              disabled={busy}
              type="button"
            >
              Clear
            </StButton>
          </div>
        }
      >
        <div className="tw-grid tw-grid-cols-12 tw-gap-4 tw-items-end">
          <div className="tw-col-span-12 md:tw-col-span-4">
            <StLabel>Search</StLabel>
            <StInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order ID / customer / tailor" />
          </div>
          <div className="tw-col-span-6 md:tw-col-span-2">
            <StLabel>Status</StLabel>
            <StSelect value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="">All</option>
              <option value="PENDING">PENDING</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
            </StSelect>
          </div>
          <div className="tw-col-span-6 md:tw-col-span-2">
            <StLabel>Tailor</StLabel>
            <StSelect value={tailorId} onChange={(e) => setTailorId(e.target.value)}>
              <option value="">All</option>
              {tailors.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </StSelect>
          </div>
          <div className="tw-col-span-6 md:tw-col-span-2">
            <StLabel>From</StLabel>
            <StInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="tw-col-span-6 md:tw-col-span-2">
            <StLabel>To</StLabel>
            <StInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>

        <div className="tw-mt-6 tw-overflow-auto tw-rounded-card tw-border tw-border-line">
          <table className="tw-w-full tw-min-w-[820px] tw-text-left tw-text-[14px]">
            <thead className="tw-bg-bg">
              <tr className="tw-text-[12px] tw-text-muted">
                <th className="tw-px-4 tw-py-3">Order ID</th>
                <th className="tw-px-4 tw-py-3">Customer</th>
                <th className="tw-px-4 tw-py-3">Tailor</th>
                <th className="tw-px-4 tw-py-3">Status</th>
                <th className="tw-px-4 tw-py-3">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="tw-cursor-pointer hover:tw-bg-slate-50"
                  onClick={() => {
                    setDrawerOrderId(o.id);
                    setDrawerOpen(true);
                  }}
                >
                  <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-font-medium tw-text-ink">{o.orderCode}</td>
                  <td className="tw-border-t tw-border-line tw-px-4 tw-py-3">
                    <div className="tw-font-medium tw-text-ink">{o.customerProfile?.erpCustomer?.fullName || 'Walk-in'}</div>
                    <div className="tw-mt-0.5 tw-text-[12px] tw-text-muted">{o.customerProfile?.erpCustomer?.phone || ''}</div>
                  </td>
                  <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{o.tailor?.name || '—'}</td>
                  <td className="tw-border-t tw-border-line tw-px-4 tw-py-3">
                    <StBadge tone={statusBadgeClass(o.status) as any}>{o.status}</StBadge>
                  </td>
                  <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{String(o.deliveryDate).slice(0, 10)}</td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="tw-border-t tw-border-line tw-px-4 tw-py-10 tw-text-center tw-text-[12px] tw-text-muted">
                    No orders
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="tw-mt-4 tw-text-[12px] tw-text-muted">
          Orders are created in POS. This page is for tracking, details, printing and tailor assignment.
        </div>
      </StCard>

      <div className={`tw-fixed tw-inset-0 tw-z-[70] ${drawerOpen ? 'tw-pointer-events-auto' : 'tw-pointer-events-none'}`}>
        <div
          className={`tw-absolute tw-inset-0 tw-bg-black/20 tw-transition ${drawerOpen ? 'tw-opacity-100' : 'tw-opacity-0'}`}
          onMouseDown={() => !busy && setDrawerOpen(false)}
        />
        <div
          className={[
            'tw-absolute tw-right-0 tw-top-0 tw-h-full tw-w-[min(520px,92vw)] tw-bg-white tw-shadow-soft tw-border-l tw-border-line tw-transition-transform tw-duration-200 tw-flex tw-flex-col',
            drawerOpen ? 'tw-translate-x-0' : 'tw-translate-x-full'
          ].join(' ')}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="tw-flex tw-items-center tw-justify-between tw-gap-4 tw-border-b tw-border-line tw-px-5 tw-py-4">
            <div className="tw-text-[16px] tw-font-medium tw-text-ink">{detail ? `Order ${detail.orderCode}` : 'Order'}</div>
            <StButton variant="ghost" onClick={() => setDrawerOpen(false)} disabled={busy} type="button">
              Close
            </StButton>
          </div>
          <div className="tw-flex-1 tw-overflow-auto tw-p-5 tw-space-y-6">
            {!detail ? (
              <div className="tw-animate-pulse tw-rounded-card tw-border tw-border-line tw-bg-white tw-p-5">
                <div className="tw-h-4 tw-w-40 tw-rounded tw-bg-slate-100" />
                <div className="tw-mt-3 tw-h-3 tw-w-72 tw-rounded tw-bg-slate-100" />
                <div className="tw-mt-6 tw-h-24 tw-rounded tw-bg-slate-100" />
              </div>
            ) : (
              <>
                <div className="tw-rounded-card tw-border tw-border-line tw-bg-white tw-p-5">
                  <div className="tw-text-[16px] tw-font-medium tw-text-ink">Summary</div>
                  <div className="tw-mt-4 tw-grid tw-grid-cols-12 tw-gap-4">
                    <div className="tw-col-span-12 md:tw-col-span-4">
                      <StLabel>Customer</StLabel>
                      <div className="tw-mt-1 tw-font-medium tw-text-ink">{detail.customerProfile?.erpCustomer?.fullName || 'Walk-in'}</div>
                      <div className="tw-mt-0.5 tw-text-[12px] tw-text-muted">{detail.customerProfile?.erpCustomer?.phone || ''}</div>
                    </div>
                    <div className="tw-col-span-12 md:tw-col-span-4">
                      <StLabel>Product</StLabel>
                      <div className="tw-mt-1 tw-font-medium tw-text-ink">{detail.productTemplate?.name || ''}</div>
                      <div className="tw-mt-0.5 tw-text-[12px] tw-text-muted">{detail.productTemplate?.category || ''}</div>
                    </div>
                    <div className="tw-col-span-12 md:tw-col-span-4">
                      <StLabel>Delivery</StLabel>
                      <div className="tw-mt-1 tw-font-medium tw-text-ink">{String(detail.deliveryDate).slice(0, 10)}</div>
                      <div className="tw-mt-0.5 tw-text-[12px] tw-text-muted">Color: {detail.selectedColorCode}</div>
                    </div>
                  </div>
                </div>

                <div className="tw-rounded-card tw-border tw-border-line tw-bg-white tw-p-5">
                  <div className="tw-text-[16px] tw-font-medium tw-text-ink">Status</div>
                  <div className="tw-mt-4 tw-grid tw-grid-cols-12 tw-gap-4">
                    <div className="tw-col-span-12 md:tw-col-span-6">
                      <StLabel>Status</StLabel>
                      <StSelect value={detail.status} onChange={(e) => updateOrderStatus(detail.id, e.target.value as StitchingOrderStatus)} disabled={busy}>
                        <option value="PENDING">PENDING</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="COMPLETED">COMPLETED</option>
                      </StSelect>
                    </div>
                    <div className="tw-col-span-12 md:tw-col-span-6">
                      <StLabel>Tailor</StLabel>
                      <StSelect
                        value={detail.tailor?.id || ''}
                        onChange={(e) => assignTailor(detail.id, { tailorId: e.target.value })}
                        disabled={busy}
                      >
                        <option value="">Unassigned</option>
                        {tailors.filter((t) => t.isActive).map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </StSelect>
                    </div>
                  </div>
                </div>

                <div className="tw-rounded-card tw-border tw-border-line tw-bg-white tw-p-5">
                  <div className="tw-flex tw-items-end tw-justify-between tw-gap-4">
                    <div>
                      <div className="tw-text-[16px] tw-font-medium tw-text-ink">Measurements</div>
                      <div className="tw-mt-1 tw-text-[12px] tw-text-muted">Size: {detail.measurementProfileName || '—'}</div>
                    </div>
                  </div>
                  {detail.measurements && Object.keys(detail.measurements).length ? (
                    <div className="tw-mt-4 tw-overflow-auto tw-rounded-card tw-border tw-border-line">
                      <table className="tw-w-full tw-text-left tw-text-[14px]">
                        <thead className="tw-bg-bg">
                          <tr className="tw-text-[12px] tw-text-muted">
                            <th className="tw-px-4 tw-py-3">Field</th>
                            <th className="tw-px-4 tw-py-3 tw-text-right">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(detail.measurements).map(([k, v]) => (
                            <tr key={k}>
                              <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-font-medium tw-text-ink">{k}</td>
                              <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-right tw-text-ink">{String(v)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="tw-mt-4 tw-text-[12px] tw-text-muted">No measurements</div>
                  )}
                </div>

                <div className="tw-rounded-card tw-border tw-border-line tw-bg-white tw-p-5">
                  <div className="tw-text-[16px] tw-font-medium tw-text-ink">Material</div>
                  <div className="tw-mt-4 tw-grid tw-grid-cols-12 tw-gap-4">
                    <div className="tw-col-span-12 md:tw-col-span-8">
                      <StLabel>ERP Material</StLabel>
                      <div className="tw-mt-1 tw-font-medium tw-text-ink">
                        {detail.erpMaterial ? `${detail.erpMaterial.name} (${detail.erpMaterial.code})` : (detail.erpMaterialId || '—')}
                      </div>
                    </div>
                    <div className="tw-col-span-12 md:tw-col-span-4">
                      <StLabel>Usage (m)</StLabel>
                      <div className="tw-mt-1 tw-font-medium tw-text-ink">{detail.materialUsageMeters ? String(detail.materialUsageMeters) : '—'}</div>
                    </div>
                  </div>
                </div>

                <div className="tw-rounded-card tw-border tw-border-line tw-bg-white tw-p-5">
                  <div className="tw-text-[16px] tw-font-medium tw-text-ink">Documents</div>
                  <div className="tw-mt-4 tw-flex tw-flex-wrap tw-gap-2">
                    <StButton variant="secondary" onClick={() => openPdfFromApi(`/stitching/orders/${detail.id}/documents/customer-bill/a4`)} disabled={busy} type="button">
                      Bill A4
                    </StButton>
                    <StButton
                      variant="secondary"
                      onClick={async () => {
                        const res = await apiFetch<{ html: string }>(`/stitching/orders/${detail.id}/documents/customer-bill/thermal`);
                        openHtmlInNewTab(res.html);
                      }}
                      disabled={busy}
                      type="button"
                    >
                      Bill Thermal
                    </StButton>
                    <StButton variant="secondary" onClick={() => openPdfFromApi(`/stitching/orders/${detail.id}/documents/tailor-slip/a4`)} disabled={busy} type="button">
                      Slip A4
                    </StButton>
                    <StButton
                      variant="secondary"
                      onClick={async () => {
                        const res = await apiFetch<{ html: string }>(`/stitching/orders/${detail.id}/documents/tailor-slip/thermal`);
                        openHtmlInNewTab(res.html);
                      }}
                      disabled={busy}
                      type="button"
                    >
                      Slip Thermal
                    </StButton>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
