import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

type FeedbackRow = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  customerName: string;
  invoice: { invoiceNo: string; store: { code: string; name: string } };
};

export function BackofficeFeedbackPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      const res = await apiFetch<{ feedbacks: FeedbackRow[] }>(`/feedback?${qs.toString()}`);
      setRows(res.feedbacks || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load feedback');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load().catch(() => null);
  }, []);

  return (
    <div className="boPage">
      {error && <div className="boToast">{error}</div>}

      <div className="gCard">
        <div className="gCardHd">
          <div className="gCardTitle">Feedback</div>
        </div>
        <div className="gCardBd">
          <div className="gGrid2">
            <div className="gField">
              <label>Search (customer name)</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. poojith" />
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
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th>Store</th>
                  <th className="right">Rating</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={{ fontWeight: 900 }}>{r.customerName}</td>
                    <td>{r.invoice.invoiceNo}</td>
                    <td>
                      {r.invoice.store.name} ({r.invoice.store.code})
                    </td>
                    <td className="right">{r.rating}</td>
                    <td>{r.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="gHelp">No feedback yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

