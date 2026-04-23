import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, downloadWithAuth } from '../lib/api';
import { clearAuth, getAuth } from '../lib/auth';
import {
  mulPaiseByQtyMilli,
  mulPaiseByRateBp,
  paiseStringToBigInt,
  paiseToRupeesString,
  qtyToMilliBigInt,
  rupeesToPaiseBigInt
} from '../lib/money';
import { getJson, setJson } from '../lib/storage';

type Store = { id: string; code: string; name: string; stateCode: string; address: string };
type Warehouse = { id: string; name: string; storeId: string };
type Product = {
  id: string;
  code: string;
  name: string;
  hsnCode: string;
  gstRateBp: number;
  sellingPricePaise: string;
  imageUrl?: string | null;
};
type Customer = { id: string; fullName: string; phone?: string; stateCode?: string };

type CartLine = {
  product: Product;
  qty: number;
  unitPriceRupees: number;
  discountRupees: number;
};

const POS_KEY = 'sutra_pos_state_v1';
const HOLDS_KEY = 'sutra_pos_holds_v1';

type PosState = {
  warehouseId?: string;
};

function defaultPosState(): PosState {
  return { warehouseId: undefined };
}

function openBlob(blob: Blob, mime: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: mime }));
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type HoldBill = {
  id: string;
  title: string;
  createdAt: string;
  mode: 'WALK_IN' | 'DELIVERY';
  placeOfSupply: string;
  customerName: string;
  customerPhone: string;
  selectedCustomer: Customer | null;
  deliveryAddress: string;
  deliveryPincode: string;
  cart: CartLine[];
  payMethod: 'CASH' | 'UPI';
  upiRef: string;
};

function newId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function parseQtyAvailable(q: string | undefined) {
  if (!q) return null;
  const n = Number(q);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function PosPage() {
  const nav = useNavigate();
  const auth = getAuth();

  const [store, setStore] = useState<Store | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [posState, setPosState] = useState<PosState>(() => getJson<PosState>(POS_KEY) ?? defaultPosState());

  const [mode, setMode] = useState<'WALK_IN' | 'DELIVERY'>('WALK_IN');
  const [placeOfSupply, setPlaceOfSupply] = useState<string>('');

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPincode, setDeliveryPincode] = useState('');

  const [q, setQ] = useState('');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [results, setResults] = useState<Product[]>([]);
  const [stockByProductId, setStockByProductId] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>([]);

  const [payMethod, setPayMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [upiRef, setUpiRef] = useState('');

  const [invoiceResult, setInvoiceResult] = useState<{ id: string; invoiceNo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [holds, setHolds] = useState<HoldBill[]>(() => getJson<HoldBill[]>(HOLDS_KEY) ?? []);
  const [holdTitle, setHoldTitle] = useState('');

  useEffect(() => {
    setJson(POS_KEY, posState);
  }, [posState]);

  useEffect(() => {
    setJson(HOLDS_KEY, holds);
  }, [holds]);

  useEffect(() => {
    if (!auth?.accessToken) nav('/login', { replace: true });
  }, [auth?.accessToken, nav]);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const storesRes = await apiFetch<{ stores: Store[] }>('/stores');
        const s = storesRes.stores.find((x) => x.id === auth?.user.storeId) ?? null;
        setStore(s);
        if (s?.stateCode) setPlaceOfSupply(s.stateCode);
        if (auth?.user.storeId) {
          const w = await apiFetch<{ warehouses: Warehouse[] }>(`/warehouses?storeId=${auth.user.storeId}`);
          setWarehouses(w.warehouses);
          const first = w.warehouses[0]?.id;
          setPosState((prev) => ({ ...prev, warehouseId: prev.warehouseId ?? first }));
        }

        const prods = await apiFetch<{ products: Product[] }>('/products?channel=POS');
        setAllProducts(prods.products);
        setResults(prods.products);
      } catch (err: any) {
        setError(err?.message || 'Failed to load POS bootstrap');
      }
    })();
  }, [auth?.user.storeId]);

  useEffect(() => {
    if (mode === 'WALK_IN') {
      setDeliveryAddress('');
      setDeliveryPincode('');
    }
  }, [mode]);

  useEffect(() => {
    const phone = customerPhone.trim();
    if (!/^\d{10}$/.test(phone)) return;
    let active = true;
    (async () => {
      try {
        const res = await apiFetch<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(phone)}`);
        if (!active) return;
        const exact = res.customers.find((c) => (c.phone ?? '') === phone);
        if (exact) {
          setSelectedCustomer(exact);
          setCustomerName(exact.fullName);
        }
      } catch {
        return;
      }
    })();
    return () => {
      active = false;
    };
  }, [customerPhone]);

  async function searchProducts() {
    const query = q.trim().toLowerCase();
    const filtered = query
      ? allProducts.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(query))
      : allProducts;
    setResults(filtered);
  }

  useEffect(() => {
    searchProducts();
  }, [q, allProducts]);

  useEffect(() => {
    (async () => {
      try {
        if (!posState.warehouseId) return;
        const stock = await apiFetch<{ stock: Array<{ product: Product; qtyAvailable: string }> }>(
          `/inventory/stock?warehouseId=${posState.warehouseId}`
        );
        const map: Record<string, string> = {};
        for (const s of stock.stock) map[s.product.id] = s.qtyAvailable;
        setStockByProductId(map);
      } catch {
        return;
      }
    })();
  }, [posState.warehouseId]);

  async function refreshStock() {
    if (!posState.warehouseId) return;
    const stock = await apiFetch<{ stock: Array<{ product: Product; qtyAvailable: string }> }>(
      `/inventory/stock?warehouseId=${posState.warehouseId}`
    );
    const map: Record<string, string> = {};
    for (const s of stock.stock) map[s.product.id] = s.qtyAvailable;
    setStockByProductId(map);
  }

  function addToCart(p: Product) {
    setCart((prev) => {
      const i = prev.findIndex((x) => x.product.id === p.id);
      const unit = Number(paiseStringToBigInt(p.sellingPricePaise)) / 100;
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
        return copy;
      }
      return [...prev, { product: p, qty: 1, unitPriceRupees: unit, discountRupees: 0 }];
    });
  }

  const preview = useMemo(() => {
    const storeState = store?.stateCode;
    const posStateCode = placeOfSupply || storeState || '';
    const intra = !!storeState && !!posStateCode && storeState === posStateCode;

    let taxable = 0n;
    let cgst = 0n;
    let sgst = 0n;
    let igst = 0n;

    const lines = cart.map((l) => {
      const unitPaise = rupeesToPaiseBigInt(l.unitPriceRupees);
      const qtyMilli = qtyToMilliBigInt(l.qty);
      const base = mulPaiseByQtyMilli(unitPaise, qtyMilli);
      const discount = rupeesToPaiseBigInt(l.discountRupees);
      const lineTaxable = base - discount;
      const gstRateBp = l.product.gstRateBp;
      const cgstRateBp = intra ? Math.floor(gstRateBp / 2) : 0;
      const sgstRateBp = intra ? gstRateBp - cgstRateBp : 0;
      const igstRateBp = intra ? 0 : gstRateBp;
      const lineCgst = cgstRateBp ? mulPaiseByRateBp(lineTaxable, cgstRateBp) : 0n;
      const lineSgst = sgstRateBp ? mulPaiseByRateBp(lineTaxable, sgstRateBp) : 0n;
      const lineIgst = igstRateBp ? mulPaiseByRateBp(lineTaxable, igstRateBp) : 0n;
      const lineTotal = lineTaxable + lineCgst + lineSgst + lineIgst;

      taxable += lineTaxable;
      cgst += lineCgst;
      sgst += lineSgst;
      igst += lineIgst;

      return { line: l, taxable: lineTaxable, total: lineTotal };
    });

    const total = taxable + cgst + sgst + igst;
    return { lines, taxable, cgst, sgst, igst, total, intra };
  }, [cart, placeOfSupply, store?.stateCode]);

  async function ensureDeliveryCustomerId() {
    if (selectedCustomer?.id) return selectedCustomer.id;
    const phone = customerPhone.trim();
    if (!customerName.trim() && /^\d{10}$/.test(phone)) {
      const res = await apiFetch<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(phone)}`);
      const exact = res.customers.find((c) => (c.phone ?? '') === phone);
      if (exact) {
        setSelectedCustomer(exact);
        setCustomerName(exact.fullName);
        return exact.id;
      }
    }
    if (!customerName.trim()) throw new Error('Enter customer name (or enter an existing phone)');
    const payload: any = { fullName: customerName.trim() };
    if (phone) payload.phone = phone;
    if (placeOfSupply) payload.stateCode = placeOfSupply;

    try {
      const res = await apiFetch<{ customer: Customer }>('/customers', { method: 'POST', body: JSON.stringify(payload) });
      setSelectedCustomer(res.customer);
      return res.customer.id;
    } catch (err: any) {
      if (err?.status === 409 && phone) {
        const res = await apiFetch<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(phone)}`);
        const found = res.customers[0];
        if (found) {
          setSelectedCustomer(found);
          return found.id;
        }
      }
      throw err;
    }
  }

  async function checkout() {
    if (!posState.warehouseId) {
      setError('Select a warehouse');
      return;
    }
    if (!store?.stateCode) {
      setError('Store state is missing');
      return;
    }
    if (cart.length === 0) {
      setError('Cart is empty');
      return;
    }
    if (!placeOfSupply) {
      setError('Place of supply is required');
      return;
    }
    if (mode === 'DELIVERY') {
      if (!deliveryAddress.trim()) {
        setError('Delivery address is required');
        return;
      }
      if (deliveryPincode.trim() && !/^\d{6}$/.test(deliveryPincode.trim())) {
        setError('Delivery pincode must be 6 digits');
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const wantsCustomer = !!customerName.trim() || !!customerPhone.trim();
      const customerId = wantsCustomer ? await ensureDeliveryCustomerId() : undefined;

      const body: any = {
        storeWarehouseId: posState.warehouseId,
        customerId,
        placeOfSupplyStateCode: placeOfSupply,
        items: cart.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
          unitPriceRupees: l.unitPriceRupees,
          discountRupees: l.discountRupees
        })),
        payment: {
          method: payMethod,
          amountRupees: Number(paiseToRupeesString(preview.total)),
          upiRef: payMethod === 'UPI' ? upiRef.trim() : undefined
        }
      };

      if (mode === 'DELIVERY') {
        body.deliveryAddress = deliveryAddress;
        if (deliveryPincode.trim()) body.deliveryPincode = deliveryPincode.trim();
      }

      const res = await apiFetch<any>('/sales/invoices', { method: 'POST', body: JSON.stringify(body) });
      setInvoiceResult({ id: res.invoice.id, invoiceNo: res.invoice.invoiceNo });
      setCart([]);
      setQ('');
      await refreshStock();
    } catch (err: any) {
      setError(err?.message || 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  async function print(format: 'A4' | 'THERMAL_80MM') {
    if (!invoiceResult) return;
    setBusy(true);
    setError(null);
    try {
      const job = await apiFetch<any>(`/print/invoices/${invoiceResult.id}?format=${format}`, { method: 'POST' });
      const jobId = job.jobId;
      const { blob, contentType } = await downloadWithAuth(`/print/jobs/${jobId}/download`);
      openBlob(blob, contentType);
    } catch (err: any) {
      setError(err?.message || 'Print failed');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearAuth();
    nav('/login', { replace: true });
  }

  function clearBill() {
    setMode('WALK_IN');
    if (store?.stateCode) setPlaceOfSupply(store.stateCode);
    setSelectedCustomer(null);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setDeliveryPincode('');
    setCart([]);
    setPayMethod('CASH');
    setUpiRef('');
    setInvoiceResult(null);
  }

  function holdBill() {
    if (cart.length === 0) {
      setError('Cart is empty');
      return;
    }
    const title = holdTitle.trim() || `Hold ${new Date().toLocaleTimeString()}`;
    const item: HoldBill = {
      id: newId(),
      title,
      createdAt: new Date().toISOString(),
      mode,
      placeOfSupply,
      customerName,
      customerPhone,
      selectedCustomer,
      deliveryAddress,
      deliveryPincode,
      cart,
      payMethod,
      upiRef
    };
    setHolds((prev) => [item, ...prev].slice(0, 50));
    setHoldTitle('');
    clearBill();
  }

  function recallBill(id: string) {
    const bill = holds.find((h) => h.id === id);
    if (!bill) return;
    setMode(bill.mode);
    setPlaceOfSupply(bill.placeOfSupply);
    setCustomerName(bill.customerName);
    setCustomerPhone(bill.customerPhone);
    setSelectedCustomer(bill.selectedCustomer);
    setDeliveryAddress(bill.deliveryAddress);
    setDeliveryPincode(bill.deliveryPincode);
    setCart(bill.cart);
    setPayMethod(bill.payMethod);
    setUpiRef(bill.upiRef);
    setInvoiceResult(null);
    setHoldsOpen(false);
  }

  function deleteHold(id: string) {
    setHolds((prev) => prev.filter((h) => h.id !== id));
  }

  const cartQtyByProductId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of cart) m[l.product.id] = (m[l.product.id] ?? 0) + l.qty;
    return m;
  }, [cart]);

  function displayedStock(productId: string) {
    const base = parseQtyAvailable(stockByProductId[productId]);
    if (base === null) return null;
    const used = cartQtyByProductId[productId] ?? 0;
    const left = base - used;
    return Math.max(0, left);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (e.key === '/' && !typing) {
        e.preventDefault();
        productSearchRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (invoiceResult) {
          e.preventDefault();
          setInvoiceResult(null);
          return;
        }
      }

      if (e.key === 'F2') {
        e.preventDefault();
        checkout();
        return;
      }

      if (e.key === 'F3') {
        if (!invoiceResult) return;
        e.preventDefault();
        print('THERMAL_80MM');
        return;
      }

      if (e.key === 'F4') {
        if (!invoiceResult) return;
        e.preventDefault();
        print('A4');
        return;
      }

      if (e.key === 'F6') {
        e.preventDefault();
        holdBill();
        return;
      }

      if (e.key === 'F7') {
        e.preventDefault();
        setHoldsOpen((v) => !v);
        return;
      }

      if (e.key === 'F8') {
        e.preventDefault();
        clearBill();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [invoiceResult, checkout, print, holdBill, clearBill]);

  return (
    <div className="container">
      <div className="topbar">
        <div className="left">
          <div className="brand">Sutra POS</div>
          {store ? <span className="pill">{store.code} · {store.name}</span> : null}
          {auth ? <span className="pill">{auth.user.fullName}</span> : null}
          <span className="pill">Holds: {holds.length}</span>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => setHoldsOpen(true)}>
            Recall (F7)
          </button>
          <button className="btn secondary" onClick={clearBill}>
            New (F8)
          </button>
          <button className="btn secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {error ? (
        <>
          <div className="space" />
          <div className="toast">{error}</div>
        </>
      ) : null}

      <div className="layout">
        <div className="panel">
          <div className="hd">
            <div className="t">Products</div>
            <div className="muted">Search filters list · / focus search</div>
          </div>
          <div className="bd">
            <div className="productsBar">
              <input
                ref={productSearchRef}
                placeholder="Search product name / code…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="btn secondary" onClick={() => setQ('')} disabled={!q.trim()}>
                Clear
              </button>
            </div>
            <div className="space" />
            <div className="muted">Shortcuts: F2 checkout · F3 thermal · F4 A4 · F6 hold · F7 recall · F8 new</div>
            <div className="space" />
            <div className="productsGrid">
              {results.map((p) => {
                const s = displayedStock(p.id);
                const pillClass =
                  s === null ? 'stockPill' : s <= 0 ? 'stockPill stockOut' : s <= 2 ? 'stockPill stockLow' : 'stockPill';
                return (
                  <div key={p.id} className="prodCard">
                    <div className="prodImgWrap">
                      <img
                        className="prodImg"
                        src={p.imageUrl || 'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\"><rect width=\"100%\" height=\"100%\" fill=\"%23f1f5f9\"/><text x=\"50%\" y=\"52%\" text-anchor=\"middle\" font-size=\"18\" fill=\"%23475569\" font-family=\"Arial\">No Image</text></svg>'}
                        alt=""
                        onError={(e) => {
                          (e.currentTarget as any).src =
                            'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\"><rect width=\"100%\" height=\"100%\" fill=\"%23f1f5f9\"/><text x=\"50%\" y=\"52%\" text-anchor=\"middle\" font-size=\"18\" fill=\"%23475569\" font-family=\"Arial\">No Image</text></svg>';
                        }}
                      />
                    </div>
                    <div className="prodBody">
                      <div className="prodTitle">{p.name}</div>
                      <div className="prodMeta">{p.code} · HSN {p.hsnCode} · GST {(p.gstRateBp / 100).toFixed(0)}%</div>
                      <div className="prodRow">
                        <div style={{ fontWeight: 900 }}>₹{(Number(paiseStringToBigInt(p.sellingPricePaise)) / 100).toFixed(2)}</div>
                        <span className={pillClass}>
                          Stock: {s === null ? '—' : s.toFixed(3)}
                        </span>
                      </div>
                      <div className="prodRow">
                        <button className="btn secondary" onClick={() => addToCart(p)} disabled={s !== null && s <= 0}>
                          + Quick Add
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="hd">
            <div className="t">Bill</div>
            <div className="muted">{preview.intra ? 'CGST+SGST' : 'IGST'}</div>
          </div>
          <div className="bd">
            <div className="step">
              <div className="n">1</div>
              <div className="content">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 900 }}>Sale</div>
                  <div className="row">
                    <button className={`btn ${mode === 'WALK_IN' ? '' : 'secondary'} mini`} onClick={() => setMode('WALK_IN')}>
                      Walk-in
                    </button>
                    <button className={`btn ${mode === 'DELIVERY' ? '' : 'secondary'} mini`} onClick={() => setMode('DELIVERY')}>
                      Delivery
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Warehouse</label>
                  <select
                    value={posState.warehouseId || ''}
                    onChange={(e) => setPosState((p) => ({ ...p, warehouseId: e.target.value }))}
                  >
                    <option value="" disabled>
                      Select warehouse
                    </option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Place of Supply (State Code)</label>
                  <input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="step">
              <div className="n">2</div>
              <div className="content">
                <div style={{ fontWeight: 900 }}>Customer</div>
                <div className="grid2">
                  <div className="field">
                    <label>Name</label>
                    <input
                      value={customerName}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomerName(v);
                        if (selectedCustomer && v.trim() !== selectedCustomer.fullName.trim()) setSelectedCustomer(null);
                      }}
                    />
                  </div>
                  <div className="field">
                    <label>Phone</label>
                    <input
                      value={customerPhone}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomerPhone(v);
                        if (selectedCustomer && (selectedCustomer.phone ?? '') !== v.trim()) setSelectedCustomer(null);
                      }}
                    />
                    <div className="muted">Auto-detects existing customer by 10-digit phone</div>
                  </div>
                </div>

                {selectedCustomer ? (
                  <div className="pill">
                    Using: {selectedCustomer.fullName} {selectedCustomer.phone ? `· ${selectedCustomer.phone}` : ''}
                    <button
                      className="btn secondary"
                      style={{ padding: '6px 10px', borderRadius: 999, marginLeft: 10 }}
                      onClick={() => setSelectedCustomer(null)}
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <div className="muted">Leave blank for Walk-in Customer</div>
                )}

                {mode === 'DELIVERY' ? (
                  <>
                    <div className="field">
                      <label>Delivery Address</label>
                      <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Pincode</label>
                      <input value={deliveryPincode} onChange={(e) => setDeliveryPincode(e.target.value)} />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="step">
              <div className="n">3</div>
              <div className="content">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 900 }}>Cart</div>
                  <button className="btn danger mini" onClick={() => setCart([])} disabled={!cart.length}>
                    Clear
                  </button>
                </div>
                <div className="cartList">
                  {preview.lines.map(({ line, total }, idx) => (
                    <div key={line.product.id} className="cartItem">
                      <div className="cartTop">
                        <div>
                          <div className="cartName">{line.product.name}</div>
                          <div className="cartCode">{line.product.code}</div>
                        </div>
                        <div style={{ fontWeight: 900 }}>₹{paiseToRupeesString(total)}</div>
                      </div>
                      <div className="cartGrid">
                        <div className="field">
                          <label>Qty</label>
                          <input
                            value={line.qty}
                            onChange={(e) =>
                              setCart((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], qty: Number(e.target.value) || 0 };
                                return copy;
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>Rate</label>
                          <input
                            value={line.unitPriceRupees}
                            onChange={(e) =>
                              setCart((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], unitPriceRupees: Number(e.target.value) || 0 };
                                return copy;
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>Disc</label>
                          <input
                            value={line.discountRupees}
                            onChange={(e) =>
                              setCart((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], discountRupees: Number(e.target.value) || 0 };
                                return copy;
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="actionsRow">
                        <button className="btn secondary mini" onClick={() => addToCart(line.product)}>
                          +1
                        </button>
                        <button
                          className="btn danger mini"
                          onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 ? <div className="muted">No items added yet</div> : null}
                </div>
              </div>
            </div>

            <div className="step">
              <div className="n">4</div>
              <div className="content">
                <div style={{ fontWeight: 900 }}>Payment</div>
                <div className="row">
                  <button className={`btn ${payMethod === 'CASH' ? '' : 'secondary'} mini`} onClick={() => setPayMethod('CASH')}>
                    Cash
                  </button>
                  <button className={`btn ${payMethod === 'UPI' ? '' : 'secondary'} mini`} onClick={() => setPayMethod('UPI')}>
                    UPI
                  </button>
                </div>
                {payMethod === 'UPI' ? (
                  <div className="field">
                    <label>UPI Reference (UTR)</label>
                    <input value={upiRef} onChange={(e) => setUpiRef(e.target.value)} />
                    <div className="muted">UTR/Reference shown after payment in PhonePe/GPay/Paytm</div>
                  </div>
                ) : null}

                <div className="card" style={{ padding: 10, borderRadius: 12, background: '#f8fafc' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="muted">Taxable</div>
                    <div>₹{paiseToRupeesString(preview.taxable)}</div>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="muted">CGST</div>
                    <div>₹{paiseToRupeesString(preview.cgst)}</div>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="muted">SGST</div>
                    <div>₹{paiseToRupeesString(preview.sgst)}</div>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="muted">IGST</div>
                    <div>₹{paiseToRupeesString(preview.igst)}</div>
                  </div>
                  <div className="space" />
                  <div className="row" style={{ justifyContent: 'space-between', fontWeight: 900, fontSize: 16 }}>
                    <div>Total</div>
                    <div>₹{paiseToRupeesString(preview.total)}</div>
                  </div>
                </div>

                <div className="actionsRow">
                  <button className="btn secondary" onClick={() => setHoldsOpen(true)}>
                    Recall (F7)
                  </button>
                  <button className="btn secondary" onClick={holdBill} disabled={!cart.length}>
                    Hold (F6)
                  </button>
                  <button className="btn" onClick={checkout} disabled={busy || cart.length === 0}>
                    {busy ? 'Processing…' : 'Checkout (F2)'}
                  </button>
                </div>

                <div className="field">
                  <label>Hold name (optional)</label>
                  <input value={holdTitle} onChange={(e) => setHoldTitle(e.target.value)} placeholder="Eg: Customer 2 / Phone order" />
                </div>

                {invoiceResult ? (
                  <>
                    <div className="pill">Created: {invoiceResult.invoiceNo}</div>
                    <div className="actionsRow">
                      <button className="btn secondary" onClick={() => print('THERMAL_80MM')} disabled={busy}>
                        Print Thermal (F3)
                      </button>
                      <button className="btn secondary" onClick={() => print('A4')} disabled={busy}>
                        Print A4 (F4)
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {holdsOpen ? (
        <div className="modalBack" onMouseDown={() => setHoldsOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHd">
              <div style={{ fontWeight: 900 }}>Recall Bill</div>
              <button className="btn secondary" onClick={() => setHoldsOpen(false)}>
                Close
              </button>
            </div>
            <div className="modalBd">
              {holds.length === 0 ? (
                <div className="muted">No held bills</div>
              ) : (
                holds.map((h) => (
                  <div key={h.id} className="holdRow">
                    <div>
                      <div style={{ fontWeight: 900 }}>{h.title}</div>
                      <div className="muted">
                        {new Date(h.createdAt).toLocaleString()} · {h.mode} · Items {h.cart.length} · POS {h.placeOfSupply || '—'}
                      </div>
                    </div>
                    <div className="row">
                      <button className="btn secondary" onClick={() => recallBill(h.id)}>
                        Load
                      </button>
                      <button className="btn danger" onClick={() => deleteHold(h.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
