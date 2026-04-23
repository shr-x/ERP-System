import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, downloadWithAuth } from '../lib/api';
import { paiseToRupeesString, rupeesToPaiseBigInt } from '../lib/money';

type Account = { id: string; code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY' };

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthRangeYmd(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const toYmd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: toYmd(start), end: toYmd(end) };
}

function nanoid() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

function newBlankLines() {
  return [
    { id: nanoid(), accountId: '', debitRupees: 0, creditRupees: 0 },
    { id: nanoid(), accountId: '', debitRupees: 0, creditRupees: 0 }
  ];
}

function formatAccountType(t: Account['type']) {
  if (t === 'ASSET') return 'Assets';
  if (t === 'LIABILITY') return 'Liabilities';
  if (t === 'INCOME') return 'Income';
  if (t === 'EXPENSE') return 'Expense';
  return 'Equity';
}

async function downloadFile(path: string, filename: string) {
  const dl = await downloadWithAuth(path);
  const url = URL.createObjectURL(dl.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function BackofficeAccountingPage() {
  const range = monthRangeYmd(new Date());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [periodStart, setPeriodStart] = useState(range.start);
  const [periodEnd, setPeriodEnd] = useState(range.end);
  const [pl, setPl] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [entryDate, setEntryDate] = useState(todayYmd());
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<Array<{ id: string; accountId: string; debitRupees: number; creditRupees: number }>>(newBlankLines());
  const accountSelectRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  const debitInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const creditInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        const coa = await apiFetch<{ accounts: Account[] }>('/accounting/coa');
        if (!active) return;
        setAccounts(coa.accounts);
        const je = await apiFetch<{ entries: any[] }>('/accounting/journal-entries');
        if (!active) return;
        setEntries(je.entries);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load accounting');
      }
    })();
    return () => {
      active = false;
    };
  }, []);


  const normalizedLines = useMemo(() => {
    return lines.map((l) => ({
      ...l,
      debitRupees: Number.isFinite(l.debitRupees) ? l.debitRupees : 0,
      creditRupees: Number.isFinite(l.creditRupees) ? l.creditRupees : 0
    }));
  }, [lines]);

  const manualState = useMemo(() => {
    const rowErrors: Record<string, string[]> = {};
    const postingLines: Array<{ id: string; accountId: string; debitRupees: number; creditRupees: number }> = [];
    let debit = 0n;
    let credit = 0n;

    for (const l of normalizedLines) {
      const meaningful = !!l.accountId || l.debitRupees > 0 || l.creditRupees > 0;
      if (!meaningful) continue;

      const errs: string[] = [];
      if (!l.accountId) errs.push('Select an account');
      const dPos = l.debitRupees > 0;
      const cPos = l.creditRupees > 0;
      if (dPos && cPos) errs.push('Enter debit OR credit (not both)');
      if (!dPos && !cPos) errs.push('Enter an amount');
      if (l.debitRupees < 0 || l.creditRupees < 0) errs.push('Amount cannot be negative');

      if (errs.length) {
        rowErrors[l.id] = errs;
        continue;
      }

      const d = rupeesToPaiseBigInt(l.debitRupees || 0);
      const c = rupeesToPaiseBigInt(l.creditRupees || 0);
      debit += d;
      credit += c;
      postingLines.push(l);
    }

    const diff = debit - credit;
    const minRowsOk = postingLines.length >= 2;
    const balanced = diff === 0n && debit > 0n && minRowsOk && Object.keys(rowErrors).length === 0;
    return { debit, credit, diff, balanced, rowErrors, postingLines, minRowsOk };
  }, [normalizedLines]);

  async function setupAccounts() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/accounting/setup-system-accounts', { method: 'POST' });
      const coa = await apiFetch<{ accounts: Account[] }>('/accounting/coa');
      setAccounts(coa.accounts);
    } catch (e: any) {
      setError(e?.message || 'Failed to initialize accounts');
    } finally {
      setLoading(false);
    }
  }

  async function exportJournal(format: 'XLSX' | 'JSON') {
    setLoading(true);
    setError(null);
    try {
      await downloadFile(
        `/accounting/journal-entries/export?periodStart=${periodStart}&periodEnd=${periodEnd}&format=${format}`,
        `journal_${periodStart}_${periodEnd}.${format === 'XLSX' ? 'xlsx' : 'json'}`
      );
    } catch (e: any) {
      setError(e?.message || 'Failed to export journal');
    } finally {
      setLoading(false);
    }
  }

  async function loadPL() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ report: any }>(`/accounting/reports/profit-loss?periodStart=${periodStart}&periodEnd=${periodEnd}`);
      setPl(res.report);
    } catch (e: any) {
      setError(e?.message || 'Failed to load P&L');
    } finally {
      setLoading(false);
    }
  }

  async function createManualEntry() {
    setLoading(true);
    setError(null);
    try {
      if (!manualState.minRowsOk) throw new Error('At least 2 rows are required');
      if (!manualState.balanced) throw new Error('Entry not balanced');
      const payload = {
        entryDate,
        narration: narration.trim() || 'Manual journal',
        lines: manualState.postingLines.map((l) => ({
          accountId: l.accountId,
          ...(l.debitRupees ? { debitRupees: l.debitRupees } : {}),
          ...(l.creditRupees ? { creditRupees: l.creditRupees } : {})
        }))
      };
      await apiFetch('/accounting/journal-entries/manual', { method: 'POST', body: JSON.stringify(payload) });
      const je = await apiFetch<{ entries: any[] }>('/accounting/journal-entries');
      setEntries(je.entries);
      setNarration('');
      setLines(newBlankLines());
    } catch (e: any) {
      setError(e?.message || 'Failed to create journal entry');
    } finally {
      setLoading(false);
    }
  }

  function addRow(focus: 'account' | 'debit' | 'credit' = 'account') {
    const id = nanoid();
    setLines((prev) => [...prev, { id, accountId: '', debitRupees: 0, creditRupees: 0 }]);
    setTimeout(() => {
      if (focus === 'debit') debitInputRefs.current[id]?.focus();
      else if (focus === 'credit') creditInputRefs.current[id]?.focus();
      else accountSelectRefs.current[id]?.focus();
    }, 0);
  }

  function removeRow(id: string) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((x) => x.id !== id)));
  }

  function clearRows() {
    setLines(newBlankLines());
  }

  return (
    <div className="boPage accMinPage">
      {error && <div className="boToast">{error}</div>}

      <div className="accMinHeader">
        <div className="accMinActions">
          <button className="gBtn ghost" onClick={() => exportJournal('XLSX')} disabled={loading}>Export Journal XLSX</button>
          <button className="gBtn ghost" onClick={() => exportJournal('JSON')} disabled={loading}>Export Journal JSON</button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="accMinSetup">
          <div style={{ fontWeight: 800 }}>Setup required</div>
          <button className="gBtn ghost" onClick={setupAccounts} disabled={loading}>Initialize Accounts</button>
        </div>
      ) : null}

      <div className="accPlMini">
        <div className="accPlMiniHd">
          <div style={{ fontWeight: 800, color: '#111827' }}>Profit &amp; Loss</div>
          <button className="gBtn ghost" onClick={loadPL} disabled={loading}>Run</button>
        </div>
        <div className="accPlMiniBd">
          <div className="accPlMiniRange">
            <input className="accMinInput" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            <input className="accMinInput" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div className="accPlMiniRows">
            <div><span>Revenue</span><span>₹ {paiseToRupeesString(BigInt(pl?.totalIncomePaise || '0'))}</span></div>
            <div><span>Expenses</span><span>₹ {paiseToRupeesString(BigInt(pl?.totalExpensePaise || '0'))}</span></div>
            <div className="net"><span>Net Profit</span><span>₹ {paiseToRupeesString(BigInt(pl?.netProfitPaise || '0'))}</span></div>
          </div>
        </div>
      </div>

      <div className="accMinPanel">
        <div className="accMinEntryHdr">
          <input className="accMinInput" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          <input className="accMinInput" value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Narration" />
        </div>

        <div className="accMinTable">
          <div className="accMinHead">
            <div>Account</div>
            <div>Debit</div>
            <div>Credit</div>
            <div></div>
          </div>
          {lines.map((l, idx) => {
            const errs = manualState.rowErrors[l.id] || [];
            const side = l.creditRupees > 0 ? 'CREDIT' : l.debitRupees > 0 ? 'DEBIT' : 'NONE';
            const typeOrder: Array<Account['type']> =
              side === 'CREDIT' ? ['LIABILITY', 'INCOME', 'EQUITY', 'ASSET', 'EXPENSE'] : ['ASSET', 'EXPENSE', 'EQUITY', 'LIABILITY', 'INCOME'];
            const byType = new Map<Account['type'], Account[]>();
            for (const t of typeOrder) byType.set(t, []);
            for (const a of accounts) {
              const list = byType.get(a.type) || [];
              list.push(a);
              byType.set(a.type, list);
            }
            for (const t of typeOrder) {
              const list = byType.get(t) || [];
              list.sort((a, b) => a.name.localeCompare(b.name));
              byType.set(t, list);
            }

            return (
              <div key={l.id} className="accMinRow">
                <div style={{ minWidth: 0 }}>
                  <select
                    className="accMinSelect"
                    ref={(el) => { accountSelectRefs.current[l.id] = el; }}
                    value={l.accountId}
                    onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, accountId: e.target.value } : x)))}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      debitInputRefs.current[l.id]?.focus();
                    }}
                  >
                    <option value="">Select account…</option>
                    {typeOrder.map((t) => {
                      const list = byType.get(t) || [];
                      if (!list.length) return null;
                      return (
                        <optgroup key={t} label={formatAccountType(t)}>
                          {list.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.code})
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  {errs.length ? <div className="accMinErr">{errs.join(' • ')}</div> : null}
                </div>
                <div>
                  <input
                    className="accMinInput"
                    ref={(el) => { debitInputRefs.current[l.id] = el; }}
                    type="number"
                    value={String(l.debitRupees || 0)}
                    onChange={(e) => {
                      const next = Number(e.target.value || 0);
                      setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, debitRupees: next, creditRupees: next > 0 ? 0 : x.creditRupees } : x)));
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const nextRow = lines[idx + 1];
                      if (nextRow) debitInputRefs.current[nextRow.id]?.focus();
                      else addRow('debit');
                    }}
                  />
                </div>
                <div>
                  <input
                    className="accMinInput"
                    ref={(el) => { creditInputRefs.current[l.id] = el; }}
                    type="number"
                    value={String(l.creditRupees || 0)}
                    onChange={(e) => {
                      const next = Number(e.target.value || 0);
                      setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, creditRupees: next, debitRupees: next > 0 ? 0 : x.debitRupees } : x)));
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const nextRow = lines[idx + 1];
                      if (nextRow) creditInputRefs.current[nextRow.id]?.focus();
                      else addRow('credit');
                    }}
                  />
                </div>
                <button className="accMinDel" onClick={() => removeRow(l.id)} disabled={lines.length <= 2} aria-label="Remove row">×</button>
              </div>
            );
          })}
        </div>

        <div className="accMinTotals">
          <div>Total Debit: ₹ {paiseToRupeesString(manualState.debit)}</div>
          <div>Total Credit: ₹ {paiseToRupeesString(manualState.credit)}</div>
          <div>Difference: {manualState.diff < 0n ? '-' : ''}₹{paiseToRupeesString(manualState.diff < 0n ? -manualState.diff : manualState.diff)}</div>
          <div className={`accMinStatus ${manualState.balanced ? 'ok' : 'bad'}`}>{manualState.balanced ? 'Balanced' : 'Not balanced'}</div>
        </div>

        <div className="accMinFooter">
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="gBtn ghost" onClick={() => addRow()} disabled={loading}>+ Add Row</button>
            <button className="gBtn ghost" onClick={clearRows} disabled={loading}>Clear</button>
          </div>
          <button className="gBtn" onClick={createManualEntry} disabled={!manualState.balanced || loading}>Post Entry</button>
        </div>
      </div>

      <div className="gCard" style={{ marginTop: 16 }}>
        <div className="gCardHd">
          <div className="gCardTitle">Recent Journal Entries</div>
        </div>
        <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.length === 0 && <div style={{ color: 'var(--pos-muted)', fontSize: 14 }}>No journal entries</div>}
          {entries.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 14 }}>{e.narration}</div>
                <div style={{ color: 'var(--pos-muted)', fontSize: 12 }}>{new Date(e.entryDate).toLocaleString()} • {e.sourceType} • {e.status}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {e.gst ? (
                  <div style={{ fontSize: 12, color: 'var(--pos-muted)' }}>
                    {e.gst.type === 'SALE' ? `Invoice: ${e.gst.invoiceNo}` : `Purchase: ${e.gst.supplierInvoiceNo}`} 
                  </div>
                ) : null}
                {e.orderValuePaise ? (
                  <div className="boPill" style={{ fontWeight: 900 }}>
                    ₹ {paiseToRupeesString(BigInt(e.orderValuePaise))}
                    {e.gst?.taxTotalPaise ? ` • GST ₹ ${paiseToRupeesString(BigInt(e.gst.taxTotalPaise))}` : ''}
                  </div>
                ) : e.totalDebitPaise ? (
                  <div className="boPill" style={{ fontWeight: 900 }}>₹ {paiseToRupeesString(BigInt(e.totalDebitPaise))}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
