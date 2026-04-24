import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, downloadWithAuth } from '../lib/api';
import { apiBaseUrl } from '../lib/api';
import { clearAuth, getAuth } from '../lib/auth';
import { getJson, setJson } from '../lib/storage';
import {
  mulPaiseByQtyMilli,
  mulPaiseByRateBp,
  paiseStringToBigInt,
  paiseToRupeesString,
  qtyToMilliBigInt,
  rupeesToPaiseBigInt
} from '../lib/money';

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

const POS_KEY = 'shrx_pos_state_v1';
const HOLDS_KEY = 'shrx_pos_holds_v1';

type PosState = { warehouseId?: string };
type Step = 1 | 2 | 3 | 4 | 5;

function openBlob(blob: Blob, mime: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: mime }));
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function newId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function parseQtyAvailable(q: string | undefined) {
  if (!q) return null;
  const n = Number(q);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function PosWizardPage() {
  const nav = useNavigate();
  const auth = getAuth();

  const [store, setStore] = useState<Store | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [posState, setPosState] = useState<PosState>(() => getJson<PosState>(POS_KEY) ?? {});

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProductId, setStockByProductId] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<'WALK_IN' | 'DELIVERY'>('WALK_IN');
  const [placeOfSupply, setPlaceOfSupply] = useState('');

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPincode, setDeliveryPincode] = useState('');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [payMethod, setPayMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [upiRef, setUpiRef] = useState('');

  const [holds, setHolds] = useState<HoldBill[]>(() => getJson<HoldBill[]>(HOLDS_KEY) ?? []);
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [holdTitle, setHoldTitle] = useState('');

  const [step, setStep] = useState<Step>(1);
  const [invoiceResult, setInvoiceResult] = useState<{ id: string; invoiceNo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setJson(POS_KEY, posState), [posState]);
  useEffect(() => setJson(HOLDS_KEY, holds), [holds]);

  useEffect(() => {
    if (!auth?.accessToken) nav('/login', { replace: true });
  }, [auth?.accessToken, nav]);

  useEffect(() => {
    let active = true;
    (async () => {
      setError(null);
      try {
        const storesRes = await apiFetch<{ stores: Store[] }>('/stores');
        const s = storesRes.stores.find((x) => x.id === auth?.user.storeId) ?? null;
        if (!active) return;
        setStore(s);
        if (s?.stateCode) setPlaceOfSupply(s.stateCode);

        if (auth?.user.storeId) {
          const w = await apiFetch<{ warehouses: Warehouse[] }>(`/warehouses?storeId=${auth.user.storeId}`);
          if (!active) return;
          setWarehouses(w.warehouses);
          setPosState((prev) => ({ ...prev, warehouseId: prev.warehouseId ?? w.warehouses[0]?.id }));
        }

        const prods = await apiFetch<{ products: Product[] }>('/products?channel=POS');
        if (!active) return;
        setAllProducts(prods.products);
        setProducts(prods.products);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Failed to load POS');
      }
    })();
    return () => {
      active = false;
    };
  }, [auth?.user.storeId]);

  useEffect(() => {
    const query = q.trim().toLowerCase();
    const filtered = query ? allProducts.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(query)) : allProducts;
    setProducts(filtered);
  }, [q, allProducts]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!posState.warehouseId) return;
        const stock = await apiFetch<{ stock: Array<{ product: Product; qtyAvailable: string }> }>(
          `/inventory/stock?warehouseId=${posState.warehouseId}`
        );
        if (!active) return;
        const map: Record<string, string> = {};
        for (const s of stock.stock) map[s.product.id] = s.qtyAvailable;
        setStockByProductId(map);
      } catch {
        return;
      }
    })();
    return () => {
      active = false;
    };
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

      return { line: l, total: lineTotal };
    });

    const total = taxable + cgst + sgst + igst;
    return { lines, taxable, cgst, sgst, igst, total, intra };
  }, [cart, placeOfSupply, store?.stateCode]);

  function canContinueFromStep(s: Step) {
    if (s === 1) return !!posState.warehouseId && /^\d{2}$/.test(placeOfSupply.trim());
    if (s === 2) {
      if (mode === 'DELIVERY') {
        if (!deliveryAddress.trim()) return false;
        if (deliveryPincode.trim() && !/^\d{6}$/.test(deliveryPincode.trim())) return false;
      }
      return true;
    }
    if (s === 3) return cart.length > 0;
    if (s === 4) {
      if (payMethod === 'UPI') return upiRef.trim().length > 0;
      return true;
    }
    return true;
  }

  function next() {
    if (!canContinueFromStep(step)) return;
    setStep((prev) => (prev === 5 ? 5 : ((prev + 1) as Step)));
    if (step === 2) setTimeout(() => searchRef.current?.focus(), 0);
  }

  function back() {
    setStep((prev) => (prev === 1 ? 1 : ((prev - 1) as Step)));
  }

  async function ensureCustomerId() {
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
    const res = await apiFetch<{ customer: Customer }>('/customers', { method: 'POST', body: JSON.stringify(payload) });
    setSelectedCustomer(res.customer);
    return res.customer.id;
  }

  async function checkout() {
    if (!posState.warehouseId) return;
    if (cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      if (payMethod === 'UPI' && !upiRef.trim()) throw new Error('Enter UPI Reference (UTR)');

      const wantsCustomer = !!customerName.trim() || !!customerPhone.trim() || mode === 'DELIVERY';
      const customerId = wantsCustomer ? await ensureCustomerId() : undefined;

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
      setStep(5);
      setCart([]);
      setHoldTitle('');
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
      const { blob, contentType } = await downloadWithAuth(`/print/jobs/${job.jobId}/download`);
      openBlob(blob, contentType);
    } catch (err: any) {
      setError(err?.message || 'Print failed');
    } finally {
      setBusy(false);
    }
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
    setStep(1);
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
    setStep(3);
    setHoldsOpen(false);
  }

  function deleteHold(id: string) {
    setHolds((prev) => prev.filter((h) => h.id !== id));
  }

  function logout() {
    clearAuth();
    nav('/login', { replace: true });
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (e.key === 'Escape') {
        if (holdsOpen) {
          e.preventDefault();
          setHoldsOpen(false);
          return;
        }
      }

      if (e.key === '/' && !typing && step === 3) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (e.key === 'Enter' && !typing) {
        if (step >= 1 && step <= 4) {
          e.preventDefault();
          next();
          return;
        }
      }

      if (e.key === 'Backspace' && !typing) {
        if (step >= 2 && step <= 4) {
          e.preventDefault();
          back();
          return;
        }
      }

      if (e.key === 'F2') {
        if (step === 4) {
          e.preventDefault();
          checkout();
        }
        return;
      }

      if (e.key === 'F3') {
        if (step === 5 && invoiceResult) {
          e.preventDefault();
          print('THERMAL_80MM');
        }
        return;
      }

      if (e.key === 'F4') {
        if (step === 5 && invoiceResult) {
          e.preventDefault();
          print('A4');
        }
        return;
      }

      if (e.key === 'F6') {
        if (step >= 3 && step <= 4) {
          e.preventDefault();
          holdBill();
        }
        return;
      }

      if (e.key === 'F7') {
        e.preventDefault();
        setHoldsOpen(true);
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
  }, [step, holdsOpen, invoiceResult, next, back, checkout, print, holdBill, clearBill]);

  const progress = (step / 5) * 100;

  return (
    <div className="gWrap">
      <div className="gTop">
        <div className="gBrand">
          <img src={`${apiBaseUrl()}/assets/logo.svg`} alt="Shr-x ERP" className="gLogo" />
          <div className="gMeta">
            <div className="gTitle">Level {step} / 5</div>
            <div className="gSub">
              {store ? `${store.code} · ${store.name}` : 'Loading store…'} {auth ? `· ${auth.user.fullName}` : ''}
            </div>
          </div>
        </div>
        <div className="gActions">
          <button className="gBtn ghost" onClick={() => setHoldsOpen(true)}>
            Recall (F7)
          </button>
          <button className="gBtn ghost" onClick={clearBill}>
            New (F8)
          </button>
          <button className="gBtn ghost" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="gProgress">
        <div className="gProgressBar" style={{ width: `${progress}%` }} />
      </div>

      {error ? <div className="gToast">{error}</div> : null}

      <div className="gStage">
        {step === 1 ? (
          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardT">Level 1 · Setup</div>
              <div className="gHint">Choose warehouse and place of supply</div>
            </div>
            <div className="gCardBd">
              <div className="gRow">
                <button className={`gBtn ${mode === 'WALK_IN' ? '' : 'ghost'}`} onClick={() => setMode('WALK_IN')}>
                  Walk-in
                </button>
                <button className={`gBtn ${mode === 'DELIVERY' ? '' : 'ghost'}`} onClick={() => setMode('DELIVERY')}>
                  Delivery
                </button>
              </div>
              <div className="gGrid2">
                <div className="gField">
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
                <div className="gField">
                  <label>Place of Supply (State Code)</label>
                  <input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="29" />
                  <div className="gHelp">2 digits. Karnataka = 29</div>
                </div>
              </div>
            </div>
            <div className="gCardFt">
              <div className="gHelp">Press Enter to continue</div>
              <button className="gBtn" onClick={next} disabled={!canContinueFromStep(1)}>
                Continue →
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardT">Level 2 · Customer</div>
              <div className="gHint">Name/phone optional for walk-in. Required for delivery</div>
            </div>
            <div className="gCardBd">
              <div className="gGrid2">
                <div className="gField">
                  <label>Customer name</label>
                  <input
                    value={customerName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerName(v);
                      if (selectedCustomer && v.trim() !== selectedCustomer.fullName.trim()) setSelectedCustomer(null);
                    }}
                    placeholder="Walk-in Customer"
                  />
                </div>
                <div className="gField">
                  <label>Phone (10 digits)</label>
                  <input
                    value={customerPhone}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerPhone(v);
                      if (selectedCustomer && (selectedCustomer.phone ?? '') !== v.trim()) setSelectedCustomer(null);
                    }}
                    placeholder="9123456789"
                  />
                  <div className="gHelp">Auto-detects existing customer</div>
                </div>
              </div>
              {selectedCustomer ? (
                <div className="gPill">
                  Using existing customer: {selectedCustomer.fullName} {selectedCustomer.phone ? `· ${selectedCustomer.phone}` : ''}
                </div>
              ) : null}

              {mode === 'DELIVERY' ? (
                <div className="gGrid2" style={{ marginTop: 10 }}>
                  <div className="gField">
                    <label>Delivery address</label>
                    <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="#45, 2nd Floor&#10;Indiranagar&#10;Bangalore - 560038" />
                  </div>
                  <div className="gField">
                    <label>Pincode</label>
                    <input value={deliveryPincode} onChange={(e) => setDeliveryPincode(e.target.value)} placeholder="560038" />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="gCardFt">
              <button className="gBtn ghost" onClick={back}>
                ← Back
              </button>
              <button className="gBtn" onClick={next} disabled={!canContinueFromStep(2)}>
                Continue →
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardT">Level 3 · Pick Products</div>
              <div className="gHint">Quick Add from cards. Press / to focus search</div>
            </div>
            <div className="gCardBd">
              <div className="gRow">
                <input
                  ref={searchRef}
                  className="gSearch"
                  placeholder="Search products…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <button className="gBtn ghost" onClick={() => setQ('')} disabled={!q.trim()}>
                  Clear
                </button>
              </div>
              <div className="gProducts">
                {products.map((p) => {
                  const s = displayedStock(p.id);
                  const stockLabel = s === null ? '—' : s <= 0 ? 'Out' : s <= 2 ? 'Low' : 'In';
                  const stockClass = s === null ? 'gStock' : s <= 0 ? 'gStock out' : s <= 2 ? 'gStock low' : 'gStock';
                  const img =
                    p.imageUrl ||
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%23f59e0b"/><stop offset="1" stop-color="%23fb7185"/></linearGradient></defs><rect width="100%25" height="100%25" fill="%230b1220"/><circle cx="180" cy="150" r="70" fill="url(%23g)"/><text x="50%25" y="78%25" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="%23e2e8f0">SUTRA</text></svg>';
                  return (
                    <div key={p.id} className="gProd">
                      <div className="gProdImg">
                        <img
                          src={img}
                          alt=""
                          onError={(e) => {
                            (e.currentTarget as any).src = img;
                          }}
                        />
                      </div>
                      <div className="gProdBd">
                        <div className="gProdName">{p.name}</div>
                        <div className="gProdMeta">{p.code} · GST {(p.gstRateBp / 100).toFixed(0)}%</div>
                        <div className="gRow" style={{ justifyContent: 'space-between' }}>
                          <div className="gPrice">₹{(Number(paiseStringToBigInt(p.sellingPricePaise)) / 100).toFixed(2)}</div>
                          <span className={stockClass}>
                            {stockLabel} · {s === null ? '—' : s.toFixed(3)}
                          </span>
                        </div>
                        <button className="gBtn" onClick={() => addToCart(p)} disabled={s !== null && s <= 0}>
                          + Quick Add
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="gCardFt">
              <button className="gBtn ghost" onClick={back}>
                ← Back
              </button>
              <div className="gHelp">Add at least 1 item</div>
              <button className="gBtn" onClick={next} disabled={!canContinueFromStep(3)}>
                Continue →
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardT">Level 4 · Checkout</div>
              <div className="gHint">Review cart + payment. F6 hold, F2 checkout</div>
            </div>
            <div className="gCardBd">
              <div className="gCart">
                {preview.lines.map(({ line, total }, idx) => (
                  <div key={line.product.id} className="gCartItem">
                    <div className="gRow" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <div className="gCartName">{line.product.name}</div>
                        <div className="gHelp">{line.product.code}</div>
                      </div>
                      <div className="gPrice">₹{paiseToRupeesString(total)}</div>
                    </div>
                    <div className="gGrid3">
                      <div className="gField">
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
                      <div className="gField">
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
                      <div className="gField">
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
                    <div className="gRow">
                      <button className="gBtn ghost" onClick={() => addToCart(line.product)}>
                        +1
                      </button>
                      <button className="gBtn danger" onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="gTotals">
                <div className="gTotRow">
                  <div className="gHelp">Taxable</div>
                  <div>₹{paiseToRupeesString(preview.taxable)}</div>
                </div>
                <div className="gTotRow">
                  <div className="gHelp">CGST</div>
                  <div>₹{paiseToRupeesString(preview.cgst)}</div>
                </div>
                <div className="gTotRow">
                  <div className="gHelp">SGST</div>
                  <div>₹{paiseToRupeesString(preview.sgst)}</div>
                </div>
                <div className="gTotRow">
                  <div className="gHelp">IGST</div>
                  <div>₹{paiseToRupeesString(preview.igst)}</div>
                </div>
                <div className="gTotGrand">
                  <div>Total</div>
                  <div>₹{paiseToRupeesString(preview.total)}</div>
                </div>
              </div>

              <div className="gPay">
                <div className="gRow">
                  <button className={`gBtn ${payMethod === 'CASH' ? '' : 'ghost'}`} onClick={() => setPayMethod('CASH')}>
                    Cash
                  </button>
                  <button className={`gBtn ${payMethod === 'UPI' ? '' : 'ghost'}`} onClick={() => setPayMethod('UPI')}>
                    UPI
                  </button>
                </div>
                {payMethod === 'UPI' ? (
                  <div className="gField">
                    <label>UPI Reference (UTR)</label>
                    <input value={upiRef} onChange={(e) => setUpiRef(e.target.value)} placeholder="Eg: 323456789012" />
                    <div className="gHelp">UTR/Reference shown after payment in PhonePe/GPay/Paytm</div>
                  </div>
                ) : null}
                <div className="gField">
                  <label>Hold name (optional)</label>
                  <input value={holdTitle} onChange={(e) => setHoldTitle(e.target.value)} placeholder="Eg: Customer 2 / Phone order" />
                </div>
              </div>
            </div>
            <div className="gCardFt">
              <button className="gBtn ghost" onClick={back}>
                ← Back
              </button>
              <div className="gRow">
                <button className="gBtn ghost" onClick={holdBill} disabled={cart.length === 0}>
                  Hold (F6)
                </button>
                <button className="gBtn" onClick={checkout} disabled={busy || cart.length === 0 || !canContinueFromStep(4)}>
                  {busy ? 'Processing…' : 'Checkout (F2)'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardT">Level 5 · Print</div>
              <div className="gHint">Invoice created. Print & finish</div>
            </div>
            <div className="gCardBd">
              <div className="gWin">
                <div className="gWinBadge">Success</div>
                <div className="gWinNo">{invoiceResult?.invoiceNo}</div>
                <div className="gHelp">F3 thermal · F4 A4</div>
              </div>
              <div className="gRow" style={{ marginTop: 12 }}>
                <button className="gBtn" onClick={() => print('THERMAL_80MM')} disabled={busy || !invoiceResult}>
                  Print Thermal (F3)
                </button>
                <button className="gBtn" onClick={() => print('A4')} disabled={busy || !invoiceResult}>
                  Print A4 (F4)
                </button>
                <button className="gBtn ghost" onClick={clearBill} disabled={busy}>
                  New Bill (F8)
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {holdsOpen ? (
        <div className="gModalBack" onMouseDown={() => setHoldsOpen(false)}>
          <div className="gModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Recall Bill</div>
              <button className="gBtn ghost" onClick={() => setHoldsOpen(false)}>
                Close
              </button>
            </div>
            <div className="gModalBd">
              {holds.length === 0 ? (
                <div className="gHelp">No held bills</div>
              ) : (
                holds.map((h) => (
                  <div key={h.id} className="gHold">
                    <div>
                      <div style={{ fontWeight: 900 }}>{h.title}</div>
                      <div className="gHelp">
                        {new Date(h.createdAt).toLocaleString()} · {h.mode} · Items {h.cart.length}
                      </div>
                    </div>
                    <div className="gRow">
                      <button className="gBtn" onClick={() => recallBill(h.id)}>
                        Load
                      </button>
                      <button className="gBtn danger" onClick={() => deleteHold(h.id)}>
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
