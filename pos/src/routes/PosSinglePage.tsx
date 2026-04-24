import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiBaseUrl, apiFetch, downloadWithAuth, publicApiBaseUrl, stripApiPrefix } from '../lib/api';
import { clearAuth, getAuth, getAllSessions, switchSession, removeSession, type AuthState } from '../lib/auth';
import { setAdminUnlocked } from '../lib/admin-unlock';
import { getJson, setJson } from '../lib/storage';
import {
  mulPaiseByQtyMilli,
  mulPaiseByRateBp,
  paiseStringToBigInt,
  paiseToRupeesString,
  qtyToMilliBigInt,
  rupeesToPaiseBigInt
} from '../lib/money';
import { StitchingPosModal } from '../components/StitchingPosModal';

type Store = {
  id: string;
  code: string;
  name: string;
  stateCode: string;
  address: string;
  phone?: string | null;
  gstin?: string | null;
  footerNote?: string | null;
};
type Warehouse = { id: string; name: string; storeId: string; isActive?: boolean };
type Product = {
  id: string;
  code: string;
  name: string;
  sizeLabel?: string;
  parentProductId?: string | null;
  hsnCode: string;
  gstRateBp: number;
  sellingPricePaise: string;
  imageUrl?: string | null;
  categoryId?: string | null;
};
type Category = {
  id: string;
  name: string;
  imageUrl?: string | null;
};
type Customer = {
  id: string;
  fullName: string;
  phone?: string;
  stateCode?: string;
  gstin?: string | null;
  isBusiness?: boolean | null;
  address?: string | null;
  pincode?: string | null;
  isBlocked?: boolean | null;
  creditDuePaise?: string | null;
};
type LoyaltyInfo = {
  pointsBalance: number;
  lastInvoiceNo?: string;
  lastInvoiceDate?: string;
};
type CouponInfo = {
  id: string;
  code: string;
  title: string | null;
  amountPaise: string;
  usesRemaining: number;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
};
type ReturnLookupLine = {
  id: string;
  lineNo: number;
  productId: string;
  productName: string;
  hsnCode: string;
  gstRateBp: number;
  qty: string;
  returnableQty: string;
  unitPricePaise: string;
  discountPaise: string;
  taxableValuePaise: string;
  cgstAmountPaise: string;
  sgstAmountPaise: string;
  igstAmountPaise: string;
  lineTotalPaise: string;
};
type SalesInvoiceSummary = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  grandTotalPaise: string;
};

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
  payMethod: 'CASH' | 'UPI' | 'CREDIT';
  upiRef: string;
};

const POS_KEY = 'shrx_pos_state_v1';
const HOLDS_KEY = 'shrx_pos_holds_v1';

type PosState = { warehouseId?: string; orderType?: 'B2C' | 'B2B' };

function openBlob(blob: Blob, mime: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: mime }));
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function newId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function normalizeIndiaPhone(input: string) {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  'andaman and nicobar islands': '35',
  'andhra pradesh': '37',
  'arunachal pradesh': '12',
  assam: '18',
  bihar: '10',
  chandigarh: '04',
  chhattisgarh: '22',
  'dadra and nagar haveli and daman and diu': '26',
  delhi: '07',
  goa: '30',
  gujarat: '24',
  haryana: '06',
  'himachal pradesh': '02',
  'jammu and kashmir': '01',
  jharkhand: '20',
  karnataka: '29',
  kerala: '32',
  ladakh: '38',
  lakshadweep: '31',
  'madhya pradesh': '23',
  maharashtra: '27',
  manipur: '14',
  meghalaya: '17',
  mizoram: '15',
  nagaland: '13',
  odisha: '21',
  puducherry: '34',
  punjab: '03',
  rajasthan: '08',
  sikkim: '11',
  'tamil nadu': '33',
  telangana: '36',
  tripura: '16',
  'uttar pradesh': '09',
  uttarakhand: '05',
  'west bengal': '19'
};

function normalizeStateCode(input: string) {
  const raw = (input || '').trim();
  if (/^\d{2}$/.test(raw)) return raw;
  const key = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  return STATE_NAME_TO_CODE[key] || null;
}

function parseQtyAvailable(q: string | undefined) {
  if (!q) return null;
  const n = Number(q);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function PosSinglePage() {
  const nav = useNavigate();
  const auth = getAuth();

  const [store, setStore] = useState<Store | null>(null);
  const [storesList, setStoresList] = useState<Store[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [posState, setPosState] = useState<PosState>(() => getJson<PosState>(POS_KEY) ?? {});

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSizeByProductId, setSelectedSizeByProductId] = useState<Record<string, string>>({});
  const [stockByProductId, setStockByProductId] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<AuthState[]>(() => getAllSessions());
  const [showUserSwitcher, setShowUserSwitcher] = useState(false);
  const [mediaBust, setMediaBust] = useState(0);
  const [adminUnlockOpen, setAdminUnlockOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminUnlockError, setAdminUnlockError] = useState<string | null>(null);
  const [adminUnlockBusy, setAdminUnlockBusy] = useState(false);

  const [mode, setMode] = useState<'WALK_IN' | 'DELIVERY'>('WALK_IN');
  const [placeOfSupply, setPlaceOfSupply] = useState('');

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerStateCode, setCustomerStateCode] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPincode, setCustomerPincode] = useState('');
  const [customerCreditDuePaise, setCustomerCreditDuePaise] = useState<bigint>(0n);
  const [settleCustomerDue, setSettleCustomerDue] = useState(false);
  const [creditSettlementRupees, setCreditSettlementRupees] = useState('');
  const [duePayMethod, setDuePayMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [dueUpiRef, setDueUpiRef] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPincode, setDeliveryPincode] = useState('');


  const [cart, setCart] = useState<CartLine[]>([]);
  const [stitchingOpen, setStitchingOpen] = useState(false);
  const [stitchingOrderId, setStitchingOrderId] = useState<string | null>(null);
  const [stitchingOrderCode, setStitchingOrderCode] = useState<string | null>(null);
  const [stitchingTailorPhone, setStitchingTailorPhone] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<'CASH' | 'UPI' | 'CREDIT'>('CASH');
  const [upiRef, setUpiRef] = useState('');
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [couponInfo, setCouponInfo] = useState<CouponInfo | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [returnsOpen, setReturnsOpen] = useState(false);
  const [returnInvoiceNo, setReturnInvoiceNo] = useState('');
  const [returnLookupBusy, setReturnLookupBusy] = useState(false);
  const [returnLookupError, setReturnLookupError] = useState<string | null>(null);
  const [returnLookup, setReturnLookup] = useState<{ invoice: any; lines: ReturnLookupLine[] } | null>(null);
  const [returnQtyByLineId, setReturnQtyByLineId] = useState<Record<string, string>>({});
  const [returnSubmitBusy, setReturnSubmitBusy] = useState(false);
  const [returnResult, setReturnResult] = useState<any | null>(null);
  const [returnSharePhone, setReturnSharePhone] = useState<string>('');
  const [returnPhoneModalOpen, setReturnPhoneModalOpen] = useState(false);
  const [returnPhoneInput, setReturnPhoneInput] = useState('');


  const [holds, setHolds] = useState<HoldBill[]>(() => getJson<HoldBill[]>(HOLDS_KEY) ?? []);
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null);
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [holdTitle, setHoldTitle] = useState('');
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [invoiceQ, setInvoiceQ] = useState('');
  const [invoiceList, setInvoiceList] = useState<SalesInvoiceSummary[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [discountsOpen, setDiscountsOpen] = useState(false);

  const [invoiceResult, setInvoiceResult] = useState<{ id: string; invoiceNo: string; grandTotalPaise?: string } | null>(null);
  const [dueSettlementResult, setDueSettlementResult] = useState<{ id: string; referenceNo: string; amountPaise: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storeSettingsOpen, setStoreSettingsOpen] = useState(false);
  const [storeForm, setStoreForm] = useState({
    name: '',
    phone: '',
    address: '',
    gstin: '',
    footerNote: ''
  });
  const [storeSaving, setStoreSaving] = useState(false);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catImageUrl, setCatImageUrl] = useState('');
  const [catEditingId, setCatEditingId] = useState<string | null>(null);
  const [catFile, setCatFile] = useState<File | null>(null);
  const [productsOpen, setProductsOpen] = useState(false);
  const [prodQ, setProdQ] = useState('');
  const [prodEditingId, setProdEditingId] = useState<string | null>(null);
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodFile, setProdFile] = useState<File | null>(null);

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
        setStoreForm({
          name: s?.name || '',
          phone: s?.phone || '',
          address: s?.address || '',
          gstin: s?.gstin || '',
          footerNote: s?.footerNote || ''
        });

        if (auth?.user.storeId) {
          const w = await apiFetch<{ warehouses: Warehouse[] }>(`/warehouses?storeId=${auth.user.storeId}`);
          if (!active) return;
          setWarehouses(w.warehouses);
          const prevWarehouseId = getJson<PosState>(POS_KEY)?.warehouseId;
          const existing = prevWarehouseId && w.warehouses.some((x) => x.id === prevWarehouseId) ? prevWarehouseId : undefined;
          const fallbackId = existing ?? w.warehouses[0]?.id;
          if (fallbackId) {
            setPosState((prev) => {
              const current = prev.warehouseId;
              const currentValid = !!current && w.warehouses.some((x) => x.id === current);
              if (currentValid) return prev;
              return { ...prev, warehouseId: fallbackId };
            });
          }
        }

        const prods = await apiFetch<{ products: Product[] }>('/products?channel=POS');
        if (!active) return;
        setAllProducts(prods.products);
        setProducts(prods.products);

        const cats = await apiFetch<{ categories: Category[] }>('/categories?channel=POS');
        if (!active) return;
        setCategories(cats.categories || []);
        setActiveCategoryId((prev) => (prev && (cats.categories || []).some((c) => c.id === prev) ? prev : null));

        // No need to fetch all users here anymore as we use local sessions
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

  useEffect(() => {
    const phone = (customerPhone || selectedCustomer?.phone || '').trim();
    if (!/^\d{10}$/.test(phone)) {
      setLoyalty(null);
      return;
    }

    let alive = true;
    const t = window.setTimeout(async () => {
      setLoyaltyLoading(true);
      try {
        const res = await apiFetch<any>(`/loyalty?phone=${encodeURIComponent(phone)}`);
        if (!alive) return;
        const last = Array.isArray(res?.purchases) && res.purchases.length ? res.purchases[0] : null;
        setLoyalty({
          pointsBalance: Number(res?.pointsBalance ?? 0),
          lastInvoiceNo: last?.invoiceNo,
          lastInvoiceDate: last?.invoiceDate
        });
      } catch {
        if (!alive) return;
        setLoyalty(null);
      } finally {
        if (!alive) return;
        setLoyaltyLoading(false);
      }
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [customerPhone, selectedCustomer?.phone]);

  useEffect(() => {
    if (!invoicesOpen) return;
    refreshInvoiceList();
  }, [invoicesOpen]);

  async function refreshCategories() {
    const cats = await apiFetch<{ categories: Category[] }>('/categories?channel=POS');
    setCategories(cats.categories || []);
    setActiveCategoryId((prev) => (prev && (cats.categories || []).some((c) => c.id === prev) ? prev : null));
  }

  async function createCategory() {
    const name = catName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string; name: string; imageUrl?: string | null }>('/categories', {
        method: 'POST',
        body: JSON.stringify({ name, imageUrl: catImageUrl.trim() || undefined })
      });
      if (catFile) {
        const fd = new FormData();
        fd.append('file', catFile);
        await apiFetch(`/categories/${created.id}/image`, { method: 'POST', body: fd });
      }
      await refreshCategories();
      setMediaBust((v) => v + 1);
      setCatName('');
      setCatImageUrl('');
      setCatFile(null);
      setActiveCategoryId(created.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to create category');
    } finally {
      setBusy(false);
    }
  }

  function startEditCategory(c: Category) {
    setCatEditingId(c.id);
    setCatName(c.name);
    setCatImageUrl(c.imageUrl || '');
    setCatFile(null);
  }

  async function saveCategory() {
    if (!catEditingId) return;
    const name = catName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/categories/${catEditingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, imageUrl: catImageUrl.trim() || undefined })
      });
      if (catFile) {
        const fd = new FormData();
        fd.append('file', catFile);
        await apiFetch(`/categories/${catEditingId}/image`, { method: 'POST', body: fd });
      }
      await refreshCategories();
      setMediaBust((v) => v + 1);
      setCatEditingId(null);
      setCatName('');
      setCatImageUrl('');
      setCatFile(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to update category');
    } finally {
      setBusy(false);
    }
  }

  async function refreshProducts() {
    const prods = await apiFetch<{ products: Product[] }>('/products?channel=POS');
    setAllProducts(prods.products);
  }

  function startEditProduct(p: Product) {
    setProdEditingId(p.id);
    setProdImageUrl(p.imageUrl || '');
    setProdFile(null);
  }

  async function saveProductMedia() {
    if (!prodEditingId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/products/${prodEditingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageUrl: prodImageUrl.trim() || '' })
      });
      if (prodFile) {
        const fd = new FormData();
        fd.append('file', prodFile);
        await apiFetch(`/products/${prodEditingId}/image`, { method: 'POST', body: fd });
      }
      await refreshProducts();
      setMediaBust((v) => v + 1);
      setProdEditingId(null);
      setProdImageUrl('');
      setProdFile(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to update product');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const query = q.trim().toLowerCase();
    const base = allProducts.filter((p) => !p.parentProductId);
    const filtered = query ? base.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(query)) : base;
    setProducts(filtered);
  }, [q, allProducts]);

  const variantsByParentId = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of allProducts) {
      if (!p.parentProductId) continue;
      const arr = m.get(p.parentProductId) || [];
      arr.push(p);
      m.set(p.parentProductId, arr);
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => (a.sizeLabel || '').localeCompare(b.sizeLabel || ''));
      m.set(k, arr);
    }
    return m;
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!activeCategoryId) return true;
      return p.categoryId === activeCategoryId;
    });
  }, [products, activeCategoryId]);

  function applySavedCustomer(c: Customer, forceBusinessDetails = false) {
    setSelectedCustomer(c);
    const fillBusiness = forceBusinessDetails || posState.orderType === 'B2B';
    if (fillBusiness) {
      setCustomerName(c.fullName || '');
      if (c.gstin) setCustomerGstin(c.gstin);
      if (c.stateCode) {
        setCustomerStateCode(c.stateCode);
        setPlaceOfSupply(c.stateCode);
      }
      if (c.address) setCustomerAddress(c.address);
      if (c.pincode) setCustomerPincode(c.pincode);
      return;
    }
    if (!customerName.trim()) setCustomerName(c.fullName);
  }

  useEffect(() => {
    setRedeemPoints(0);
  }, [selectedCustomer?.id]);

  const cartQtyByProductId = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.product.id, (m.get(l.product.id) || 0) + l.qty);
    return m;
  }, [cart]);

  function displayedStock(productId: string) {
    const base = parseQtyAvailable(stockByProductId[productId]);
    if (base === null) return null;
    const used = cartQtyByProductId.get(productId) || 0;
    const left = base - used;
    return left <= 0 ? 0 : left;
  }

  function addToCart(base: Product) {
    const variants = variantsByParentId.get(base.id) || [];
    const chosenVariantId = variants.length ? selectedSizeByProductId[base.id] : base.id;
    if (variants.length && !chosenVariantId) {
      setError('Select size');
      return;
    }
    const p = allProducts.find((x) => x.id === chosenVariantId) || base;
    const s = displayedStock(p.id);
    if (s !== null && s <= 0) {
      setError('Out of stock');
      return;
    }
    setCart((prev) => {
      const i = prev.findIndex((x) => x.product.id === p.id);
      const unit = Number(paiseStringToBigInt(p.sellingPricePaise)) / 100;
      if (i >= 0) {
        const currentQty = prev[i].qty;
        const base = parseQtyAvailable(stockByProductId[p.id]);
        if (base !== null && currentQty + 1 > base) return prev;
        const copy = [...prev];
        copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
        return copy;
      }
      return [...prev, { product: p, qty: 1, unitPriceRupees: unit, discountRupees: 0 }];
    });
  }

  async function addStitchingLine(input: { stitchingOrderId: string; stitchingOrderCode: string; tailorPhone?: string; stitchingServiceProductId: string; unitPriceRupees: number }) {
    if (stitchingOrderId) {
      setError('Only one stitching order can be billed in one invoice');
      return;
    }
    let p =
      allProducts.find((x) => x.id === input.stitchingServiceProductId) ||
      allProducts.find((x) => x.code === input.stitchingServiceProductId) ||
      null;
    if (!p) {
      try {
        const res = await apiFetch<{ product: Product }>(`/products/${encodeURIComponent(input.stitchingServiceProductId)}`);
        p = res.product || null;
        if (p) {
          setAllProducts((prev) => (prev.some((x) => x.id === p!.id) ? prev : [...prev, p!]));
        }
      } catch {
        p = null;
      }
      if (!p) {
        try {
          const res = await apiFetch<{ products: Product[] }>(
            `/products?q=${encodeURIComponent(input.stitchingServiceProductId)}&channel=POS`
          );
          const found =
            res.products.find((x) => x.id === input.stitchingServiceProductId) ||
            res.products.find((x) => x.code === input.stitchingServiceProductId) ||
            null;
          p = found;
          if (p) {
            setAllProducts((prev) => (prev.some((x) => x.id === p!.id) ? prev : [...prev, p!]));
          }
        } catch {
          p = null;
        }
      }
      if (!p) {
        setError('Stitching Service product not available in POS products');
        return;
      }
    }
    setCart((prev) => {
      const exists = prev.some((x) => x.product.id === p.id);
      if (exists) return prev;
      return [...prev, { product: p, qty: 1, unitPriceRupees: input.unitPriceRupees, discountRupees: 0 }];
    });
    setStitchingOrderId(input.stitchingOrderId);
    setStitchingOrderCode(input.stitchingOrderCode);
    setStitchingTailorPhone(input.tailorPhone || null);
  }

  const preview = useMemo(() => {
    const storeState = store?.stateCode;
    const posStateCode = placeOfSupply || storeState || '';
    const intra = !!storeState && !!posStateCode && storeState === posStateCode;

    let taxableBeforeLoyalty = 0n;
    let discountTotal = 0n;

    const raw = cart.map((l) => {
      const unitPaise = rupeesToPaiseBigInt(l.unitPriceRupees);
      const qtyMilli = qtyToMilliBigInt(l.qty);
      const base = mulPaiseByQtyMilli(unitPaise, qtyMilli);
      const discount = rupeesToPaiseBigInt(l.discountRupees);
      const lineTaxable = base - discount;
      taxableBeforeLoyalty += lineTaxable;
      discountTotal += discount;
      return { line: l, base, discount, taxable: lineTaxable };
    });

    const pointsBalance = loyalty?.pointsBalance ?? 0;
    const maxByTaxable = Number(taxableBeforeLoyalty / 100n);
    const maxRedeemPoints = Math.max(0, Math.min(pointsBalance, maxByTaxable));
    const redeemable = Math.max(0, Math.min(redeemPoints, maxRedeemPoints));
    const loyaltyDiscount = BigInt(redeemable) * 100n;

    const extraByIdx = new Map<number, bigint>();
    if (loyaltyDiscount > 0n && taxableBeforeLoyalty > 0n) {
      let remaining = loyaltyDiscount;
      for (let i = 0; i < raw.length; i += 1) {
        const share = i === raw.length - 1 ? remaining : (loyaltyDiscount * raw[i].taxable) / taxableBeforeLoyalty;
        const capped = share > raw[i].taxable ? raw[i].taxable : share;
        extraByIdx.set(i, capped);
        remaining -= capped;
      }
    }

    let taxable = 0n;
    let cgst = 0n;
    let sgst = 0n;
    let igst = 0n;

    const lines = raw.map((r, idx) => {
      const extra = extraByIdx.get(idx) ?? 0n;
      const lineTaxable = r.taxable - extra;
      const gstRateBp = r.line.product.gstRateBp;
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
      return { line: r.line, total: lineTotal };
    });

    const tax = cgst + sgst + igst;
    const subtotal = taxable + discountTotal + loyaltyDiscount;
    const total = taxable + tax;

    const couponPaise = couponInfo?.amountPaise ? paiseStringToBigInt(couponInfo.amountPaise) : 0n;
    const couponApplied = couponPaise > 0n ? (couponPaise > total ? total : couponPaise) : 0n;
    const payable = total - couponApplied;
    return {
      lines,
      subtotal,
      discountTotal: discountTotal + loyaltyDiscount,
      tax,
      taxable,
      total,
      couponApplied,
      payable,
      intra,
      loyaltyRedeemPoints: redeemable,
      loyaltyDiscountPaise: loyaltyDiscount,
      loyaltyMaxRedeemPoints: maxRedeemPoints
    };
  }, [
    cart,
    placeOfSupply,
    store?.stateCode,
    redeemPoints,
    loyalty?.pointsBalance,
    couponInfo?.amountPaise
  ]);

  const creditSettlementPaise = useMemo(() => {
    if (!settleCustomerDue) return 0n;
    const n = Number(creditSettlementRupees);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return rupeesToPaiseBigInt(n);
  }, [settleCustomerDue, creditSettlementRupees]);

  useEffect(() => {
    const p = selectedCustomer?.creditDuePaise;
    setCustomerCreditDuePaise(p ? paiseStringToBigInt(p) : 0n);
  }, [selectedCustomer?.id, selectedCustomer?.creditDuePaise]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiFetch<{ stores: Store[] }>('/stores');
        if (!active) return;
        setStoresList(res.stores || []);
      } catch {
        if (!active) return;
        setStoresList([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const phone = customerPhone.trim();
    if (!/^\d{10}$/.test(phone)) return;
    let active = true;
    const t = window.setTimeout(() => {
      (async () => {
        try {
          const res = await apiFetch<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(phone)}`);
          const exact = res.customers.find((c) => (c.phone ?? '') === phone);
          if (!active || !exact) return;
          applySavedCustomer(exact);
        } catch {
          // ignore
        }
      })();
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [customerPhone, posState.orderType, customerName]);

  useEffect(() => {
    if (couponInfo) setSettleCustomerDue(false);
  }, [couponInfo?.code]);

  async function validateCoupon() {
    const raw = couponCode.trim();
    if (!raw) {
      setCouponInfo(null);
      setCouponError(null);
      return;
    }
    setCouponBusy(true);
    setCouponError(null);
    try {
      const res = await apiFetch<{ coupon: CouponInfo }>(`/coupons/validate?code=${encodeURIComponent(raw)}`);
      setCouponInfo(res.coupon);
      setCouponCode(res.coupon.code);
    } catch (e: any) {
      setCouponInfo(null);
      setCouponError(e?.message || 'Invalid coupon');
    } finally {
      setCouponBusy(false);
    }
  }

  function clearCoupon() {
    setCouponCode('');
    setCouponInfo(null);
    setCouponError(null);
  }

  async function lookupReturnInvoice() {
    const invoiceNo = returnInvoiceNo.trim();
    if (!invoiceNo) return;
    setReturnLookupBusy(true);
    setReturnLookupError(null);
    setReturnLookup(null);
    setReturnQtyByLineId({});
    setReturnResult(null);
    try {
      const res = await apiFetch<{ invoice: any; lines: ReturnLookupLine[] }>(
        `/sales/invoices/lookup?invoiceNo=${encodeURIComponent(invoiceNo)}`
      );
      setReturnLookup(res);
    } catch (e: any) {
      setReturnLookupError(e?.message || 'Invoice lookup failed');
    } finally {
      setReturnLookupBusy(false);
    }
  }

  async function submitReturn() {
    if (!posState.warehouseId) return;
    if (!returnLookup?.invoice?.invoiceNo) return;
    setReturnSubmitBusy(true);
    setReturnLookupError(null);
    try {
      const nextSharePhone = String(returnLookup?.invoice?.customer?.phone || '');
      const lines = (returnLookup.lines || [])
        .map((l) => {
          const raw = (returnQtyByLineId[l.id] || '').trim();
          const qty = raw ? Number(raw) : 0;
          const max = Number(l.returnableQty);
          const safeQty = Number.isFinite(qty) ? Math.max(0, Math.min(qty, max)) : 0;
          return { salesInvoiceLineId: l.id, qty: safeQty };
        })
        .filter((x) => x.qty > 0);

      if (lines.length === 0) throw new Error('Select at least 1 item to return');

      const res = await apiFetch<any>('/sales/returns', {
        method: 'POST',
        body: JSON.stringify({
          invoiceNo: returnLookup.invoice.invoiceNo,
          storeWarehouseId: posState.warehouseId,
          lines
        })
      });
      setReturnResult(res.salesReturn);
      setReturnSharePhone(nextSharePhone);
      setReturnLookup(null);
      setReturnQtyByLineId({});
    } catch (e: any) {
      setReturnLookupError(e?.message || 'Return failed');
    } finally {
      setReturnSubmitBusy(false);
    }
  }

  async function ensureCustomerId() {
    if (selectedCustomer?.id) return selectedCustomer.id;
    const phone = customerPhone.trim();
    const isB2b = posState.orderType === 'B2B';
    if (!customerName.trim() && /^\d{10}$/.test(phone)) {
      const res = await apiFetch<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(phone)}`);
      const exact = res.customers.find((c) => (c.phone ?? '') === phone);
      if (exact) {
        applySavedCustomer(exact, true);
        return exact.id;
      }
    }
    if (isB2b) {
      if (!customerName.trim()) throw new Error('Enter customer name');
      if (!/^\d{10}$/.test(phone)) throw new Error('Enter customer phone (10 digits)');
      const gstin = customerGstin.trim().toUpperCase();
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) throw new Error('Enter valid GSTIN');
      const sc = normalizeStateCode(customerStateCode);
      if (!sc) throw new Error('Enter customer state code (2 digits)');
      if (!customerAddress.trim()) throw new Error('Enter customer address');
      if (customerPincode.trim() && !/^\d{6}$/.test(customerPincode.trim())) throw new Error('Enter valid pincode');
    } else {
      if (!customerName.trim() && mode === 'DELIVERY') throw new Error('Enter customer name');
      if (!customerName.trim()) throw new Error('Enter customer name (or leave blank for walk-in)');
    }
    const payload: any = { fullName: customerName.trim() };
    if (phone) payload.phone = phone;
    if (isB2b) {
      payload.isBusiness = true;
      payload.gstin = customerGstin.trim().toUpperCase();
      payload.stateCode = normalizeStateCode(customerStateCode) || customerStateCode.trim();
      payload.address = customerAddress.trim();
      if (customerPincode.trim()) payload.pincode = customerPincode.trim();
    } else {
      if (placeOfSupply) payload.stateCode = placeOfSupply;
    }
    try {
      const res = await apiFetch<{ customer: Customer }>('/customers', { method: 'POST', body: JSON.stringify(payload) });
      setSelectedCustomer(res.customer);
      return res.customer.id;
    } catch (e: any) {
      if (e?.message !== 'Customer already exists' || !/^\d{10}$/.test(phone)) throw e;
      const res = await apiFetch<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(phone)}`);
      const exact = res.customers.find((c) => (c.phone ?? '') === phone);
      if (!exact) throw e;
      if (isB2b) {
        await apiFetch(`/customers/${exact.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        const refreshed = await apiFetch<{ customer: Customer }>(`/customers/${exact.id}`);
        applySavedCustomer(refreshed.customer, true);
        return refreshed.customer.id;
      }
      applySavedCustomer(exact);
      return exact.id;
    }
  }

  function canCheckout() {
    if (!posState.warehouseId) return false;
    if (!/^\d{2}$/.test(placeOfSupply.trim())) return false;
    if (cart.length === 0) {
      if (settleCustomerDue && creditSettlementPaise > 0n) {
        if (!/^\d{10}$/.test(customerPhone.trim())) return false;
        if (!customerName.trim()) return false;
        if (duePayMethod === 'UPI' && !dueUpiRef.trim()) return false;
        return true;
      }
      return false;
    }
    if (posState.orderType === 'B2B') {
      if (!customerName.trim()) return false;
      if (!/^\d{10}$/.test(customerPhone.trim())) return false;
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(customerGstin.trim().toUpperCase())) return false;
      if (!normalizeStateCode(customerStateCode)) return false;
      if (!customerAddress.trim()) return false;
      if (customerPincode.trim() && !/^\d{6}$/.test(customerPincode.trim())) return false;
    }
    if (mode === 'DELIVERY') {
      if (!deliveryAddress.trim()) return false;
      if (deliveryPincode.trim() && !/^\d{6}$/.test(deliveryPincode.trim())) return false;
    }
    if (payMethod === 'CREDIT') {
      if (!/^\d{10}$/.test(customerPhone.trim())) return false;
      if (!customerName.trim()) return false;
      if (preview.couponApplied > 0n) return false;
      if (settleCustomerDue && duePayMethod === 'UPI' && !dueUpiRef.trim()) return false;
      return true;
    }

    const toCollect = preview.payable + creditSettlementPaise;
    if (toCollect > 0n && payMethod === 'UPI' && !upiRef.trim()) return false;
    if (preview.loyaltyRedeemPoints > 0 && !selectedCustomer?.id) return false;
    if (settleCustomerDue) {
      if (!/^\d{10}$/.test(customerPhone.trim())) return false;
      if (customerCreditDuePaise <= 0n) return false;
      if (creditSettlementPaise <= 0n) return false;
      if (creditSettlementPaise > customerCreditDuePaise) return false;
      if (duePayMethod === 'UPI' && !dueUpiRef.trim()) return false;
    }
    return true;
  }

  async function checkout() {
    if (!canCheckout()) {
      setError('Complete required fields before checkout');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (cart.length === 0 && settleCustomerDue && creditSettlementPaise > 0n) {
        const customerId = await ensureCustomerId();
        const res = await apiFetch<{ settlement: { id: string; referenceNo: string; amountPaise: string } }>('/sales/credit-settlements', {
          method: 'POST',
          body: JSON.stringify({
            customerId,
            amountRupees: Number(creditSettlementRupees),
            payment: { method: duePayMethod, upiRef: duePayMethod === 'UPI' ? dueUpiRef.trim() : undefined }
          })
        });

        setInvoiceResult(null);
        setDueSettlementResult({ id: res.settlement.id, referenceNo: res.settlement.referenceNo, amountPaise: res.settlement.amountPaise });
        setShowSuccessModal(true);

        const phone = customerPhone.trim();
        if (/^\d{10}$/.test(phone)) {
          const custRes = await apiFetch<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(phone)}`);
          const exact = custRes.customers.find((c) => (c.phone ?? '') === phone);
          if (exact) setSelectedCustomer(exact);
        }

        setSettleCustomerDue(false);
        setCreditSettlementRupees('');
        setDuePayMethod('CASH');
        setDueUpiRef('');
        return;
      }

      const wantsCustomer = payMethod === 'CREDIT' || settleCustomerDue || posState.orderType === 'B2B' || !!customerName.trim() || !!customerPhone.trim() || mode === 'DELIVERY';
      const customerId = (wantsCustomer || preview.loyaltyRedeemPoints > 0) ? await ensureCustomerId() : undefined;
      const settlementRupees = settleCustomerDue ? Number(creditSettlementRupees) : 0;
      const toCollect = payMethod === 'CREDIT' ? Number(paiseToRupeesString(creditSettlementPaise)) : Number(paiseToRupeesString(preview.payable + creditSettlementPaise));
      const collectMethod = payMethod === 'CREDIT' ? duePayMethod : payMethod;
      const collectUpiRef = payMethod === 'CREDIT' ? dueUpiRef.trim() : upiRef.trim();

      const body: any = {
        storeWarehouseId: posState.warehouseId,
        customerId,
        ...(stitchingOrderId ? { stitchingOrderId } : {}),
        ...(payMethod === 'CREDIT' ? { saleOnCredit: true } : {}),
        placeOfSupplyStateCode: placeOfSupply,
        ...(preview.loyaltyRedeemPoints ? { loyaltyRedeemPoints: preview.loyaltyRedeemPoints } : {}),
        ...(preview.couponApplied > 0n && couponInfo?.code ? { couponCode: couponInfo.code } : {}),
        ...(settlementRupees > 0 ? { creditSettlementRupees: settlementRupees } : {}),
        items: cart.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
          unitPriceRupees: l.unitPriceRupees,
          discountRupees: l.discountRupees
        })),
        payment: {
          method: payMethod === 'CREDIT' && toCollect === 0 ? 'CASH' : collectMethod,
          amountRupees: toCollect,
          upiRef: (collectMethod === 'UPI' && toCollect > 0) ? collectUpiRef : undefined
        }
      };

      if (mode === 'DELIVERY') {
        body.deliveryAddress = deliveryAddress;
        if (deliveryPincode.trim()) body.deliveryPincode = deliveryPincode.trim();
      }
      if (posState.orderType === 'B2B') {
        const sc = normalizeStateCode(customerStateCode) || customerStateCode.trim();
        body.placeOfSupplyStateCode = sc;
        body.deliveryAddress = customerAddress.trim();
        if (customerPincode.trim()) body.deliveryPincode = customerPincode.trim();
      }

      const res = await apiFetch<any>('/sales/invoices', { method: 'POST', body: JSON.stringify(body) });
      setInvoiceResult({ id: res.invoice.id, invoiceNo: res.invoice.invoiceNo, grandTotalPaise: res.invoice.grandTotalPaise });
      setShowSuccessModal(true);

      // Clear the bill from holds if it was active
      if (activeHoldId) {
        setHolds((prev) => prev.filter((h) => h.id !== activeHoldId));
        setActiveHoldId(null);
      }

      setCart([]);
      setHoldTitle('');
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

  async function printDueSettlement(format: 'A4' | 'THERMAL_80MM') {
    if (!dueSettlementResult) return;
    setBusy(true);
    setError(null);
    try {
      const job = await apiFetch<any>(`/print/credit-settlements/${dueSettlementResult.id}?format=${format}`, { method: 'POST' });
      const { blob, contentType } = await downloadWithAuth(`/print/jobs/${job.jobId}/download`);
      openBlob(blob, contentType);
    } catch (err: any) {
      setError(err?.message || 'Print failed');
    } finally {
      setBusy(false);
    }
  }

  async function whatsappBill() {
    if (!invoiceResult) return;
    const phone = normalizeIndiaPhone(customerPhone || selectedCustomer?.phone || '');
    if (!phone) {
      setError('Enter customer phone to share on WhatsApp');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const inv = await apiFetch<{ invoice: { subtotalPaise: string; discountTotalPaise: string; taxTotalPaise: string; grandTotalPaise: string } }>(
        `/sales/invoices/${invoiceResult.id}`
      );
      const share = await apiFetch<{ token: string; thermalPath: string; a4Path: string; feedbackPath?: string | null }>(`/sales/invoices/${invoiceResult.id}/share`, {
        method: 'POST'
      });
      const shareBase = publicApiBaseUrl();
      const thermalUrl = `${shareBase}${stripApiPrefix(share.thermalPath)}`;
      const a4Url = `${shareBase}${stripApiPrefix(share.a4Path)}`;
      const feedbackUrl = share.feedbackPath ? `${shareBase}${stripApiPrefix(share.feedbackPath)}` : '';
      const total = paiseToRupeesString(paiseStringToBigInt(inv.invoice.grandTotalPaise));
      const who = (customerName || selectedCustomer?.fullName || 'Customer').trim();
      const storeName = store?.name || '';
      const storesLine =
        storesList.length > 0 ? storesList.map((s) => s.name).filter(Boolean).join(' | ') : (storeName ? storeName : '');

      const text =
        `Hello *${who}*\n` +
        `\n` +
        `Thank you for shopping with us!\n` +
        `\n` +
        `*Invoice Details*\n` +
        `• *Invoice Number:* ${invoiceResult.invoiceNo}${storeName ? ` (${storeName})` : ''}\n` +
        `• *Bill Value:* ₹${total}\n` +
        `• *Invoice Link:* ${thermalUrl}\n` +
        `• *A4 Bill Link:* ${a4Url}\n` +
        `\n` +
        (feedbackUrl
          ? `We’d love to hear from you!\nShare your *Feedback Here:*\n${feedbackUrl}\n\n`
          : '') +
        (storesLine ? `*Our Stores:* ${storesLine}\n\n` : '') +
        `We look forward to serving you again.\n\n` +
        `Thanks for taking a moment to read this message.\n\n`;
      const wa = `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
      const w = window.open(wa, '_blank', 'noopener,noreferrer');
      if (!w) setError('Popup blocked. Allow popups to open WhatsApp.');
    } catch (err: any) {
      setError(err?.message || 'WhatsApp share failed');
    } finally {
      setBusy(false);
    }
  }

  async function whatsappTailorSlip() {
    if (!stitchingOrderId) {
      setError('No stitching order in this bill');
      return;
    }
    const phone = normalizeIndiaPhone(stitchingTailorPhone || '');
    if (!phone) {
      setError('Tailor phone missing');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const share = await apiFetch<{ token: string; a4Path: string }>(`/pos/stitching/orders/${stitchingOrderId}/tailor-slip/share`, {
        method: 'POST'
      });
      const a4Url = `${publicApiBaseUrl()}${stripApiPrefix(share.a4Path)}`;
      const orderRef = stitchingOrderCode ? `Order ${stitchingOrderCode}` : 'Tailor Slip';
      const text =
        `Hello\n` +
        `\n` +
        `*${orderRef}*\n` +
        `• *Slip (A4):* ${a4Url}\n`;
      const wa = `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
      const w = window.open(wa, '_blank', 'noopener,noreferrer');
      if (!w) setError('Popup blocked. Allow popups to open WhatsApp.');
    } catch (err: any) {
      setError(err?.message || 'WhatsApp share failed');
    } finally {
      setBusy(false);
    }
  }

  async function refreshInvoiceList() {
    setInvoiceLoading(true);
    try {
      const res = await apiFetch<{ invoices: SalesInvoiceSummary[] }>('/sales/invoices');
      setInvoiceList(res.invoices || []);
    } catch {
      setInvoiceList([]);
    } finally {
      setInvoiceLoading(false);
    }
  }

  async function printInvoice(invoiceId: string, format: 'A4' | 'THERMAL_80MM') {
    setBusy(true);
    setError(null);
    try {
      const job = await apiFetch<any>(`/print/invoices/${invoiceId}?format=${format}`, { method: 'POST' });
      const { blob, contentType } = await downloadWithAuth(`/print/jobs/${job.jobId}/download`);
      openBlob(blob, contentType);
    } catch (err: any) {
      setError(err?.message || 'Print failed');
    } finally {
      setBusy(false);
    }
  }

  async function printReturnReceipt(salesReturnId: string, format: 'A4' | 'THERMAL_80MM') {
    setBusy(true);
    setError(null);
    try {
      const job = await apiFetch<any>(`/print/returns/${salesReturnId}?format=${format}`, { method: 'POST' });
      const { blob, contentType } = await downloadWithAuth(`/print/jobs/${job.jobId}/download`);
      openBlob(blob, contentType);
    } catch (err: any) {
      setError(err?.message || 'Print failed');
    } finally {
      setBusy(false);
    }
  }

  async function whatsappReturnReceipt() {
    if (!returnResult?.id) return;
    const phone = normalizeIndiaPhone(returnSharePhone || '');
    if (!phone) {
      setReturnPhoneInput(returnSharePhone || '');
      setReturnPhoneModalOpen(true);
      return;
    }
    await doWhatsappReturnReceipt(phone);
  }

  async function doWhatsappReturnReceipt(phone: string) {
    setBusy(true);
    setError(null);
    try {
      const share = await apiFetch<{ token: string; thermalPath: string; a4Path: string }>(`/sales/returns/${returnResult.id}/share`, {
        method: 'POST'
      });
      const shareBase = publicApiBaseUrl();
      const thermalUrl = `${shareBase}${stripApiPrefix(share.thermalPath)}`;
      const a4Url = `${shareBase}${stripApiPrefix(share.a4Path)}`;
      const amount = paiseToRupeesString(paiseStringToBigInt(returnResult.amountPaise));
      const mode = String(returnResult.mode || '');
      const extra =
        mode === 'LOYALTY'
          ? `Points: ${String(returnResult.pointsCredited || 0)} pts`
          : returnResult.couponCode
            ? `Coupon: ${String(returnResult.couponCode)}`
            : 'Coupon issued';
      const who = (returnLookup?.invoice?.customer?.fullName || customerName || 'Customer').trim();
      const storeLine = store?.name ? `\n\n*Our Store:* ${store.name}` : '';
      const text =
        `Hello *${who}*\n` +
        `\n` +
        `*Return Receipt Details*\n` +
        `• *Invoice Number:* ${returnResult.invoiceNo}\n` +
        `• *Return Amount:* ₹${amount}\n` +
        `• *Mode:* ${mode}\n` +
        `• ${extra}\n` +
        `• *Return Link:* ${thermalUrl}\n` +
        `• *A4 Link:* ${a4Url}` +
        storeLine;
      const wa = `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
      const w = window.open(wa, '_blank', 'noopener,noreferrer');
      if (!w) setError('Popup blocked. Allow popups to open WhatsApp.');
    } catch (err: any) {
      setError(err?.message || 'WhatsApp share failed');
    } finally {
      setBusy(false);
    }
  }

  async function setupAccountingSystemAccounts() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/accounting/setup-system-accounts', { method: 'POST' });
      setReturnLookupError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize accounting accounts');
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
    setCustomerGstin('');
    setCustomerStateCode('');
    setCustomerAddress('');
    setCustomerPincode('');
    setCustomerCreditDuePaise(0n);
    setSettleCustomerDue(false);
    setCreditSettlementRupees('');
    setDeliveryAddress('');
    setDeliveryPincode('');
    setCart([]);
    setStitchingOrderId(null);
    setStitchingOrderCode(null);
    setStitchingTailorPhone(null);
    setPayMethod('CASH');
    setUpiRef('');
    clearCoupon();
    setInvoiceResult(null);
    setDueSettlementResult(null);
    setActiveHoldId(null);
    setShowSuccessModal(false);
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
    setActiveHoldId(bill.id);
    setHoldsOpen(false);
  }

  function deleteHold(id: string) {
    setHolds((prev) => prev.filter((h) => h.id !== id));
  }

  function logout() {
    clearAuth();
    nav('/login', { replace: true });
  }

  async function unlockAdminPanel() {
    if (!auth?.user?.id) return;
    setAdminUnlockBusy(true);
    setAdminUnlockError(null);
    try {
      await apiFetch('/auth/verify-admin-password', {
        method: 'POST',
        body: JSON.stringify({ password: adminPassword.trim() })
      });
      setAdminUnlocked(auth.user.id, 30 * 60 * 1000);
      setAdminUnlockOpen(false);
      setAdminPassword('');
      nav('/backoffice', { replace: false });
    } catch (e: any) {
      setAdminUnlockError(e?.message || 'Invalid password');
    } finally {
      setAdminUnlockBusy(false);
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
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
        setHoldsOpen(true);
        return;
      }

      if (e.key === 'F8') {
        e.preventDefault();
        clearBill();
        return;
      }

      if (e.key === 'Escape') {
        if (holdsOpen) {
          e.preventDefault();
          setHoldsOpen(false);
          return;
        }
        if (invoicesOpen) {
          e.preventDefault();
          setInvoicesOpen(false);
          return;
        }
        if (discountsOpen) {
          e.preventDefault();
          setDiscountsOpen(false);
          return;
        }
        if (settingsMenuOpen) {
          e.preventDefault();
          setSettingsMenuOpen(false);
          return;
        }
        if (settingsOpen) {
          e.preventDefault();
          setSettingsOpen(false);
          return;
        }
        if (storeSettingsOpen) {
          e.preventDefault();
          setStoreSettingsOpen(false);
          return;
        }
        if (categoriesOpen) {
          e.preventDefault();
          setCategoriesOpen(false);
          return;
        }
        if (productsOpen) {
          e.preventDefault();
          setProductsOpen(false);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [invoiceResult, holdsOpen, invoicesOpen, discountsOpen, settingsMenuOpen, settingsOpen, storeSettingsOpen, categoriesOpen, productsOpen, checkout, print, holdBill, clearBill]);

  function decCart(productId: string) {
    setCart((prev) => {
      const i = prev.findIndex((x) => x.product.id === productId);
      if (i < 0) return prev;
      const copy = [...prev];
      const nextQty = copy[i].qty - 1;
      if (nextQty <= 0) return copy.filter((_, idx) => idx !== i);
      copy[i] = { ...copy[i], qty: nextQty };
      return copy;
    });
  }

  function incCart(product: Product) {
    addToCart(product);
  }

  async function saveStoreSettings() {
    if (!auth?.accessToken) return;
    if (!store?.id) return;
    setError(null);
    setStoreSaving(true);
    try {
      const res = await apiFetch<{ store: Store }>(`/stores/${store.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: storeForm.name,
          phone: storeForm.phone,
          address: storeForm.address,
          gstin: storeForm.gstin,
          footerNote: storeForm.footerNote
        })
      });
      setStore(res.store);
      setStoreForm({
        name: res.store.name || '',
        phone: res.store.phone || '',
        address: res.store.address || '',
        gstin: res.store.gstin || '',
        footerNote: res.store.footerNote || ''
      });
      setStoreSettingsOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save store settings');
    } finally {
      setStoreSaving(false);
    }
  }

  const editingProduct = useMemo(() => {
    if (!prodEditingId) return null;
    return products.find((p) => p.id === prodEditingId) || null;
  }, [prodEditingId, products]);

  function mediaUrl(path: string) {
    const base = apiBaseUrl();
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}?v=${mediaBust}`;
  }

  const activeCategoryName = useMemo(() => {
    if (!activeCategoryId) return 'All Categories';
    return categories.find((c) => c.id === activeCategoryId)?.name || 'Products';
  }, [activeCategoryId, categories]);

  const activeNav = useMemo(() => {
    if (holdsOpen) return 'HOLDS';
    if (invoicesOpen) return 'INVOICES';
    if (discountsOpen) return 'DISCOUNTS';
    if (returnsOpen) return 'RETURNS';
    if (settingsMenuOpen || settingsOpen || storeSettingsOpen || categoriesOpen || productsOpen) return 'SETTINGS';
    return 'POS';
  }, [holdsOpen, invoicesOpen, discountsOpen, returnsOpen, settingsMenuOpen, settingsOpen, storeSettingsOpen, categoriesOpen, productsOpen]);

  return (
    <div className="posWrap">
      <div className="posShell">
        <div className="posSide">
          <div className="posSideTop">
            <img src={`${apiBaseUrl()}/assets/logo.svg`} alt="Shr-x ERP" className="posSideLogo" />
          </div>
          <div className="posNav">
            <button className={`posNavBtn ${activeNav === 'POS' ? 'active' : ''}`} onClick={() => {
              setHoldsOpen(false);
              setInvoicesOpen(false);
              setDiscountsOpen(false);
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button className="posNavBtn" onClick={clearBill}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button className={`posNavBtn ${activeNav === 'HOLDS' ? 'active' : ''}`} onClick={() => setHoldsOpen(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="16" y2="17" />
              </svg>
            </button>
            <button className={`posNavBtn ${activeNav === 'DISCOUNTS' ? 'active' : ''}`} onClick={() => setDiscountsOpen(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="5" x2="5" y2="19" />
                <circle cx="6.5" cy="6.5" r="2.5" />
                <circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
            </button>
            <button className={`posNavBtn ${activeNav === 'RETURNS' ? 'active' : ''}`} onClick={() => {
              setReturnsOpen(true);
              setReturnInvoiceNo('');
              setReturnLookupError(null);
              setReturnLookup(null);
              setReturnQtyByLineId({});
              setReturnResult(null);
              setReturnSharePhone('');
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 14 4 9 9 4" />
                <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
              </svg>
            </button>
            {auth?.user.role === 'ADMIN' ? (
              <button className={`posNavBtn ${activeNav === 'INVOICES' ? 'active' : ''}`} onClick={() => {
                setInvoicesOpen(true);
                refreshInvoiceList();
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
            ) : null}

            {auth?.user.role === 'ADMIN' ? (
              <button className={`posNavBtn ${activeNav === 'SETTINGS' ? 'active' : ''}`} onClick={() => setSettingsMenuOpen(true)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-1.41 3.41h-.17a1.65 1.65 0 0 0-1.55 1.12 1.65 1.65 0 0 0-.07.5V22a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.12-1.55 1.65 1.65 0 0 0-.5-.07H9a2 2 0 0 1-2-2v-.17a1.65 1.65 0 0 0-1.12-1.55 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 1.59 15l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-.5-1.55H1.4a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.55-1.12 1.65 1.65 0 0 0 .07-.5V4a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.12 1.55 1.65 1.65 0 0 0 .5.07H10a1.65 1.65 0 0 0 1.55-1.12 1.65 1.65 0 0 0 .07-.5V4a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.12 1.55 1.65 1.65 0 0 0 .5.07H19a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.55 1.12 1.65 1.65 0 0 0-.07.5c0 .54.26 1.06.71 1.38" />
                </svg>
              </button>
            ) : null}
          </div>
          <button className="posNavBtn" onClick={logout} style={{ marginTop: 'auto' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>

        <div className="posLayout">
          <div className="posMain">
            <div className="posTop">
              <div className="posSearch">
                <svg className="posSearchIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchRef}
                  className="posSearchInput"
                  placeholder="Search menu..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              <button
                className="posAdminBtn"
                onClick={() => {
                  if (!posState.warehouseId) {
                    setError('Select a warehouse to start billing');
                    return;
                  }
                  setStitchingOpen(true);
                }}
              >
                Stitching
              </button>

              {auth?.user.role === 'ADMIN' ? (
                <button
                  className="posAdminBtn"
                  onClick={() => {
                    nav('/backoffice', { replace: false });
                  }}
                >
                  Admin Panel
                </button>
              ) : null}

              <div className="posUserProfile" onClick={() => setShowUserSwitcher(true)}>
                <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(auth?.user.fullName || 'User')}&background=random`} className="posUserAvatar" alt="" />
                <div className="posUserInfo">
                  <div className="posUserName">{auth?.user.fullName || 'Lauren Smith'}</div>
                  <div className="posUserRole">{auth?.user.role === 'ADMIN' ? 'Owner' : 'Cashier'}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            {error ? (
              <div className="gModalBack" onMouseDown={() => setError(null)}>
                <div className="gModal" style={{ maxWidth: 560 }} onMouseDown={(e) => e.stopPropagation()}>
                  <div className="gModalHd">
                    <div style={{ fontWeight: 900 }}>{String(error).toLowerCase().includes('process bill') ? "Server is Down right now" : 'Error'}</div>
                  </div>
                  <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{error}</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button className="gBtn" onClick={() => setError(null)}>
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="posSection">
              <div className="posSectionTitle">Choose Category</div>
              <div className="posCatsWrap">
              <div className="posCats">
                <button
                  className={`posCat ${!activeCategoryId ? 'active' : ''}`}
                  onClick={() => setActiveCategoryId(null)}
                >
                  <div className="posCatIcon">🗂️</div>
                  <div className="posCatName">All Categories</div>
                </button>
                {categories.map((c) => {
                  const offlineImg = mediaUrl(`/media/categories/${c.id}`);
                  const fallback =
                    c.imageUrl ||
                    `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%25" height="100%25" fill="%23f3f4f6"/><text x="50%25" y="54%25" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" font-weight="700" fill="%236b7280">${encodeURIComponent(
                      c.name
                    )}</text></svg>`;
                  return (
                    <button
                      key={c.id}
                      className={`posCat ${activeCategoryId === c.id ? 'active' : ''}`}
                      onClick={() => setActiveCategoryId(c.id)}
                    >
                      <div className="posCatIcon">
                        <img
                          className="posCatImg"
                          src={offlineImg}
                          alt=""
                          onError={(e) => {
                            const el = e.currentTarget as any;
                            if (el.src !== fallback) el.src = fallback;
                          }}
                        />
                      </div>
                      <div className="posCatName">{c.name}</div>
                    </button>
                  );
                })}
              </div>
              </div>
            </div>

            <div className="posSection">
              <div className="posSectionTitle">
                <span>{activeCategoryName} Menu</span>
                <span style={{ fontSize: 12, color: 'var(--pos-muted)', fontWeight: 500 }}>Sort by A-Z</span>
              </div>
              <div className="posGrid">
                {filteredProducts.map((p) => {
                  const offlineImg = mediaUrl(`/media/products/${p.id}`);
                  const fallback = p.imageUrl || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%25" height="100%25" fill="%23f3f4f6"/><text x="50%25" y="52%25" text-anchor="middle" font-family="Segoe UI, Arial" font-size="16" fill="%236b7280">${encodeURIComponent(p.name)}</text></svg>`;
                  const variants = variantsByParentId.get(p.id) || [];
                  const selectedVariantId = variants.length ? selectedSizeByProductId[p.id] : p.id;
                  const selectedVariant = allProducts.find((x) => x.id === selectedVariantId) || p;
                  const s = selectedVariantId ? displayedStock(selectedVariant.id) : null;
                  const stockLabel = s === null ? '' : s <= 0 ? 'Out' : s <= 2 ? 'Low' : 'In';
                  const stockClass = s === null ? 'posStockBadge' : s <= 0 ? 'posStockBadge out' : s <= 2 ? 'posStockBadge low' : 'posStockBadge';
                  return (
                    <div key={p.id} className="posCard">
                      <div className="posCardImg">
                        {s === null ? null : (
                          <span className={stockClass}>
                            {stockLabel} · {s.toFixed(3)}
                          </span>
                        )}
                        <img
                          src={offlineImg}
                          alt=""
                          onError={(e) => {
                            const el = e.currentTarget as any;
                            if (el.src !== fallback) el.src = fallback;
                          }}
                        />
                        {variants.length ? (
                          <div
                            style={{
                              position: 'absolute',
                              left: 8,
                              right: 8,
                              bottom: 8,
                              display: 'flex',
                              gap: 6,
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {variants.map((v) => {
                              const vs = displayedStock(v.id);
                              const disabled = vs !== null && vs <= 0;
                              const active = selectedSizeByProductId[p.id] === v.id;
                              return (
                                <button
                                  key={v.id}
                                  className={`gBtn mini ${active ? '' : 'ghost'}`}
                                  disabled={disabled}
                                  onClick={() => setSelectedSizeByProductId((prev) => ({ ...prev, [p.id]: v.id }))}
                                  style={{ padding: '4px 8px', borderRadius: 999 }}
                                >
                                  {v.sizeLabel || 'NO_SIZE'}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <div className="posCardBd">
                        <div className="posCardName">{p.name}</div>
                        <div className="posCardPrice">
                          ₹{(Number(paiseStringToBigInt(p.sellingPricePaise)) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          <span> /portion</span>
                        </div>
                        <button className="posAdd" onClick={() => addToCart(p)} disabled={(variants.length && !selectedSizeByProductId[p.id]) || (s !== null && s <= 0)}>
                          Add to Billing
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="posBill">
            <div className="posBillHd">
              <div className="posBillTitle">Bills</div>
            </div>

            <div className="posBillBody">
              <div className="posBillItems">
                {preview.lines.map(({ line, total }) => {
                  const offlineImg = mediaUrl(`/media/products/${line.product.id}`);
                  const fallback = line.product.imageUrl || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%25" height="100%25" fill="%23f3f4f6"/><text x="50%25" y="54%25" text-anchor="middle" font-family="Segoe UI, Arial" font-size="12" fill="%236b7280">${encodeURIComponent(line.product.name)}</text></svg>`;
                  const s = displayedStock(line.product.id);
                  return (
                    <div key={line.product.id} className="posBillItem">
                      <img
                        className="posBillThumb"
                        src={offlineImg}
                        alt=""
                        onError={(e) => {
                          const el = e.currentTarget as any;
                          if (el.src !== fallback) el.src = fallback;
                        }}
                      />
                      <div className="posBillInfo">
                        <div className="posBillName">{line.product.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--pos-muted)', fontWeight: 800 }}>Size: {line.product.sizeLabel || 'NO_SIZE'}</div>
                        <div className="posBillMeta">₹{paiseToRupeesString(total)}</div>
                      </div>
                      <div className="posQty">
                        <button className="posQtyBtn" onClick={() => decCart(line.product.id)}>−</button>
                        <div className="posQtyVal">{line.qty}</div>
                        <button className="posQtyBtn plus" onClick={() => incCart(line.product)} disabled={s !== null && s <= 0}>
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                {cart.length === 0 ? <div className="posEmpty">No items yet</div> : null}
              </div>

              <div className="posTotals">
                <div className="posTotRow"><span>Subtotal</span><span>₹{paiseToRupeesString(preview.subtotal)}</span></div>
                <div className="posTotRow"><span>Discount</span><span>-₹{paiseToRupeesString(preview.discountTotal)}</span></div>
                {preview.loyaltyRedeemPoints > 0 ? (
                  <div className="posTotRow"><span>Loyalty Used</span><span>{preview.loyaltyRedeemPoints.toLocaleString('en-IN')} pts</span></div>
                ) : null}
                <div className="posTotRow"><span>Taxable</span><span>₹{paiseToRupeesString(preview.taxable)}</span></div>
                <div className="posTotRow"><span>Tax</span><span>₹{paiseToRupeesString(preview.tax)}</span></div>
                {preview.couponApplied > 0n && couponInfo?.code ? (
                  <div className="posTotRow"><span>Coupon ({couponInfo.code})</span><span>-₹{paiseToRupeesString(preview.couponApplied)}</span></div>
                ) : null}
                <div className="posTotTotal"><span>Total</span><span>₹{paiseToRupeesString(preview.total)}</span></div>
                {payMethod === 'CREDIT' ? (
                  <div className="posTotTotal"><span>Pay Now</span><span>₹0.00</span></div>
                ) : (
                  <div className="posTotTotal"><span>Pay Now</span><span>₹{paiseToRupeesString(preview.payable)}</span></div>
                )}
                {payMethod === 'CREDIT' ? (
                  <div className="posTotTotal"><span>Credit Due</span><span>₹{paiseToRupeesString(preview.payable)}</span></div>
                ) : null}
                {creditSettlementPaise > 0n ? (
                  <div className="posTotRow"><span>Credit Due Collected</span><span>₹{paiseToRupeesString(creditSettlementPaise)}</span></div>
                ) : null}
                {creditSettlementPaise > 0n ? (
                  <div className="posTotTotal">
                    <span>To Collect</span>
                    <span>₹{paiseToRupeesString(payMethod === 'CREDIT' ? creditSettlementPaise : (preview.payable + creditSettlementPaise))}</span>
                  </div>
                ) : null}
              </div>

              <div className="posPanel">
                <div className="posPanelTitle">Customer Information</div>
                <div className="posField">
                  <label>Name</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in Customer"
                  />
                </div>
                <div className="posField">
                  <label>Phone</label>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="9123456789"
                  />
                </div>
                {customerCreditDuePaise > 0n ? (
                  <div className="posField">
                    <label>Customer Credit Due</label>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ fontWeight: 900 }}>₹{paiseToRupeesString(customerCreditDuePaise)} due</div>
                      <button
                        className={`gBtn ${settleCustomerDue ? '' : 'ghost'}`}
                        onClick={() => {
                          setSettleCustomerDue((v) => {
                            const next = !v;
                            if (next) {
                              setCreditSettlementRupees(paiseToRupeesString(customerCreditDuePaise));
                              setDuePayMethod('CASH');
                              setDueUpiRef('');
                            } else {
                              setCreditSettlementRupees('');
                              setDuePayMethod('CASH');
                              setDueUpiRef('');
                            }
                            return next;
                          });
                        }}
                      >
                        {settleCustomerDue ? 'Added' : 'Add To Bill'}
                      </button>
                    </div>
                    {settleCustomerDue ? (
                      <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={creditSettlementRupees}
                          onChange={(e) => setCreditSettlementRupees(e.target.value)}
                          placeholder="Due amount to collect (₹)"
                        />
                        <select value={duePayMethod} onChange={(e) => setDuePayMethod(e.target.value as any)}>
                          <option value="CASH">Cash</option>
                          <option value="UPI">UPI</option>
                        </select>
                        {duePayMethod === 'UPI' ? (
                          <input value={dueUpiRef} onChange={(e) => setDueUpiRef(e.target.value)} placeholder="UPI Ref (UTR)" />
                        ) : null}
                        <button className="gBtn ghost" onClick={() => { setSettleCustomerDue(false); setCreditSettlementRupees(''); }}>
                          Clear
                        </button>
                      </div>
                    ) : null}
                    <div className="gHelp" style={{ marginTop: 6 }}>No GST on credit due collection amount.</div>
                  </div>
                ) : null}
                {posState.orderType === 'B2B' ? (
                  <>
                    <div className="posField">
                      <label>GSTIN</label>
                      <input value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" />
                    </div>
                    <div className="gGrid2" style={{ marginTop: 10 }}>
                      <div className="posField" style={{ marginTop: 0 }}>
                        <label>Customer State Code</label>
                        <input
                          value={customerStateCode}
                          onChange={(e) => {
                            const v = e.target.value;
                        const sc = normalizeStateCode(v);
                        if (sc) {
                          setCustomerStateCode(sc);
                          setPlaceOfSupply(sc);
                        } else {
                          setCustomerStateCode(v);
                        }
                          }}
                          placeholder="29"
                        />
                      </div>
                      <div className="posField" style={{ marginTop: 0 }}>
                        <label>Pincode (optional)</label>
                        <input value={customerPincode} onChange={(e) => setCustomerPincode(e.target.value)} placeholder="560049" />
                      </div>
                    </div>
                    <div className="posField">
                      <label>Address</label>
                      <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Billing address" />
                    </div>
                    <div className="gHelp" style={{ marginTop: 6 }}>
                      B2B bill uses customer state code as Place of Supply and prints GSTIN + address.
                    </div>
                  </>
                ) : null}
                {/^\d{10}$/.test((customerPhone || selectedCustomer?.phone || '').trim()) ? (
                  <div className="posLoyalty">
                    <div className="posLoyaltyTitle">Loyalty Points</div>
                    <div className="posLoyaltyRow">
                      <div className="posLoyaltyPts">
                        {loyaltyLoading ? 'Loading…' : `${(loyalty?.pointsBalance ?? 0).toLocaleString('en-IN')} pts`}
                      </div>
                      <div className="posLoyaltyHint">
                        {loyalty?.lastInvoiceNo ? `Last: ${loyalty.lastInvoiceNo}` : 'No previous purchases'}
                      </div>
                    </div>
                  </div>
                ) : null}
                {(loyalty?.pointsBalance ?? 0) > 0 ? (
                  <div className="posField">
                    <label>Redeem Points (₹1 = 1 pt)</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input
                        type="number"
                        value={String(redeemPoints)}
                        min={0}
                        max={preview.loyaltyMaxRedeemPoints}
                        onChange={(e) => setRedeemPoints(Number(e.target.value || 0))}
                      />
                      <button className="gBtn ghost" onClick={() => setRedeemPoints(preview.loyaltyMaxRedeemPoints)} disabled={preview.loyaltyMaxRedeemPoints <= 0}>
                        Max
                      </button>
                      <button className="gBtn ghost" onClick={() => setRedeemPoints(0)} disabled={redeemPoints <= 0}>
                        Clear
                      </button>
                    </div>
                    <div style={{ color: 'var(--pos-muted)', fontSize: 12, marginTop: 6 }}>
                      Max usable now: {preview.loyaltyMaxRedeemPoints.toLocaleString('en-IN')} pts
                    </div>
                  </div>
                ) : null}
                {mode === 'DELIVERY' && (
                  <div className="posField">
                    <label>{posState.orderType === 'B2B' ? 'Delivery Address' : 'Address'}</label>
                    <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery address" />
                    {posState.orderType === 'B2B' ? (
                      <div className="gHelp" style={{ marginTop: 6 }}>
                        Billing address stays in customer details. Delivery address is for shipping.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="posPay">
                <div className="posPayTitle">Payment Method</div>
                <div className="posPayRow">
                  <button className={`posPayBtn ${payMethod === 'CASH' ? 'active' : ''}`} onClick={() => setPayMethod('CASH')}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="6" width="20" height="12" rx="2" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                    <div className="posPayLabel">Cash</div>
                  </button>
                  <button className={`posPayBtn ${payMethod === 'UPI' ? 'active' : ''}`} onClick={() => setPayMethod('UPI')}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" />
                      <polyline points="1 10 23 10" />
                    </svg>
                    <div className="posPayLabel">UPI</div>
                  </button>
                  <button
                    className={`posPayBtn ${payMethod === 'CREDIT' ? 'active' : ''}`}
                    onClick={() => {
                      if (!/^\d{10}$/.test(customerPhone.trim())) {
                        setError('Enter customer phone first');
                        return;
                      }
                      clearCoupon();
                      setSettleCustomerDue(false);
                      setCreditSettlementRupees('');
                      setPayMethod('CREDIT');
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <div className="posPayLabel">Credit</div>
                  </button>
                </div>
              </div>

              <div className="posPanel" style={{ marginTop: 16 }}>
                <div className="posPanelTitle">Redeem Coupon</div>
                {couponError ? <div className="posToast">{couponError}</div> : null}
                <div className="posField">
                  <label>Coupon Code</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      placeholder="RET-XXXX / CPN-XXXX"
                      disabled={couponBusy || busy}
                    />
                    <button className="gBtn ghost" onClick={validateCoupon} disabled={couponBusy || busy || !couponCode.trim()}>
                      {couponBusy ? 'Checking…' : 'Apply'}
                    </button>
                    <button className="gBtn ghost" onClick={clearCoupon} disabled={couponBusy || busy || (!couponInfo && !couponCode)}>
                      Clear
                    </button>
                  </div>
                  {couponInfo ? (
                    <div style={{ color: 'var(--pos-muted)', fontSize: 12, marginTop: 6 }}>
                      Value ₹{paiseToRupeesString(paiseStringToBigInt(couponInfo.amountPaise))} · Uses left {couponInfo.usesRemaining}
                      {couponInfo.validTo ? ` · Valid till ${new Date(couponInfo.validTo).toLocaleDateString()}` : ''}
                    </div>
                  ) : null}
                </div>
              </div>

              {payMethod === 'UPI' && (
                <div className="posField">
                  <label>UPI Reference (UTR)</label>
                  <input value={upiRef} onChange={(e) => setUpiRef(e.target.value)} placeholder="UTR Number" />
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button 
                  className="gBtn ghost" 
                  style={{ flex: 1, height: 54, borderRadius: 16, border: '1px solid var(--pos-line)' }}
                  onClick={holdBill}
                  disabled={cart.length === 0}
                >
                  Hold Bill
                </button>
                <button 
                  className="posCheckout" 
                  style={{ flex: 2, marginTop: 0 }}
                  onClick={checkout} 
                  disabled={busy || !canCheckout()}
                >
                  {busy ? 'Processing...' : 'Add to Billing'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSuccessModal && (invoiceResult || dueSettlementResult) && (
        <div className="gModalBack">
          <div className="gModal" style={{ maxWidth: 440, textAlign: 'center' }}>
            <div className="gModalHd" style={{ justifyContent: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: 20 }}>{invoiceResult ? 'Bill Created!' : 'Due Settled!'}</div>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontSize: 48 }}>✅</div>
              <div>
                {invoiceResult ? (
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Invoice: {invoiceResult.invoiceNo}</div>
                ) : (
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Ref: {dueSettlementResult?.referenceNo || ''}</div>
                )}
                <div style={{ color: 'var(--pos-muted)', marginTop: 4 }}>What would you like to do next?</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {invoiceResult && stitchingOrderId ? (
                  <>
                    <button
                      className="gBtn"
                      style={{ height: 50 }}
                      onClick={whatsappBill}
                      disabled={busy || !normalizeIndiaPhone(customerPhone || selectedCustomer?.phone || '')}
                    >
                      WhatsApp Customer Bill
                    </button>
                    <button
                      className="gBtn"
                      style={{ height: 50 }}
                      onClick={whatsappTailorSlip}
                      disabled={busy || !normalizeIndiaPhone(stitchingTailorPhone || '')}
                    >
                      WhatsApp Tailor Slip
                    </button>
                  </>
                ) : invoiceResult ? (
                    <>
                      <button
                        className="gBtn"
                        style={{ height: 50 }}
                        onClick={whatsappBill}
                        disabled={busy || !normalizeIndiaPhone(customerPhone || selectedCustomer?.phone || '')}
                      >
                        WhatsApp Customer Bill
                      </button>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="gBtn ghost" style={{ flex: 1, height: 50 }} onClick={() => print('THERMAL_80MM')} disabled={busy}>
                          Thermal Print
                        </button>
                        <button className="gBtn ghost" style={{ flex: 1, height: 50 }} onClick={() => print('A4')} disabled={busy}>
                          A4 Print
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="gBtn ghost" style={{ flex: 1, height: 50 }} onClick={() => printDueSettlement('THERMAL_80MM')} disabled={busy}>
                        Thermal Print
                      </button>
                      <button className="gBtn ghost" style={{ flex: 1, height: 50 }} onClick={() => printDueSettlement('A4')} disabled={busy}>
                        A4 Print
                      </button>
                    </div>
                  )}
                <button className="gBtn danger ghost" onClick={clearBill} style={{ marginTop: 10 }}>
                  Start New Bill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <StitchingPosModal
        open={stitchingOpen}
        onClose={() => setStitchingOpen(false)}
        billCustomer={selectedCustomer ? { id: selectedCustomer.id, fullName: selectedCustomer.fullName, phone: selectedCustomer.phone } : null}
        billCustomerPhone={customerPhone}
        onCreated={(x) => void addStitchingLine(x)}
      />

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

      {invoicesOpen ? (
        <div className="gModalBack" onMouseDown={() => setInvoicesOpen(false)}>
          <div className="gModal posModal posProductsModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Bills History</div>
              <div className="gRow">
                <button className="gBtn ghost" onClick={refreshInvoiceList} disabled={invoiceLoading || busy}>
                  Refresh
                </button>
                <button className="gBtn ghost" onClick={() => setInvoicesOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="gModalBd posModalBd">
              <div className="gField" style={{ marginTop: 0 }}>
                <label>Search</label>
                <input value={invoiceQ} onChange={(e) => setInvoiceQ(e.target.value)} placeholder="Invoice no..." />
              </div>

              <div className="posModalSection">
                <div className="posModalList">
                  {(invoiceList || [])
                    .filter((x) => {
                      const qv = invoiceQ.trim().toLowerCase();
                      if (!qv) return true;
                      return `${x.invoiceNo}`.toLowerCase().includes(qv);
                    })
                    .map((inv) => {
                      const total = paiseToRupeesString(paiseStringToBigInt(inv.grandTotalPaise));
                      return (
                        <div key={inv.id} className="gHold posRow">
                          <div className="posRowLeft">
                            <div className="posRowMeta">
                              <div className="posRowTitle">{inv.invoiceNo}</div>
                              <div className="posRowSub">{new Date(inv.invoiceDate).toLocaleString()}</div>
                            </div>
                          </div>
                          <div className="gRow">
                            <div style={{ fontWeight: 900 }}>₹{total}</div>
                            <button className="gBtn ghost" onClick={() => printInvoice(inv.id, 'THERMAL_80MM')} disabled={busy}>
                              Thermal
                            </button>
                            <button className="gBtn ghost" onClick={() => printInvoice(inv.id, 'A4')} disabled={busy}>
                              A4
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {!invoiceLoading && (invoiceList || []).length === 0 ? (
                    <div className="gHelp">No invoices found</div>
                  ) : null}
                  {invoiceLoading ? <div className="gHelp">Loading…</div> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {returnsOpen ? (
        <div className="gModalBack" onMouseDown={() => setReturnsOpen(false)}>
          <div className="gModal posModal posProductsModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Return</div>
              <div className="gRow">
                <button className="gBtn ghost" onClick={() => setReturnsOpen(false)} disabled={returnLookupBusy || returnSubmitBusy}>
                  Close
                </button>
              </div>
            </div>
            <div className="gModalBd posModalBd">
              {returnLookupError ? <div className="posToast">{returnLookupError}</div> : null}
              {returnLookupError && returnLookupError.includes('Accounting system accounts are missing') && auth?.user.role === 'ADMIN' ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="gBtn ghost" onClick={setupAccountingSystemAccounts} disabled={busy}>
                    Setup Accounting
                  </button>
                </div>
              ) : null}
              {returnResult ? (
                <div className="gCard" style={{ marginTop: 0 }}>
                  <div className="gCardHd">
                    <div className="gCardTitle">Return Accepted</div>
                  </div>
                  <div className="gCardBd">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div><b>Invoice:</b> {returnResult.invoiceNo}</div>
                      <div><b>Amount:</b> ₹{paiseToRupeesString(paiseStringToBigInt(returnResult.amountPaise))}</div>
                      <div><b>Mode:</b> {returnResult.mode}</div>
                      {returnResult.mode === 'LOYALTY' ? <div><b>Points credited:</b> {returnResult.pointsCredited} pts</div> : null}
                      {returnResult.mode === 'COUPON' ? <div><b>Coupon:</b> {returnResult.couponCode}</div> : null}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                      <button className="gBtn ghost" onClick={whatsappReturnReceipt} disabled={busy}>
                        WhatsApp
                      </button>
                      <button className="gBtn ghost" onClick={() => printReturnReceipt(returnResult.id, 'THERMAL_80MM')} disabled={busy}>
                        Thermal Print
                      </button>
                      <button className="gBtn ghost" onClick={() => printReturnReceipt(returnResult.id, 'A4')} disabled={busy}>
                        A4 Print
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="gField" style={{ marginTop: 0 }}>
                <label>Invoice Number</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input value={returnInvoiceNo} onChange={(e) => setReturnInvoiceNo(e.target.value)} placeholder="Enter invoice no..." />
                  <button className="gBtn ghost" onClick={lookupReturnInvoice} disabled={returnLookupBusy || !returnInvoiceNo.trim()}>
                    {returnLookupBusy ? 'Looking…' : 'Lookup'}
                  </button>
                </div>
              </div>

              {returnLookup ? (
                <div className="posModalSection">
                  <div className="gHelp" style={{ marginTop: 6 }}>
                    Invoice {returnLookup.invoice.invoiceNo} · {new Date(returnLookup.invoice.invoiceDate).toLocaleString()}
                  </div>

                  <div className="posModalList" style={{ marginTop: 10 }}>
                    {(returnLookup.lines || []).map((l) => {
                      const max = Number(l.returnableQty);
                      const disabled = !Number.isFinite(max) || max <= 0;
                      return (
                        <div key={l.id} className="gHold posRow">
                          <div className="posRowLeft">
                            <div className="posRowMeta">
                              <div className="posRowTitle">{l.productName}</div>
                              <div className="posRowSub">
                                Sold {Number(l.qty).toFixed(3)} · Returnable {Number(l.returnableQty).toFixed(3)}
                              </div>
                            </div>
                          </div>
                          <div className="gRow">
                            <div className="gField" style={{ width: 160 }}>
                              <label>Return Qty</label>
                              <input
                                type="number"
                                min={0}
                                step={0.001}
                                value={returnQtyByLineId[l.id] ?? ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setReturnQtyByLineId((prev) => ({ ...prev, [l.id]: raw }));
                                }}
                                disabled={disabled || returnSubmitBusy}
                                placeholder={disabled ? '0' : `${max.toFixed(3)}`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button className="gBtn" onClick={submitReturn} disabled={returnSubmitBusy}>
                      {returnSubmitBusy ? 'Processing…' : 'Accept Return'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {discountsOpen ? (
        <div className="gModalBack" onMouseDown={() => setDiscountsOpen(false)}>
          <div className="gModal posModal posCategoriesModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Discounts</div>
              <div className="gRow">
                <button
                  className="gBtn ghost"
                  onClick={() =>
                    setCart((prev) => prev.map((l) => ({ ...l, discountRupees: 0 })))
                  }
                  disabled={busy || cart.length === 0}
                >
                  Reset
                </button>
                <button className="gBtn ghost" onClick={() => setDiscountsOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="gModalBd posModalBd">
              <div className="gHelp">Discount reduces taxable value and GST is recalculated automatically.</div>

              <div className="posModalSection">
                <div className="posModalList">
                  {cart.map((l) => {
                    const max = l.unitPriceRupees * l.qty;
                    return (
                      <div key={l.product.id} className="gHold posRow">
                        <div className="posRowLeft">
                          <div className="posRowMeta">
                            <div className="posRowTitle">{l.product.name}</div>
                            <div className="posRowSub">
                              Qty {l.qty} · Unit ₹{l.unitPriceRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                        <div className="gRow">
                          <div className="gField" style={{ width: 140 }}>
                            <label>₹ Discount</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={String(l.discountRupees)}
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                const next = Number.isFinite(raw) ? Math.max(0, Math.min(raw, max)) : 0;
                                setCart((prev) => prev.map((x) => (x.product.id === l.product.id ? { ...x, discountRupees: next } : x)));
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {cart.length === 0 ? <div className="gHelp">Add items to apply discounts</div> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {returnPhoneModalOpen ? (
        <div className="gModalBack" onMouseDown={() => setReturnPhoneModalOpen(false)}>
          <div className="gModal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Share Return Receipt</div>
              <button className="gBtn ghost" onClick={() => setReturnPhoneModalOpen(false)}>
                Close
              </button>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gField">
                <label>Customer Phone (10-digit)</label>
                <input value={returnPhoneInput} onChange={(e) => setReturnPhoneInput(e.target.value)} placeholder="Enter phone" autoFocus />
              </div>
              <button
                className="gBtn"
                onClick={async () => {
                  const phone = normalizeIndiaPhone(returnPhoneInput || '');
                  if (!phone) {
                    setError('Enter a valid customer phone to share on WhatsApp');
                    return;
                  }
                  setReturnSharePhone(returnPhoneInput);
                  setReturnPhoneModalOpen(false);
                  await doWhatsappReturnReceipt(phone);
                }}
              >
                Share on WhatsApp
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsMenuOpen ? (
        <div className="gModalBack" onMouseDown={() => setSettingsMenuOpen(false)}>
          <div className="gModal posModal posSettingsModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd posSettingsHd">
              <div className="posSettingsTitle">
                <div style={{ fontWeight: 900 }}>Settings</div>
                <div className="posSettingsSub">
                  {auth?.user.role === 'ADMIN' ? 'Owner' : 'Cashier'} · {auth?.user.fullName || 'User'}
                </div>
              </div>
              <button className="gBtn ghost" onClick={() => setSettingsMenuOpen(false)}>
                Close
              </button>
            </div>

            <div className="gModalBd posSettingsBd">
              <button
                className="posSettingRow"
                onClick={() => {
                  setSettingsMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                <div className="posSettingIcon">🧾</div>
                <div className="posSettingText">
                  <div className="posSettingName">Order Settings</div>
                  <div className="posSettingDesc">Warehouse · Place of Supply · Walk-in/Delivery</div>
                </div>
                <div className="posSettingAction">Open</div>
              </button>

              {auth?.user.role === 'ADMIN' ? (
                <>
                  <button
                    className="posSettingRow"
                    onClick={() => {
                      setSettingsMenuOpen(false);
                      setStoreSettingsOpen(true);
                    }}
                  >
                    <div className="posSettingIcon">🏪</div>
                    <div className="posSettingText">
                      <div className="posSettingName">Store Settings</div>
                      <div className="posSettingDesc">Store name · Phone · Address · GST · Footer note</div>
                    </div>
                    <div className="posSettingAction">Edit</div>
                  </button>

                  <button
                    className="posSettingRow"
                    onClick={() => {
                      setSettingsMenuOpen(false);
                      setCategoriesOpen(true);
                      setCatEditingId(null);
                      setCatName('');
                      setCatImageUrl('');
                      setCatFile(null);
                    }}
                  >
                    <div className="posSettingIcon">🗂️</div>
                    <div className="posSettingText">
                      <div className="posSettingName">Manage Categories</div>
                      <div className="posSettingDesc">Add · Edit · Delete categories shown in POS</div>
                    </div>
                    <div className="posSettingAction">Open</div>
                  </button>

                  <button
                    className="posSettingRow"
                    onClick={() => {
                      setSettingsMenuOpen(false);
                      setProductsOpen(true);
                      setProdQ('');
                      setProdEditingId(null);
                      setProdImageUrl('');
                      setProdFile(null);
                    }}
                  >
                    <div className="posSettingIcon">📦</div>
                    <div className="posSettingText">
                      <div className="posSettingName">Manage Products</div>
                      <div className="posSettingDesc">Prices · GST · Images · Category mapping</div>
                    </div>
                    <div className="posSettingAction">Open</div>
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="gModalBack" onMouseDown={() => setSettingsOpen(false)}>
          <div className="gModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Order Settings</div>
              <button className="gBtn ghost" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
            </div>
            <div className="gModalBd">
              <div className="gGrid2" style={{ marginTop: 0 }}>
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
                        {w.name}{w.isActive === false ? ' (Inactive)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="gField">
                  <label>Place of Supply</label>
                  <input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="29" />
                </div>
              </div>

              <div className="gRow" style={{ marginTop: 12 }}>
                <button
                  className={`gBtn ${posState.orderType === 'B2B' ? 'ghost' : ''}`}
                  onClick={() => setPosState((p) => ({ ...p, orderType: 'B2C' }))}
                >
                  B2C
                </button>
                <button
                  className={`gBtn ${posState.orderType === 'B2B' ? '' : 'ghost'}`}
                  onClick={() => {
                    setPosState((p) => ({ ...p, orderType: 'B2B' }));
                    if (/^\d{2}$/.test(customerStateCode.trim())) setPlaceOfSupply(customerStateCode.trim());
                    setMode('WALK_IN');
                  }}
                >
                  B2B
                </button>
              </div>

              {posState.orderType !== 'B2B' ? (
                <div className="gRow" style={{ marginTop: 12 }}>
                  <button className={`gBtn ${mode === 'WALK_IN' ? '' : 'ghost'}`} onClick={() => setMode('WALK_IN')}>
                    Walk-in
                  </button>
                  <button className={`gBtn ${mode === 'DELIVERY' ? '' : 'ghost'}`} onClick={() => setMode('DELIVERY')}>
                    Delivery
                  </button>
                </div>
              ) : (
                <div className="gHelp" style={{ marginTop: 12 }}>
                  B2B invoices always include GSTIN + billing address.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {storeSettingsOpen ? (
        <div className="gModalBack" onMouseDown={() => setStoreSettingsOpen(false)}>
          <div className="gModal posModal posSettingsModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd posSettingsHd">
              <div className="posSettingsTitle">
                <div style={{ fontWeight: 900 }}>Store Settings</div>
                <div className="posSettingsSub">These details auto-print on Thermal + A4 invoices</div>
              </div>
              <button className="gBtn ghost" onClick={() => setStoreSettingsOpen(false)}>
                Close
              </button>
            </div>

            <div className="gModalBd posModalBd">
              <div className="gGrid2" style={{ marginTop: 0 }}>
                <div className="gField">
                  <label>Store Name</label>
                  <input value={storeForm.name} onChange={(e) => setStoreForm((p) => ({ ...p, name: e.target.value }))} placeholder="Shr-x Collections" />
                </div>
                <div className="gField">
                  <label>Phone Number</label>
                  <input value={storeForm.phone} onChange={(e) => setStoreForm((p) => ({ ...p, phone: e.target.value }))} placeholder="9686918536" />
                </div>
              </div>

              <div className="gField" style={{ marginTop: 12 }}>
                <label>Shop Address</label>
                <input
                  value={storeForm.address}
                  onChange={(e) => setStoreForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Shop no. B15, 1st Floor, Isiri Hub, Bengaluru – 560049"
                />
              </div>

              <div className="gGrid2" style={{ marginTop: 12 }}>
                <div className="gField">
                  <label>GST Number (optional)</label>
                  <input value={storeForm.gstin} onChange={(e) => setStoreForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))} placeholder="29ABCDE1234F1Z5" />
                </div>
                <div className="gField">
                  <label>Footer Note (optional)</label>
                  <input value={storeForm.footerNote} onChange={(e) => setStoreForm((p) => ({ ...p, footerNote: e.target.value }))} placeholder="Thank you for shopping with us" />
                </div>
              </div>

              <div className="gRow" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
                <button className="gBtn ghost" onClick={() => setStoreSettingsOpen(false)} disabled={storeSaving}>
                  Cancel
                </button>
                <button className="gBtn" onClick={saveStoreSettings} disabled={storeSaving || !storeForm.name.trim() || !storeForm.address.trim()}>
                  {storeSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {categoriesOpen ? (
        <div className="gModalBack" onMouseDown={() => setCategoriesOpen(false)}>
          <div className="gModal posModal posCategoriesModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Categories</div>
              <div className="gRow">
                <button
                  className="gBtn ghost"
                  onClick={() => {
                    setCatEditingId(null);
                    setCatName('New Collection');
                    setCatImageUrl('');
                    setCatFile(null);
                  }}
                >
                  Quick Fill
                </button>
                <button className="gBtn ghost" onClick={() => setCategoriesOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="gModalBd posModalBd">
              <div className="gGrid2" style={{ marginTop: 0 }}>
                <div className="gField">
                  <label>Name</label>
                  <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Sarees" />
                </div>
                <div className="gField">
                  <label>Image URL</label>
                  <input value={catImageUrl} onChange={(e) => setCatImageUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="gField" style={{ gridColumn: '1 / -1' }}>
                  <label>Upload Image (Offline)</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="posFileInput"
                    onChange={(e) => setCatFile(e.target.files?.[0] || null)}
                  />
                  <div className="gHelp">Stored in database · Preferred for offline</div>
                </div>
              </div>

              <div className="gRow" style={{ justifyContent: 'flex-end' }}>
                {catEditingId ? (
                  <>
                    <button
                      className="gBtn ghost"
                      onClick={() => {
                        setCatEditingId(null);
                        setCatName('');
                        setCatImageUrl('');
                        setCatFile(null);
                      }}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button className="gBtn" onClick={saveCategory} disabled={busy || !catName.trim()}>
                      Save
                    </button>
                  </>
                ) : (
                  <button className="gBtn" onClick={createCategory} disabled={busy || !catName.trim()}>
                    Create
                  </button>
                )}
              </div>

              <div className="posModalSection">
                <div className="posModalList">
                  {categories.map((c) => (
                    <div
                      key={c.id}
                      className="gHold posRow"
                    >
                      <div className="posRowLeft">
                        <div className="posRowThumb">
                          <img
                            src={mediaUrl(`/media/categories/${c.id}`)}
                            alt=""
                            className="posRowThumbImg"
                            onError={(e) => {
                              const el = e.currentTarget as any;
                              if (c.imageUrl && el.src !== c.imageUrl) {
                                el.src = c.imageUrl;
                              } else {
                                el.style.display = 'none';
                              }
                            }}
                          />
                        </div>
                        <div className="posRowMeta">
                          <div className="posRowTitle">{c.name}</div>
                          <div className="posRowSub">{c.imageUrl || 'Offline image / no URL'}</div>
                        </div>
                      </div>
                      <div className="gRow">
                        <button className="gBtn ghost" onClick={() => startEditCategory(c)} disabled={busy}>
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {productsOpen ? (
        <div className="gModalBack" onMouseDown={() => setProductsOpen(false)}>
          <div className="gModal posModal posProductsModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Products</div>
              <button className="gBtn ghost" onClick={() => setProductsOpen(false)}>
                Close
              </button>
            </div>
            <div className="gModalBd posModalBd">
              <div className="gField" style={{ marginTop: 0 }}>
                <label>Search</label>
                <input value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="Search products..." />
              </div>

              {prodEditingId ? (
                <div className="posProdEdit">
                  <div className="posProdEditHd">
                    <div className="posProdEditLeft">
                      <div className="posProdEditThumb">
                        <img
                          src={editingProduct ? mediaUrl(`/media/products/${editingProduct.id}`) : ''}
                          alt=""
                          className="posProdEditThumbImg"
                          onError={(e) => {
                            const el = e.currentTarget as any;
                            if (editingProduct?.imageUrl && el.src !== editingProduct.imageUrl) {
                              el.src = editingProduct.imageUrl;
                            } else {
                              el.style.display = 'none';
                            }
                          }}
                        />
                      </div>
                      <div className="posProdEditMeta">
                        <div className="posProdEditTitle">{editingProduct?.name || 'Update Product'}</div>
                        <div className="posProdEditSub">{editingProduct?.code || ''}</div>
                      </div>
                    </div>
                    <div className="gRow">
                      <button
                        className="gBtn ghost"
                        onClick={() => {
                          setProdEditingId(null);
                          setProdImageUrl('');
                          setProdFile(null);
                        }}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                      <button className="gBtn" onClick={saveProductMedia} disabled={busy}>
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="posProdMediaGrid">
                    <div className="gField">
                      <label>Image URL (Online)</label>
                      <input value={prodImageUrl} onChange={(e) => setProdImageUrl(e.target.value)} placeholder="https://..." />
                    </div>
                    <div className="gField">
                      <label>Upload Image (Offline)</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="posFileInput"
                        onChange={(e) => setProdFile(e.target.files?.[0] || null)}
                      />
                      <div className="gHelp">Stored in database · Preferred for offline</div>
                    </div>
                  </div>

                  <div className="posProdEditFt">
                    <button className="gBtn ghost" onClick={() => setProdEditingId(null)} disabled={busy}>
                      Cancel
                    </button>
                    <button className="gBtn" onClick={saveProductMedia} disabled={busy}>
                      Save
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="posModalSection">
                <div className="posModalList">
                  {products
                    .filter((p) => {
                      const qv = prodQ.trim().toLowerCase();
                      if (!qv) return true;
                      return `${p.name} ${p.code}`.toLowerCase().includes(qv);
                    })
                    .slice(0, 200)
                    .map((p) => (
                      <div key={p.id} className="gHold posRow">
                        <div className="posRowLeft">
                          <div className="posRowThumb">
                            <img
                              src={mediaUrl(`/media/products/${p.id}`)}
                              alt=""
                              className="posRowThumbImg"
                              onError={(e) => {
                                const el = e.currentTarget as any;
                                if (p.imageUrl && el.src !== p.imageUrl) {
                                  el.src = p.imageUrl;
                                } else {
                                  el.style.display = 'none';
                                }
                              }}
                            />
                          </div>
                          <div className="posRowMeta">
                            <div className="posRowTitle">{p.name}</div>
                            <div className="posRowSub">{p.code}</div>
                          </div>
                        </div>
                        <button className="gBtn ghost" onClick={() => startEditProduct(p)} disabled={busy}>
                          Edit
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showUserSwitcher && (
        <div className="gModalBack" onMouseDown={() => setShowUserSwitcher(false)}>
          <div className="gModal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900, fontSize: 18 }}>Manage Accounts</div>
              <button className="gBtn ghost" onClick={() => setShowUserSwitcher(false)}>Close</button>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sessions.map((s) => (
                  <div
                    key={s.user.id}
                    className={`gHold ${auth?.user.id === s.user.id ? 'active' : ''}`}
                    style={{
                      cursor: 'default',
                      border: auth?.user.id === s.user.id ? '2px solid var(--pos-accent)' : '1px solid var(--pos-line)',
                      padding: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img
                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(s.user.fullName)}&background=random`}
                        style={{ width: 40, height: 40, borderRadius: 10 }}
                        alt=""
                      />
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{s.user.fullName}</div>
                        <div style={{ fontSize: 12, color: 'var(--pos-muted)' }}>
                          {s.user.role === 'ADMIN' ? 'Owner' : 'Cashier'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {auth?.user.id !== s.user.id ? (
                        <button
                          className="gBtn"
                          onClick={() => {
                            switchSession(s.user.id);
                            window.location.reload(); // Quickest way to re-init all hooks
                          }}
                        >
                          Switch
                        </button>
                      ) : (
                        <div style={{ color: 'var(--pos-accent)', fontWeight: 800, fontSize: 12, marginRight: 8 }}>Active</div>
                      )}
                      <button
                        className="gBtn ghost danger"
                        style={{ padding: '8px' }}
                        onClick={() => {
                          removeSession(s.user.id);
                          const next = getAllSessions();
                          setSessions(next);
                          if (next.length === 0) {
                            nav('/login', { replace: true });
                          } else if (auth?.user.id === s.user.id) {
                            window.location.reload();
                          }
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="gBtn"
                style={{ width: '100%', height: 50, borderStyle: 'dashed', background: 'transparent', color: 'var(--pos-accent)' }}
                onClick={() => nav('/login')}
              >
                + Add New Account
              </button>

              <div style={{ borderTop: '1px solid var(--pos-line)', marginTop: 8, paddingTop: 16 }}>
                <button
                  className="gBtn danger"
                  style={{ width: '100%' }}
                  onClick={() => {
                    clearAuth();
                    nav('/login', { replace: true });
                  }}
                >
                  Logout All Accounts
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {adminUnlockOpen && (
        <div className="gModalBack" onClick={() => !adminUnlockBusy && setAdminUnlockOpen(false)}>
          <div className="gModal posSettingsModal" onClick={(e) => e.stopPropagation()}>
            <div className="gModalHd posSettingsHd">
              <div className="posSettingsTitle">
                <div style={{ fontWeight: 900, fontSize: 16 }}>Admin Panel</div>
                <div className="posSettingsSub">Enter admin password to continue</div>
              </div>
              <button className="gBtn ghost" onClick={() => !adminUnlockBusy && setAdminUnlockOpen(false)}>Close</button>
            </div>
            <div className="gModalBd posSettingsBd">
              {adminUnlockError ? <div className="gToast">{adminUnlockError}</div> : null}
              <div className="gField">
                <label>Password</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') unlockAdminPanel();
                  }}
                  autoFocus
                />
              </div>
              <button className="gBtn" onClick={unlockAdminPanel} disabled={adminUnlockBusy || !adminPassword.trim()}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
