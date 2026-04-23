import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { StButton, StCard, StEmpty, StInput, StLabel, StTextarea } from '../components/stitching/AdminUi';

type CustomerRow = { id: string; fullName: string; phone?: string | null; isWalkIn: boolean };

type CustomerSummary = {
  id: string;
  fullName: string;
  phone?: string | null;
  gstin?: string | null;
  isBusiness?: boolean;
  stateCode?: string | null;
  isWalkIn: boolean;
  loyaltyPoints?: number;
};

type CombinedOrdersResponse = {
  customer: { id: string; fullName: string; phone?: string | null };
  loyaltyPoints: number;
  stitchingProfile: null | { notes?: string | null; updatedAt: string };
  orders: Array<
    | { type: 'ERP_SALE'; id: string; refNo: string; date: string; status: string; amountPaise: string }
    | {
        type: 'STITCHING';
        id: string;
        refNo: string;
        date: string;
        status: string;
        deliveryDate: string;
        billedInvoiceNo?: string | null;
        billedAmountPaise?: string | null;
      }
  >;
};

type StitchingProfileResponse = {
  profile: { id: string; notes?: string | null; updatedAt: string };
  erpCustomer: { id: string; fullName: string; phone?: string | null; isWalkIn: boolean };
  loyaltyPoints: number;
  orderHistory: Array<{
    id: string;
    orderCode: string;
    status: string;
    deliveryDate: string;
    createdAt: string;
    productTemplate?: { id: string; name: string; category: string };
    measurementProfileName?: string | null;
    measurements?: Record<string, number> | null;
  }>;
  measurementHistory: Array<{
    orderId: string;
    orderCode: string;
    createdAt: string;
    measurementProfileName?: string | null;
    measurements?: Record<string, number> | null;
  }>;
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

function paiseToRupeesString(paise: string) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '0.00';
  return (n / 100).toFixed(2);
}

export function BackofficeStitchingCustomersPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [combined, setCombined] = useState<CombinedOrdersResponse | null>(null);
  const [stitching, setStitching] = useState<StitchingProfileResponse | null>(null);

  const [notes, setNotes] = useState('');

  async function loadList(nextQ?: string) {
    const query = (nextQ ?? q).trim();
    const res = await apiFetch<{ customers: CustomerRow[] }>(`/customers?q=${encodeURIComponent(query)}`);
    setRows(res.customers || []);
    if (!selectedId && res.customers?.[0]?.id) setSelectedId(res.customers[0].id);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        await loadList();
      } catch (e: unknown) {
        if (!active) return;
        setError(errorMessage(e, 'Failed to load customers'));
      }
    })();
    return () => { active = false; };
  }, [q]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedId) {
        setSummary(null);
        setCombined(null);
        setStitching(null);
        setNotes('');
        return;
      }
      try {
        setError(null);
        const [erp, allOrders] = await Promise.all([
          apiFetch<{ customer: CustomerSummary }>(`/erp/customers/${selectedId}`),
          apiFetch<CombinedOrdersResponse>(`/customers/${selectedId}/orders`)
        ]);
        if (!active) return;
        setSummary(erp.customer);
        setCombined(allOrders);
        setNotes(allOrders.stitchingProfile?.notes || '');
      } catch (e: unknown) {
        if (!active) return;
        setSummary(null);
        setCombined(null);
        setNotes('');
        setError(errorMessage(e, 'Failed to load customer'));
      }
    })();
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedId) return;
      try {
        const res = await apiFetch<StitchingProfileResponse>(`/stitching/customers/${selectedId}/profile`);
        if (!active) return;
        setStitching(res);
      } catch {
        if (!active) return;
        setStitching(null);
      }
    })();
    return () => { active = false; };
  }, [selectedId]);

  async function syncProfile() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/stitching/customers/sync/${selectedId}`, { method: 'POST', body: JSON.stringify({ notes }) });
      const [allOrders, st] = await Promise.all([
        apiFetch<CombinedOrdersResponse>(`/customers/${selectedId}/orders`),
        apiFetch<StitchingProfileResponse>(`/stitching/customers/${selectedId}/profile`)
      ]);
      setCombined(allOrders);
      setStitching(st);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to sync stitching profile'));
    } finally {
      setBusy(false);
    }
  }

  const stitchingMeasurementHistory = useMemo(() => stitching?.measurementHistory || [], [stitching]);

  return (
    <div className="tw-mx-auto tw-max-w-[1280px] tw-px-6 tw-py-6">
      <div className="tw-grid tw-grid-cols-12 tw-gap-6">
        <div className="tw-col-span-12 lg:tw-col-span-4">
          <StCard title="Customers">
            {error ? <div className="tw-rounded-control tw-border tw-border-red-200 tw-bg-red-50 tw-p-3 tw-text-[14px] tw-text-red-800">{error}</div> : null}
            <div className="tw-mt-4">
              <StLabel>Search</StLabel>
              <StInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" />
            </div>
            <div className="tw-mt-4 tw-max-h-[calc(100vh-260px)] tw-overflow-auto tw-rounded-card tw-border tw-border-line">
              {(rows || []).map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    type="button"
                    className={[
                      'tw-w-full tw-text-left tw-px-4 tw-py-3 tw-border-b tw-border-line hover:tw-bg-slate-50 tw-transition',
                      active ? 'tw-bg-accent' : ''
                    ].join(' ')}
                  >
                    <div className="tw-font-medium tw-text-ink">{c.fullName}</div>
                    <div className="tw-mt-0.5 tw-text-[12px] tw-text-muted">{c.phone || (c.isWalkIn ? 'Walk-in' : '')}</div>
                  </button>
                );
              })}
              {rows.length === 0 ? <div className="tw-p-6"><StEmpty title="No customers" subtitle="Try searching by phone number" /></div> : null}
            </div>
          </StCard>
        </div>

        <div className="tw-col-span-12 lg:tw-col-span-8 tw-space-y-6">
          {!selectedId ? <StEmpty title="Select a customer" subtitle="Pick a customer from the list to view details" /> : null}

          {summary ? (
            <StCard title="Basic Info">
              <div className="tw-grid tw-grid-cols-12 tw-gap-4">
                <div className="tw-col-span-12 md:tw-col-span-5">
                  <StLabel>Name</StLabel>
                  <div className="tw-mt-1 tw-font-medium tw-text-ink">{summary.fullName}</div>
                  <div className="tw-mt-0.5 tw-text-[12px] tw-text-muted">{summary.phone || 'Walk-in'}</div>
                </div>
                <div className="tw-col-span-12 md:tw-col-span-3">
                  <StLabel>Loyalty Points</StLabel>
                  <div className="tw-mt-1 tw-font-medium tw-text-ink">{summary.loyaltyPoints ?? combined?.loyaltyPoints ?? 0}</div>
                </div>
                <div className="tw-col-span-12 md:tw-col-span-4">
                  <StLabel>GSTIN</StLabel>
                  <div className="tw-mt-1 tw-font-medium tw-text-ink">{summary.gstin || '—'}</div>
                  <div className="tw-mt-0.5 tw-text-[12px] tw-text-muted">{summary.stateCode || ''}</div>
                </div>
              </div>
            </StCard>
          ) : null}

          {selectedId ? (
            <StCard
              title="Stitching Notes"
              right={
                <StButton variant="secondary" onClick={syncProfile} disabled={busy} type="button">
                  {stitching ? 'Save Notes' : 'Create Profile'}
                </StButton>
              }
            >
              <StTextarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={4} />
              <div className="tw-mt-2 tw-text-[12px] tw-text-muted">
                {combined?.stitchingProfile?.updatedAt
                  ? `Last updated: ${String(combined.stitchingProfile.updatedAt).slice(0, 19).replace('T', ' ')}`
                  : 'Not synced yet'}
              </div>
            </StCard>
          ) : null}

          {combined ? (
            <StCard title="Order History">
              <div className="tw-overflow-auto tw-rounded-card tw-border tw-border-line">
                <table className="tw-w-full tw-min-w-[780px] tw-text-left tw-text-[14px]">
                  <thead className="tw-bg-bg">
                    <tr className="tw-text-[12px] tw-text-muted">
                      <th className="tw-px-4 tw-py-3">Type</th>
                      <th className="tw-px-4 tw-py-3">Ref</th>
                      <th className="tw-px-4 tw-py-3">Date</th>
                      <th className="tw-px-4 tw-py-3">Status</th>
                      <th className="tw-px-4 tw-py-3">Delivery</th>
                      <th className="tw-px-4 tw-py-3 tw-text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(combined.orders || []).map((o: any) => {
                      if (o.type === 'ERP_SALE') {
                        return (
                          <tr key={`sale_${o.id}`} className="hover:tw-bg-slate-50">
                            <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">SALE</td>
                            <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-font-medium tw-text-ink">{o.refNo}</td>
                            <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{String(o.date).slice(0, 10)}</td>
                            <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-ink">{o.status}</td>
                            <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">—</td>
                            <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-right tw-font-medium tw-text-ink">₹{paiseToRupeesString(o.amountPaise)}</td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={`st_${o.id}`} className="hover:tw-bg-slate-50">
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">STITCH</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-font-medium tw-text-ink">{o.refNo}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{String(o.date).slice(0, 10)}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-ink">{o.status}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{String(o.deliveryDate).slice(0, 10)}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-right tw-text-muted">{o.billedAmountPaise ? `₹${paiseToRupeesString(o.billedAmountPaise)}` : '—'}</td>
                        </tr>
                      );
                    })}
                    {(combined.orders || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="tw-border-t tw-border-line tw-px-4 tw-py-10 tw-text-center tw-text-[12px] tw-text-muted">
                          No orders
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </StCard>
          ) : null}

          <StCard title="Measurement History">
            {!stitching ? (
              <div className="tw-text-[12px] tw-text-muted">No stitching profile yet. Use Create Profile to start saving measurements.</div>
            ) : stitchingMeasurementHistory.length === 0 ? (
              <div className="tw-text-[12px] tw-text-muted">No measurements</div>
            ) : (
              <div className="tw-overflow-auto tw-rounded-card tw-border tw-border-line">
                <table className="tw-w-full tw-min-w-[780px] tw-text-left tw-text-[14px]">
                  <thead className="tw-bg-bg">
                    <tr className="tw-text-[12px] tw-text-muted">
                      <th className="tw-px-4 tw-py-3">Order</th>
                      <th className="tw-px-4 tw-py-3">Date</th>
                      <th className="tw-px-4 tw-py-3">Size</th>
                      <th className="tw-px-4 tw-py-3">Measurements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stitchingMeasurementHistory.map((m) => (
                      <tr key={m.orderId} className="hover:tw-bg-slate-50">
                        <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-font-medium tw-text-ink">{m.orderCode}</td>
                        <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{String(m.createdAt).slice(0, 10)}</td>
                        <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{m.measurementProfileName || '—'}</td>
                        <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">
                          {m.measurements
                            ? Object.entries(m.measurements)
                                .slice(0, 6)
                                .map(([k, v]) => `${k}:${v}`)
                                .join(', ')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </StCard>
        </div>
      </div>
    </div>
  );
}
