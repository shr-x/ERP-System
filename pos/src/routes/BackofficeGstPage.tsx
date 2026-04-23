import { useEffect, useState } from 'react';
import { apiFetch, downloadWithAuth } from '../lib/api';
import { getAuth } from '../lib/auth';
import { paiseToRupeesString } from '../lib/money';

function monthRangeYmd(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const toYmd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: toYmd(start), end: toYmd(end) };
}

export function BackofficeGstPage() {
  const auth = getAuth();
  const storeId = auth?.user.storeId;

  const range = monthRangeYmd(new Date());
  const [periodStart, setPeriodStart] = useState(range.start);
  const [periodEnd, setPeriodEnd] = useState(range.end);
  const [tab, setTab] = useState<'SUMMARY' | 'ITC' | 'GSTR1'>('SUMMARY');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [itcRows, setItcRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadSummary() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<any>('/gst/gstr3b/summary', {
        method: 'POST',
        body: JSON.stringify({ periodStart, periodEnd, ...(storeId ? { storeId } : {}) })
      });
      setSummary(res.summaryPaise || res.summary || res);
    } catch (e: any) {
      setError(e?.message || 'Failed to load GSTR-3B summary');
    } finally {
      setLoading(false);
    }
  }

  async function loadItcRegister() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ rows: any[] }>('/gst/itc-register', {
        method: 'POST',
        body: JSON.stringify({ periodStart, periodEnd, ...(storeId ? { storeId } : {}) })
      });
      setItcRows(res.rows);
    } catch (e: any) {
      setError(e?.message || 'Failed to load ITC register');
    } finally {
      setLoading(false);
    }
  }

  async function exportReport(format: 'XLSX' | 'PDF' | 'JSON') {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ export: { id: string } }>(`/gst/gstr3b/export?format=${format}`, {
        method: 'POST',
        body: JSON.stringify({ periodStart, periodEnd, ...(storeId ? { storeId } : {}) })
      });
      const dl = await downloadWithAuth(`/gst/exports/${res.export.id}/download`);
      const url = URL.createObjectURL(dl.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GSTR3B_${periodStart}_${periodEnd}.${format === 'XLSX' ? 'xlsx' : format === 'PDF' ? 'pdf' : 'json'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || 'Failed to export');
    } finally {
      setLoading(false);
    }
  }

  async function exportGstr1(format: 'XLSX' | 'PDF' | 'JSON') {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ export: { id: string } }>(`/gst/gstr1/export?format=${format}`, {
        method: 'POST',
        body: JSON.stringify({ periodStart, periodEnd, ...(storeId ? { storeId } : {}) })
      });
      const dl = await downloadWithAuth(`/gst/exports/${res.export.id}/download`);
      const url = URL.createObjectURL(dl.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GSTR1_${periodStart}_${periodEnd}.${format === 'XLSX' ? 'xlsx' : format === 'PDF' ? 'pdf' : 'json'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      const issues = e?.details && typeof e.details === 'object' ? (e.details as any).issues : null;
      if (Array.isArray(issues) && issues.length) {
        const msg = issues
          .slice(0, 10)
          .map((x: any) => `${x.invoiceNo ? `${x.invoiceNo}: ` : ''}${x.message}${x.line ? ` (${x.line})` : ''}`)
          .join(' | ');
        setError(`GSTR-1 validation failed: ${msg}`);
      } else {
        setError(e?.message || 'Failed to export GSTR-1');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'SUMMARY') loadSummary().catch(() => null);
    if (tab === 'ITC') loadItcRegister().catch(() => null);
  }, [periodStart, periodEnd, tab]);

  const money = (paiseStr: string) => `₹ ${paiseToRupeesString(BigInt(paiseStr || '0'))}`;

  return (
    <div className="boPage">

      {error && <div className="boToast">{error}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button className={`gBtn ${tab !== 'SUMMARY' ? 'ghost' : ''}`} onClick={() => setTab('SUMMARY')}>GSTR-3B Summary</button>
        <button className={`gBtn ${tab !== 'ITC' ? 'ghost' : ''}`} onClick={() => setTab('ITC')}>ITC Register</button>
        <button className={`gBtn ${tab !== 'GSTR1' ? 'ghost' : ''}`} onClick={() => setTab('GSTR1')}>GSTR-1 Export</button>
      </div>

      <div className="gCard">
        <div className="gCardBd">
          <div className="gRow">
            <div className="gField" style={{ flex: 1 }}>
              <label>Period Start</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="gField" style={{ flex: 1 }}>
              <label>Period End</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              {tab === 'SUMMARY' ? (
                <>
                  <button className="gBtn ghost" onClick={loadSummary} disabled={loading}>Refresh</button>
                  <button className="gBtn ghost" onClick={() => exportReport('XLSX')} disabled={loading}>Export XLSX</button>
                  <button className="gBtn ghost" onClick={() => exportReport('PDF')} disabled={loading}>Export PDF</button>
                  <button className="gBtn ghost" onClick={() => exportReport('JSON')} disabled={loading}>Export JSON</button>
                </>
              ) : tab === 'GSTR1' ? (
                <>
                  <button className="gBtn ghost" onClick={() => exportGstr1('XLSX')} disabled={loading}>Export GSTR-1 XLSX</button>
                  <button className="gBtn ghost" onClick={() => exportGstr1('JSON')} disabled={loading}>Export GSTR-1 JSON</button>
                </>
              ) : (
                <button className="gBtn ghost" onClick={loadItcRegister} disabled={loading}>Refresh</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {tab === 'GSTR1' ? (
        <div className="gCard">
          <div className="gCardHd">
            <div className="gCardTitle">GSTR-1 Export</div>
          </div>
          <div className="gCardBd">
            <div className="gHelp">
              Export includes B2B, B2C, HSN Summary, and Document Summary sheets. Only finalized (posted) invoices are included.
              If validation fails (missing GSTIN for B2B or missing HSN), the export will be blocked until fixed.
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'SUMMARY' && !summary && <div className="muted">No summary yet</div>}

      {tab === 'SUMMARY' && summary && (
        <div className="grid2">
          <div className="card boCardPad">
            <div className="boSectionTitle">Output Tax</div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">Taxable value</div><div style={{ fontWeight: 900 }}>{money(summary.output_taxable_value_paise)}</div></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">CGST</div><div style={{ fontWeight: 900 }}>{money(summary.output_cgst_paise)}</div></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">SGST</div><div style={{ fontWeight: 900 }}>{money(summary.output_sgst_paise)}</div></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">IGST</div><div style={{ fontWeight: 900 }}>{money(summary.output_igst_paise)}</div></div>
          </div>

          <div className="card boCardPad">
            <div className="boSectionTitle">Input Tax Credit (ITC)</div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">Taxable value</div><div style={{ fontWeight: 900 }}>{money(summary.input_taxable_value_paise)}</div></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">ITC CGST</div><div style={{ fontWeight: 900 }}>{money(summary.itc_available_cgst_paise)}</div></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">ITC SGST</div><div style={{ fontWeight: 900 }}>{money(summary.itc_available_sgst_paise)}</div></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">ITC IGST</div><div style={{ fontWeight: 900 }}>{money(summary.itc_available_igst_paise)}</div></div>
          </div>

          <div className="card boCardPad">
            <div className="boSectionTitle">ITC Utilization</div>
            <table>
              <thead>
                <tr><th>Set-off</th><th className="right">Amount</th></tr>
              </thead>
              <tbody>
                <tr><td>IGST → IGST</td><td className="right">{money(summary.itc_utilized_igst_to_igst_paise)}</td></tr>
                <tr><td>IGST → CGST</td><td className="right">{money(summary.itc_utilized_igst_to_cgst_paise)}</td></tr>
                <tr><td>IGST → SGST</td><td className="right">{money(summary.itc_utilized_igst_to_sgst_paise)}</td></tr>
                <tr><td>CGST → CGST</td><td className="right">{money(summary.itc_utilized_cgst_to_cgst_paise)}</td></tr>
                <tr><td>CGST → IGST</td><td className="right">{money(summary.itc_utilized_cgst_to_igst_paise)}</td></tr>
                <tr><td>SGST → SGST</td><td className="right">{money(summary.itc_utilized_sgst_to_sgst_paise)}</td></tr>
                <tr><td>SGST → IGST</td><td className="right">{money(summary.itc_utilized_sgst_to_igst_paise)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card boCardPad">
            <div className="boSectionTitle">Net Payable (Cash)</div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">CGST</div><div style={{ fontWeight: 900 }}>{money(summary.net_payable_cash_cgst_paise)}</div></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">SGST</div><div style={{ fontWeight: 900 }}>{money(summary.net_payable_cash_sgst_paise)}</div></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div className="muted">IGST</div><div style={{ fontWeight: 900 }}>{money(summary.net_payable_cash_igst_paise)}</div></div>
          </div>
        </div>
      )}

      {tab === 'ITC' && (
        <div className="gCard">
          <div className="gCardHd">
            <div className="gCardTitle">ITC Register (Purchases)</div>
          </div>
          <div className="gCardBd" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Invoice</th>
                  <th className="right">Taxable</th>
                  <th className="right">CGST</th>
                  <th className="right">SGST</th>
                  <th className="right">IGST</th>
                  <th className="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {itcRows.map((r, idx) => (
                  <tr key={`${r.supplier_invoice_no}-${idx}`}>
                    <td>{new Date(r.invoice_date).toLocaleDateString()}</td>
                    <td>
                      <div style={{ fontWeight: 900 }}>{r.supplier_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--pos-muted)' }}>{r.supplier_gstin || '—'}</div>
                    </td>
                    <td>{r.supplier_invoice_no}</td>
                    <td className="right">{money(r.taxable_value_paise)}</td>
                    <td className="right">{money(r.cgst_paise)}</td>
                    <td className="right">{money(r.sgst_paise)}</td>
                    <td className="right">{money(r.igst_paise)}</td>
                    <td className="right" style={{ fontWeight: 900 }}>{money(r.total_paise)}</td>
                  </tr>
                ))}
                {itcRows.length === 0 && (
                  <tr><td colSpan={8} style={{ color: 'var(--pos-muted)' }}>No purchase invoices in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
