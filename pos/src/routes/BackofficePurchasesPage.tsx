import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { getAuth } from '../lib/auth';
import { mulPaiseByQtyMilli, mulPaiseByRateBp, paiseToRupeesString, qtyToMilliBigInt, rupeesToPaiseBigInt } from '../lib/money';

type Store = { id: string; name: string; stateCode: string };
type Warehouse = { id: string; name: string };
type Product = { id: string; code: string; name: string; sizeLabel?: string; parentProductId?: string | null; hsnCode: string; gstRateBp: number };
type Supplier = { id: string; name: string; gstin?: string | null; stateCode?: string | null };

type PurchaseDraftLine = {
  id: string;
  productId: string;
  sizeLabel: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
  unitCostRupees: number;
};

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nanoid() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

export function BackofficePurchasesPage() {
  const auth = getAuth();
  const storeId = auth?.user.storeId || '';

  const [store, setStore] = useState<Store | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierStateCode, setSupplierStateCode] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayYmd());
  const [lines, setLines] = useState<PurchaseDraftLine[]>([
    { id: nanoid(), productId: '', sizeLabel: 'NO_SIZE', batchNo: '', expiryDate: '', qty: 1, unitCostRupees: 0 }
  ]);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [newSizeOpen, setNewSizeOpen] = useState(false);
  const [newSizeLineId, setNewSizeLineId] = useState<string | null>(null);
  const [newSizeValue, setNewSizeValue] = useState('');

  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierGstin, setNewSupplierGstin] = useState('');
  const [newSupplierState, setNewSupplierState] = useState('');
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        const storesRes = await apiFetch<{ stores: Store[] }>('/stores');
        if (!active) return;
        const s = storesRes.stores.find((x) => x.id === storeId) ?? null;
        setStore(s);

        if (!storeId) throw new Error('No store assigned');
        const w = await apiFetch<{ warehouses: Warehouse[] }>(`/warehouses?storeId=${storeId}`);
        if (!active) return;
        setWarehouses(w.warehouses);
        setWarehouseId((prev) => prev || w.warehouses[0]?.id || '');

        const prods = await apiFetch<{ products: Product[] }>('/products');
        if (!active) return;
        setProducts(prods.products);

        const sups = await apiFetch<{ suppliers: Supplier[] }>('/purchases/suppliers');
        if (!active) return;
        setSuppliers(sups.suppliers);
        setSupplierId((prev) => prev || sups.suppliers[0]?.id || '');

        const invs = await apiFetch<{ purchaseInvoices: any[] }>('/purchases/invoices');
        if (!active) return;
        setRecent(invs.purchaseInvoices);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load purchases');
      }
    })();
    return () => {
      active = false;
    };
  }, [storeId]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const sizesByBaseId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of products) {
      if (!p.parentProductId) continue;
      const arr = m.get(p.parentProductId) || [];
      const label = (p.sizeLabel || '').trim() || 'NO_SIZE';
      if (!arr.includes(label)) arr.push(label);
      m.set(p.parentProductId, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.localeCompare(b));
    return m;
  }, [products]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  useEffect(() => {
    const sup = supplierById.get(supplierId);
    const next = (sup?.stateCode || '').trim() || store?.stateCode || '';
    setSupplierStateCode(next);
  }, [supplierId, supplierById, store?.stateCode]);

  const taxRegime = useMemo(() => {
    const supplierState = (supplierStateCode || '').trim() || store?.stateCode || '';
    if (!supplierState || !store?.stateCode) return 'INTRA';
    return supplierState === store.stateCode ? 'INTRA' : 'INTER';
  }, [supplierStateCode, store?.stateCode]);

  const computed = useMemo(() => {
    let subtotalPaise = 0n;
    let cgstPaise = 0n;
    let sgstPaise = 0n;
    let igstPaise = 0n;

    for (const l of lines) {
      const p = productById.get(l.productId);
      if (!p) continue;
      const unitCostPaise = rupeesToPaiseBigInt(l.unitCostRupees || 0);
      const qtyMilli = qtyToMilliBigInt(l.qty || 0);
      if (qtyMilli <= 0n) continue;
      const taxable = mulPaiseByQtyMilli(unitCostPaise, qtyMilli);
      subtotalPaise += taxable;

      const gstRateBp = p.gstRateBp || 0;
      if (taxRegime === 'INTRA') {
        const cgstRate = Math.floor(gstRateBp / 2);
        const sgstRate = gstRateBp - cgstRate;
        cgstPaise += cgstRate ? mulPaiseByRateBp(taxable, cgstRate) : 0n;
        sgstPaise += sgstRate ? mulPaiseByRateBp(taxable, sgstRate) : 0n;
      } else {
        igstPaise += gstRateBp ? mulPaiseByRateBp(taxable, gstRateBp) : 0n;
      }
    }

    const taxTotalPaise = cgstPaise + sgstPaise + igstPaise;
    const grandTotalPaise = subtotalPaise + taxTotalPaise;
    return { subtotalPaise, cgstPaise, sgstPaise, igstPaise, taxTotalPaise, grandTotalPaise };
  }, [lines, productById, taxRegime]);

  async function createSupplier() {
    setCreating(true);
    setError(null);
    try {
      const payload: any = { name: newSupplierName };
      if (newSupplierGstin.trim()) payload.gstin = newSupplierGstin.trim();
      if (newSupplierState.trim()) payload.stateCode = newSupplierState.trim().toUpperCase();
      const res = await apiFetch<{ supplier: Supplier }>('/purchases/suppliers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setSuppliers((prev) => [...prev, res.supplier].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(res.supplier.id);
      setNewSupplierName('');
      setNewSupplierGstin('');
      setNewSupplierState('');
    } catch (e: any) {
      setError(e?.message || 'Failed to create supplier');
    } finally {
      setCreating(false);
    }
  }

  async function submit() {
    setCreating(true);
    setError(null);
    try {
      if (!warehouseId) throw new Error('Warehouse required');
      if (!supplierId) throw new Error('Supplier required');
      if (!supplierInvoiceNo.trim()) throw new Error('Supplier invoice no required');
      if (!invoiceDate.trim()) throw new Error('Invoice date required');

      const items = lines
        .map((l) => ({
          productId: l.productId,
          sizeLabel: (l.sizeLabel || '').trim() || 'NO_SIZE',
          batchNo: l.batchNo,
          expiryDate: l.expiryDate.trim() ? l.expiryDate.trim() : undefined,
          qty: Number(l.qty),
          unitCostRupees: Number(l.unitCostRupees)
        }))
        .filter((x) => x.productId && x.batchNo && x.qty > 0);

      if (items.length === 0) throw new Error('Add at least 1 valid item');

      await apiFetch('/purchases/invoices', {
        method: 'POST',
        body: JSON.stringify({
          storeWarehouseId: warehouseId,
          supplierId,
          supplierStateCode: supplierStateCode.trim(),
          supplierInvoiceNo: supplierInvoiceNo.trim(),
          invoiceDate: invoiceDate.trim(),
          items
        })
      });

      const invs = await apiFetch<{ purchaseInvoices: any[] }>('/purchases/invoices');
      setRecent(invs.purchaseInvoices);

      setSupplierInvoiceNo('');
      setLines([{ id: nanoid(), productId: '', sizeLabel: 'NO_SIZE', batchNo: '', expiryDate: '', qty: 1, unitCostRupees: 0 }]);
    } catch (e: any) {
      setError(e?.message || 'Failed to create purchase invoice');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="boPage">
      {error && <div className="boToast">{error}</div>}

      <div className="purHeader">
        <button className="gBtn" onClick={submit} disabled={creating}>
          {creating ? 'Saving…' : 'Create Purchase'}
        </button>
      </div>

      <div className="purLayout">
        <div className="purLeft">
          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardTitle">Basic Info</div>
            </div>
            <div className="gCardBd purBasicGrid">
              <div className="gField">
                <label>Store</label>
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="gField">
                <label>Invoice Date</label>
                <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <div className="gField" style={{ gridColumn: '1 / -1' }}>
                <label>Supplier</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={{ flex: 1 }}>
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.stateCode ? ` (${s.stateCode})` : ''}
                      </option>
                    ))}
                  </select>
                  <button className="purLink" type="button" onClick={() => setSupplierModalOpen(true)}>
                    + Add new supplier
                  </button>
                </div>
              </div>
              <div className="gField">
                <label>State Code</label>
                <input value={supplierStateCode} onChange={(e) => setSupplierStateCode(e.target.value)} placeholder="e.g. 29" />
              </div>
              <div className="gField">
                <label>Supplier Invoice No</label>
                <input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} />
              </div>
              <div className="purTaxInfo">
                {taxRegime === 'INTRA' ? 'Intra-state (CGST + SGST applied)' : 'Inter-state (IGST applied)'}
              </div>
            </div>
          </div>

          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardTitle">Items</div>
            </div>
            <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="purItemsHead">
                <div>Product</div>
                <div>Size</div>
                <div>Batch</div>
                <div>Expiry</div>
                <div>Qty</div>
                <div>Cost</div>
                <div className="right">Total</div>
                <div></div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lines.map((l) => {
                  const p = productById.get(l.productId);
                  const rowTotalPaise = (() => {
                    const unitCostPaise = rupeesToPaiseBigInt(l.unitCostRupees || 0);
                    const qtyMilli = qtyToMilliBigInt(l.qty || 0);
                    if (qtyMilli <= 0n) return 0n;
                    return mulPaiseByQtyMilli(unitCostPaise, qtyMilli);
                  })();
                  return (
                    <div key={l.id} className="purItemRow">
                      <div className="gField" style={{ minWidth: 0 }}>
                        <select
                          value={l.productId}
                          onChange={(e) => {
                            const nextProductId = e.target.value;
                            setLines((prev) =>
                              prev.map((x) =>
                                x.id === l.id ? { ...x, productId: nextProductId, sizeLabel: 'NO_SIZE' } : x
                              )
                            );
                          }}
                        >
                          <option value="">-- Select Product --</option>
                          {products.filter((p: any) => !p.parentProductId).map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                          ))}
                        </select>
                        {p ? <div className="purHint">HSN {p.hsnCode} • {(p.gstRateBp / 100).toFixed(2)}%</div> : null}
                      </div>

                      <div className="gField">
                        {(() => {
                          const sizes = (sizesByBaseId.get(l.productId) || []).filter((s) => s && s !== 'NO_SIZE');
                          const unique = Array.from(new Set(sizes));
                          const extra = l.sizeLabel && l.sizeLabel !== 'NO_SIZE' && l.sizeLabel !== '__NEW__' && !unique.includes(l.sizeLabel) ? [l.sizeLabel] : [];
                          const options = [...extra, ...unique];
                          return (
                            <select
                              value={l.sizeLabel}
                              disabled={!l.productId}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '__NEW__') {
                                  if (!l.productId) {
                                    setError('Select product first');
                                    return;
                                  }
                                  setNewSizeLineId(l.id);
                                  setNewSizeValue('');
                                  setNewSizeOpen(true);
                                  return;
                                }
                                setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, sizeLabel: v } : x)));
                              }}
                            >
                              <option value="NO_SIZE">NO_SIZE</option>
                              {options.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                              <option value="__NEW__">+ New…</option>
                            </select>
                          );
                        })()}
                      </div>

                      <div className="gField">
                        <input value={l.batchNo} onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, batchNo: e.target.value } : x)))} placeholder="Batch" />
                      </div>
                      <div className="gField">
                        <input type="date" value={l.expiryDate} onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, expiryDate: e.target.value } : x)))} />
                      </div>
                      <div className="gField">
                        <input type="number" value={String(l.qty)} onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, qty: Number(e.target.value || 0) } : x)))} />
                      </div>
                      <div className="gField">
                        <input type="number" value={String(l.unitCostRupees)} onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, unitCostRupees: Number(e.target.value || 0) } : x)))} />
                      </div>
                      <div className="purRowTotal right">₹ {paiseToRupeesString(rowTotalPaise)}</div>
                      <div className="boLineRemove">
                        <button
                          type="button"
                          className="gBtn ghost danger mini"
                          onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))}
                          disabled={lines.length <= 1}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button
                  className="gBtn ghost"
                  type="button"
                  onClick={() => setLines((prev) => [...prev, { id: nanoid(), productId: '', sizeLabel: 'NO_SIZE', batchNo: '', expiryDate: '', qty: 1, unitCostRupees: 0 }])}
                >
                  + Add Item
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="purRight">
          <div className="gCard purSticky">
            <div className="gCardHd">
              <div className="gCardTitle">Summary</div>
            </div>
            <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="purSumRow"><span>Subtotal</span><span>₹ {paiseToRupeesString(computed.subtotalPaise)}</span></div>
              <div className="purSumRow"><span>CGST</span><span>₹ {paiseToRupeesString(computed.cgstPaise)}</span></div>
              <div className="purSumRow"><span>SGST</span><span>₹ {paiseToRupeesString(computed.sgstPaise)}</span></div>
              <div className="purSumRow"><span>IGST</span><span>₹ {paiseToRupeesString(computed.igstPaise)}</span></div>
              <div className="purSumDivider" />
              <div className="purGrand">
                <span>Grand Total</span>
                <span>₹ {paiseToRupeesString(computed.grandTotalPaise)}</span>
              </div>
            </div>
          </div>

          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardTitle">Recent Purchases</div>
            </div>
            <div className="gCardBd purRecent">
              {recent.length === 0 ? <div style={{ color: 'var(--pos-muted)', fontSize: 14 }}>No purchases yet</div> : null}
              {recent.map((r) => (
                <div key={r.id} className="purRecentRow">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.supplier?.name}</div>
                    <div style={{ color: 'var(--pos-muted)', fontSize: 12 }}>{r.supplierInvoiceNo} • {new Date(r.invoiceDate).toLocaleDateString()}</div>
                  </div>
                  <div style={{ fontWeight: 900, color: 'var(--pos-accent)' }}>₹{paiseToRupeesString(BigInt(r.grandTotalPaise))}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {newSizeOpen ? (
        <div className="gModalBack" onMouseDown={() => setNewSizeOpen(false)}>
          <div className="gModal" style={{ maxWidth: 420 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Add Size</div>
              <button className="gBtn ghost" onClick={() => setNewSizeOpen(false)}>Close</button>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gField">
                <label>Size Label</label>
                <input value={newSizeValue} onChange={(e) => setNewSizeValue(e.target.value)} placeholder="e.g. S / M / 42" autoFocus />
              </div>
              <button
                className="gBtn"
                onClick={() => {
                  const cleaned = newSizeValue.trim().toUpperCase();
                  if (!cleaned || cleaned === '__NEW__') return;
                  if (newSizeLineId) {
                    setLines((prev) => prev.map((x) => (x.id === newSizeLineId ? { ...x, sizeLabel: cleaned } : x)));
                  }
                  setNewSizeOpen(false);
                }}
                disabled={!newSizeValue.trim()}
              >
                Add
              </button>
            </div>
            <button className="purModalX" type="button" onClick={() => setNewSizeOpen(false)} aria-label="Close">×</button>
          </div>
        </div>
      ) : null}

      {supplierModalOpen ? (
        <div className="gModalBack" onMouseDown={() => !creating && setSupplierModalOpen(false)}>
          <div className="gModal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Add Supplier</div>
              <button className="gBtn ghost" onClick={() => setSupplierModalOpen(false)} disabled={creating}>
                Close
              </button>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gField">
                <label>Name</label>
                <input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Supplier name" autoFocus />
              </div>
              <div className="gGrid2">
                <div className="gField">
                  <label>GSTIN</label>
                  <input value={newSupplierGstin} onChange={(e) => setNewSupplierGstin(e.target.value)} placeholder="Optional" />
                </div>
                <div className="gField">
                  <label>State Code</label>
                  <input value={newSupplierState} onChange={(e) => setNewSupplierState(e.target.value)} placeholder="e.g. 29" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost" onClick={() => setSupplierModalOpen(false)} disabled={creating}>
                  Cancel
                </button>
                <button
                  className="gBtn"
                  onClick={async () => {
                    await createSupplier();
                    setSupplierModalOpen(false);
                  }}
                  disabled={creating || !newSupplierName.trim()}
                >
                  Add Supplier
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
