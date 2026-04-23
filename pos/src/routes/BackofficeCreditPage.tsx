import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { paiseStringToBigInt, paiseToRupeesString } from '../lib/money';

type CreditBalanceRow = {
  id: string;
  fullName: string;
  phone: string | null;
  gstin: string | null;
  creditBalancePaise: string;
  updatedAt: string;
};

export function BackofficeCreditPage() {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'DUES' | 'SETTLEMENTS'>('DUES');
  const [dues, setDues] = useState<CreditBalanceRow[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (tab === 'DUES') {
        const res = await apiFetch<{ dues: any[] }>(`/sales/credit-dues?${qs.toString()}`);
        setDues(res.dues || []);
      } else {
        const res = await apiFetch<{ settlements: any[] }>(`/sales/credit-settlements?${qs.toString()}`);
        setSettlements(res.settlements || []);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load credit');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load().catch(() => null);
  }, [tab]);

  return (
    <div className="boPage">
      {error && <div className="boToast">{error}</div>}

      <div className="gCard">
        <div className="gCardHd">
          <div className="gCardTitle">Customer Credit</div>
        </div>
        <div className="gCardBd">
          <div className="gRow" style={{ marginTop: 0 }}>
            <button className={`gBtn ${tab === 'DUES' ? '' : 'ghost'}`} onClick={() => setTab('DUES')} disabled={busy}>Outstanding</button>
            <button className={`gBtn ${tab === 'SETTLEMENTS' ? '' : 'ghost'}`} onClick={() => setTab('SETTLEMENTS')} disabled={busy}>Settlements</button>
          </div>
          <div className="gGrid2">
            <div className="gField">
              <label>Search</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer / phone / invoice no" />
            </div>
            <div className="gField" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
              <button className="gBtn" onClick={load} disabled={busy}>
                {busy ? 'Loading…' : 'Search'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="gCard">
        <div className="gCardBd">
          {tab === 'DUES' && dues.length ? (
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>GSTIN</th>
                  <th className="right">Credit Due</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 900 }}>{r.fullName}</td>
                    <td>{r.phone || '—'}</td>
                    <td>{r.gstin || '—'}</td>
                    <td className="right">₹{paiseToRupeesString(paiseStringToBigInt(r.creditDuePaise))}</td>
                    <td>{new Date(r.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : tab === 'SETTLEMENTS' && settlements.length ? (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th>Store</th>
                  <th>Method</th>
                  <th className="right">Amount</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((r: any) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={{ fontWeight: 900 }}>{r.customer.fullName}{r.customer.phone ? ` · ${r.customer.phone}` : ''}</td>
                    <td>{r.salesInvoice?.invoiceNo || '—'}</td>
                    <td>{r.store.name} ({r.store.code})</td>
                    <td>{r.method}{r.upiRef ? ` (${r.upiRef})` : ''}</td>
                    <td className="right">₹{paiseToRupeesString(paiseStringToBigInt(r.amountPaise))}</td>
                    <td>{r.createdBy.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="gHelp">{tab === 'DUES' ? 'No credit dues' : 'No settlements'}</div>
          )}
        </div>
      </div>
    </div>
  );
}
