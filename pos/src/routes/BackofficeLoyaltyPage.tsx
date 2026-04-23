import { useState } from 'react';
import { apiFetch } from '../lib/api';

export function BackofficeLoyaltyPage() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const p = phone.trim();
      if (!/^\d{10}$/.test(p)) throw new Error('Enter a valid 10-digit phone');
      const res = await apiFetch<any>(`/loyalty?phone=${encodeURIComponent(p)}`);
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Failed to lookup loyalty');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="boPage">

      {error && <div className="boToast">{error}</div>}

      <div className="card boCardPad">
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Customer Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn secondary" onClick={lookup} disabled={loading}>Lookup</button>
          </div>
        </div>
      </div>

      {result && (
        <div className="grid2">
          <div className="card boCardPad">
            <div className="boSectionTitle">Customer</div>
            <div style={{ fontWeight: 900 }}>{result.customer?.fullName}</div>
            <div className="muted">{result.customer?.phone || ''}</div>
            <div className="pill">Points: {result.pointsBalance ?? 0}</div>
          </div>

          <div className="card boCardPad">
            <div className="boSectionTitle">Ledger</div>
            {result.ledger?.length ? (
              <table>
                <thead>
                  <tr><th>Date</th><th>Source</th><th className="right">Points</th></tr>
                </thead>
                <tbody>
                  {result.ledger.map((l: any) => (
                    <tr key={l.id}>
                      <td>{new Date(l.createdAt).toLocaleString()}</td>
                      <td>{l.sourceType}</td>
                      <td className="right">{l.pointsDelta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted">No ledger entries</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
