import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';

type Customer = {
  id: string;
  fullName: string;
  phone?: string | null;
  gstin?: string | null;
  isBusiness?: boolean | null;
  stateCode?: string | null;
  address?: string | null;
  pincode?: string | null;
  isBlocked?: boolean | null;
  blockedAt?: string | null;
};

type CustomerOrdersResponse = {
  customer: { id: string; fullName: string; phone?: string | null };
  loyaltyPoints: number;
  stitchingProfile: null | { id: string; notes?: string | null; updatedAt: string };
  orders: Array<
    | { type: 'ERP_SALE'; id: string; refNo: string; date: string; amountPaise: string; status: string }
    | {
        type: 'STITCHING';
        id: string;
        refNo: string;
        date: string;
        deliveryDate: string;
        status: string;
        erpInvoiceId?: string | null;
        billedAmountPaise?: string | null;
        billedInvoiceNo?: string | null;
        template?: { id: string; name: string; category: string };
      }
  >;
};

function paiseToRupeesString(paise: string) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '0.00';
  return (n / 100).toFixed(2);
}

export function BackofficeCustomersPage() {
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [isBusiness, setIsBusiness] = useState(false);
  const [stateCode, setStateCode] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [crmOpen, setCrmOpen] = useState(false);
  const [crmCustomerId, setCrmCustomerId] = useState<string | null>(null);
  const [crm, setCrm] = useState<CustomerOrdersResponse | null>(null);
  const [crmStitchingNotes, setCrmStitchingNotes] = useState('');

  const editingCustomer = useMemo(() => customers.find((c) => c.id === editingId) || null, [customers, editingId]);

  async function load() {
    const res = await apiFetch<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(q.trim())}`);
    setCustomers(res.customers);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        await load();
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load customers');
      }
    })();
    return () => {
      active = false;
    };
  }, [q]);

  async function createCustomer() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/customers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          gstin: gstin.trim() || undefined,
          isBusiness,
          stateCode: stateCode.trim() || undefined,
          address: address.trim() || undefined,
          pincode: pincode.trim() || undefined
        })
      });
      setCreateOpen(false);
      setFullName('');
      setPhone('');
      setGstin('');
      setIsBusiness(false);
      setStateCode('');
      setAddress('');
      setPincode('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to create customer');
    } finally {
      setBusy(false);
    }
  }

  function openEdit(c: Customer) {
    setEditingId(c.id);
    setFullName(c.fullName || '');
    setPhone(c.phone || '');
    setGstin(c.gstin || '');
    setIsBusiness(!!c.isBusiness);
    setStateCode(c.stateCode || '');
    setAddress(c.address || '');
    setPincode(c.pincode || '');
    setEditOpen(true);
  }

  function openCrm(c: Customer) {
    setCrmCustomerId(c.id);
    setCrmOpen(true);
    setCrm(null);
    setCrmStitchingNotes('');
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!crmOpen || !crmCustomerId) return;
      try {
        const res = await apiFetch<CustomerOrdersResponse>(`/customers/${crmCustomerId}/orders`);
        if (!active) return;
        setCrm(res);
        setCrmStitchingNotes(res.stitchingProfile?.notes || '');
      } catch {
        if (!active) return;
        setCrm(null);
        setCrmStitchingNotes('');
      }
    })();
    return () => {
      active = false;
    };
  }, [crmOpen, crmCustomerId]);

  async function saveCrmStitchingNotes() {
    if (!crmCustomerId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/customers/${crmCustomerId}/stitching`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: crmStitchingNotes })
      });
      const res = await apiFetch<CustomerOrdersResponse>(`/customers/${crmCustomerId}/orders`);
      setCrm(res);
      setCrmStitchingNotes(res.stitchingProfile?.notes || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to save stitching notes');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/customers/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          gstin: gstin.trim() || undefined,
          isBusiness,
          stateCode: stateCode.trim() || undefined,
          address: address.trim() || undefined,
          pincode: pincode.trim() || undefined
        })
      });
      setEditOpen(false);
      setEditingId(null);
      setFullName('');
      setPhone('');
      setGstin('');
      setIsBusiness(false);
      setStateCode('');
      setAddress('');
      setPincode('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to update customer');
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock(c: Customer) {
    setBusy(true);
    setError(null);
    try {
      if (c.isBlocked) await apiFetch(`/customers/${c.id}/unblock`, { method: 'PATCH' });
      else await apiFetch(`/customers/${c.id}/block`, { method: 'PATCH' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to update customer');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCustomer(c: Customer) {
    setDeleteConfirm(c);
  }

  async function confirmDeleteCustomer() {
    const c = deleteConfirm;
    if (!c) return;
    setDeleteConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/customers/${c.id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete customer');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="boPage">
      {error && <div className="boToast">{error}</div>}

      {deleteConfirm ? (
        <div className="gModalBack" onMouseDown={() => setDeleteConfirm(null)}>
          <div className="gModal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Delete Customer</div>
              <button className="gBtn ghost" onClick={() => setDeleteConfirm(null)} disabled={busy}>
                Close
              </button>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>Delete customer "{deleteConfirm.fullName}"?</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost" onClick={() => setDeleteConfirm(null)} disabled={busy}>
                  Cancel
                </button>
                <button className="gBtn danger" onClick={confirmDeleteCustomer} disabled={busy}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="gCard">
        <div className="gCardHd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="gCardTitle">Customers</div>
          <button className="gBtn" onClick={() => setCreateOpen(true)}>+ Add Customer</button>
        </div>
        <div className="gCardBd">
          <div className="gRow">
            <div className="gField" style={{ flex: 1 }}>
              <label>Search</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" />
            </div>
          </div>
        </div>
      </div>

      <div className="gCard">
        <div className="gCardHd">
          <div className="gCardTitle">Saved Customers</div>
        </div>
        <div className="gCardBd" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>GSTIN</th>
                <th>State</th>
                <th>Status</th>
                <th className="right"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button
                      className="gBtn ghost mini"
                      style={{ fontWeight: 900 }}
                      onClick={() => openCrm(c)}
                      disabled={busy}
                      type="button"
                    >
                      {c.fullName}
                    </button>
                  </td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.isBusiness ? (c.gstin ?? '—') : '—'}</td>
                  <td>{c.stateCode ?? '—'}</td>
                  <td>{c.isBlocked ? 'Blocked' : 'Active'}</td>
                  <td className="right">
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="gBtn ghost" onClick={() => openEdit(c)} disabled={busy}>Edit</button>
                      <button className="gBtn ghost danger" onClick={() => toggleBlock(c)} disabled={busy}>
                        {c.isBlocked ? 'Unblock' : 'Block'}
                      </button>
                      <button className="gBtn ghost danger" onClick={() => deleteCustomer(c)} disabled={busy}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={6} style={{ color: 'var(--pos-muted)' }}>No customers</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <div className="gModalBack" onClick={() => !busy && setCreateOpen(false)}>
          <div className="gModal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>New Customer</div>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gField">
                <label>Full Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="gGrid2">
                <div className="gField">
                  <label>Phone (optional)</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
                </div>
                <div className="gField">
                  <label>State Code (optional)</label>
                  <input value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="e.g. 29" />
                </div>
              </div>
              <div className="gField">
                <label>Address (optional)</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Billing address" />
              </div>
              <div className="gGrid2">
                <div className="gField">
                  <label>Pincode (optional)</label>
                  <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="560049" />
                </div>
                <div className="gField" />
              </div>
              <div className="gGrid2">
                <div className="gField">
                  <label>GSTIN (optional)</label>
                  <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" />
                </div>
                <div className="gField">
                  <label>Customer Type</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42 }}>
                    <input type="checkbox" checked={isBusiness} onChange={(e) => setIsBusiness(e.target.checked)} />
                    <div style={{ fontWeight: 800 }}>Business (B2B)</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button>
                <button className="gBtn" onClick={createCustomer} disabled={busy || fullName.trim().length < 2}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="gModalBack" onClick={() => !busy && setEditOpen(false)}>
          <div className="gModal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Edit Customer</div>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gField">
                <label>Full Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="gGrid2">
                <div className="gField">
                  <label>Phone (optional)</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
                </div>
                <div className="gField">
                  <label>State Code (optional)</label>
                  <input value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="e.g. 29" />
                </div>
              </div>
              <div className="gField">
                <label>Address (optional)</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Billing address" />
              </div>
              <div className="gGrid2">
                <div className="gField">
                  <label>Pincode (optional)</label>
                  <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="560049" />
                </div>
                <div className="gField" />
              </div>
              <div className="gGrid2">
                <div className="gField">
                  <label>GSTIN (optional)</label>
                  <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" />
                </div>
                <div className="gField">
                  <label>Customer Type</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42 }}>
                    <input type="checkbox" checked={isBusiness} onChange={(e) => setIsBusiness(e.target.checked)} />
                    <div style={{ fontWeight: 800 }}>Business (B2B)</div>
                  </div>
                </div>
              </div>

              {editingCustomer?.isBlocked ? (
                <div className="gHelp">This customer is blocked and POS billing will be rejected.</div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost" onClick={() => setEditOpen(false)} disabled={busy}>Cancel</button>
                <button className="gBtn" onClick={saveEdit} disabled={busy || fullName.trim().length < 2}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {crmOpen && (
        <div
          className="gModalBack"
          onMouseDown={() => {
            if (busy) return;
            setCrmOpen(false);
            setCrmCustomerId(null);
          }}
        >
          <div className="gModal" style={{ maxWidth: 980 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 900 }}>Customer</div>
              <button
                className="gBtn ghost"
                onClick={() => {
                  setCrmOpen(false);
                  setCrmCustomerId(null);
                }}
                disabled={busy}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!crm ? (
                <div className="muted">Loading…</div>
              ) : (
                <>
                  <div className="gCard" style={{ margin: 0 }}>
                    <div className="gCardHd"><div className="gCardTitle">Summary</div></div>
                    <div className="gCardBd" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <div className="muted">Customer</div>
                        <div style={{ fontWeight: 900 }}>{crm.customer.fullName}</div>
                        <div className="muted">{crm.customer.phone || 'Walk-in'}</div>
                      </div>
                      <div>
                        <div className="muted">Loyalty Points</div>
                        <div style={{ fontWeight: 900 }}>{crm.loyaltyPoints ?? 0}</div>
                      </div>
                      <div>
                        <div className="muted">Orders</div>
                        <div style={{ fontWeight: 900 }}>{(crm.orders || []).length}</div>
                      </div>
                    </div>
                  </div>

                  <div className="gCard" style={{ margin: 0 }}>
                    <div className="gCardHd"><div className="gCardTitle">Stitching Notes</div></div>
                    <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <textarea
                        value={crmStitchingNotes}
                        onChange={(e) => setCrmStitchingNotes(e.target.value)}
                        placeholder="Notes (optional)"
                        rows={4}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button className="gBtn" onClick={saveCrmStitchingNotes} disabled={busy} type="button">
                          Save Notes
                        </button>
                      </div>
                      <div className="muted">
                        {crm.stitchingProfile ? `Last updated: ${String(crm.stitchingProfile.updatedAt).slice(0, 19).replace('T', ' ')}` : 'No stitching profile yet.'}
                      </div>
                    </div>
                  </div>

                  <div className="gCard" style={{ margin: 0 }}>
                    <div className="gCardHd"><div className="gCardTitle">Order History</div></div>
                    <div className="gCardBd" style={{ overflow: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Ref</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Delivery</th>
                            <th>Invoice</th>
                            <th className="right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(crm.orders || []).map((o) => {
                            if (o.type === 'ERP_SALE') {
                              return (
                                <tr key={`sale_${o.id}`}>
                                  <td className="muted">SALE</td>
                                  <td style={{ fontWeight: 900 }}>{o.refNo}</td>
                                  <td className="muted">{String(o.date).slice(0, 10)}</td>
                                  <td>{o.status}</td>
                                  <td className="muted">—</td>
                                  <td className="muted">—</td>
                                  <td className="right" style={{ fontWeight: 900 }}>₹{paiseToRupeesString(o.amountPaise)}</td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={`st_${o.id}`}>
                                <td className="muted">STITCH</td>
                                <td style={{ fontWeight: 900 }}>{o.refNo}</td>
                                <td className="muted">{String(o.date).slice(0, 10)}</td>
                                <td>{o.status}</td>
                                <td className="muted">{String(o.deliveryDate).slice(0, 10)}</td>
                                <td className="muted">{o.billedInvoiceNo || '—'}</td>
                                <td className="right" style={{ fontWeight: 900 }}>
                                  {o.billedAmountPaise ? `₹${paiseToRupeesString(o.billedAmountPaise)}` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                          {(crm.orders || []).length === 0 ? (
                            <tr><td colSpan={7} className="muted">No orders</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
