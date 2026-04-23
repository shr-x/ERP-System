import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { paiseStringToBigInt, paiseToRupeesString } from '../lib/money';

type Store = { id: string; code: string; name: string };

type ReturnRow = {
  id: string;
  invoiceNo: string;
  mode: 'LOYALTY' | 'COUPON';
  amountPaise: string;
  pointsCredited: number;
  createdAt: string;
  store: { code: string; name: string };
  processedBy: { fullName: string };
  customer: { fullName: string; phone: string | null; isWalkIn: boolean };
  coupon: { code: string } | null;
};

export function BackofficeReturnsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [q, setQ] = useState('');
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStores() {
    const res = await apiFetch<{ stores: Store[] }>('/stores');
    setStores(res.stores || []);
  }

  async function loadReturns(next?: { storeId?: string; q?: string }) {
    const sid = (next?.storeId ?? storeId).trim();
    const query = (next?.q ?? q).trim();
    const qs = new URLSearchParams();
    if (sid) qs.set('storeId', sid);
    if (query) qs.set('q', query);
    const res = await apiFetch<{ returns: ReturnRow[] }>(`/sales/returns?${qs.toString()}`);
    setReturns(res.returns || []);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        await loadStores();
        if (!active) return;
        await loadReturns({ storeId: '', q: '' });
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load returns');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      await loadReturns();
    } catch (e: any) {
      setError(e?.message || 'Failed to load returns');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="boPage">
      {error && <div className="boToast">{error}</div>}

      <div className="gCard">
        <div className="gCardHd">
          <div className="gCardTitle">Returns</div>
        </div>
        <div className="gCardBd">
          <div className="gGrid2">
            <div className="gField">
              <label>Store</label>
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="gField">
              <label>Invoice No</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice no..." />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button className="gBtn ghost" onClick={() => { setStoreId(''); setQ(''); }} disabled={busy}>
              Reset
            </button>
            <button className="gBtn" onClick={search} disabled={busy}>
              {busy ? 'Loading…' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      <div className="gCard">
        <div className="gCardBd">
          {returns.length ? (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Store</th>
                  <th>Customer</th>
                  <th>Mode</th>
                  <th className="right">Amount</th>
                  <th className="right">Points</th>
                  <th>Coupon</th>
                  <th>Processed By</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={{ fontWeight: 800 }}>{r.invoiceNo}</td>
                    <td>
                      {r.store?.name} ({r.store?.code})
                    </td>
                    <td>
                      {r.customer?.isWalkIn ? 'Walk-in' : r.customer?.fullName}
                      {r.customer?.phone ? ` · ${r.customer.phone}` : ''}
                    </td>
                    <td>{r.mode}</td>
                    <td className="right">₹{paiseToRupeesString(paiseStringToBigInt(r.amountPaise))}</td>
                    <td className="right">{r.pointsCredited || 0}</td>
                    <td>{r.coupon?.code || '-'}</td>
                    <td>{r.processedBy?.fullName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="gHelp">No returns found</div>
          )}
        </div>
      </div>
    </div>
  );
}

