import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiBaseUrl } from '../lib/api';
import { StBadge, StButton, StCard, StEmpty, StInput, StLabel, StModal, StSelect } from '../components/stitching/AdminUi';
import { BackofficeStitchingProductsPage } from './BackofficeStitchingProductsPage';

type OrgRow = { id: string; name: string };
type StoreRow = {
  id: string;
  code: string;
  name: string;
  address: string;
  phone?: string | null;
  stateCode: string;
  gstin?: string | null;
  footerNote?: string | null;
};
type WarehouseRow = { id: string; name: string; isActive?: boolean };
type UserRow = { id: string; fullName: string; phone?: string | null; email?: string | null; role: string; storeId?: string | null };
type CategoryRow = { id: string; name: string; posVisible: boolean; imageUrl?: string | null };
type ProductRow = {
  id: string;
  code: string;
  name: string;
  hsnCode?: string | null;
  gstRateBp: number;
  sellingPricePaise: string;
  posVisible: boolean;
  isPortalManaged?: boolean | null;
  category?: { name: string } | null;
};

function parseJsonSafe(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function coerceErrorMessage(body: unknown, status: number) {
  if (body && typeof body === 'object' && 'message' in body) {
    const m: any = (body as any).message;
    if (typeof m === 'string' && m.trim()) return m;
    if (Array.isArray(m)) return m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ');
    if (m !== undefined && m !== null) return typeof m === 'string' ? m : JSON.stringify(m);
  }
  if (typeof body === 'string' && body.trim()) return body;
  return `HTTP ${status}`;
}

async function portalFetch<T>(args: { portalKey: string; path: string; init?: RequestInit }): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-sutra-portal-key': args.portalKey.trim(),
    ...(args.init?.headers ? (args.init.headers as any) : {})
  };

  if (args.init?.body && !headers['Content-Type']) {
    const body: any = args.init.body as any;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isFormData) headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${apiBaseUrl()}${args.path}`, { ...args.init, headers });
  const raw = await res.text();
  const body = parseJsonSafe(raw);
  if (res.ok) return body as T;
  throw { status: res.status, message: coerceErrorMessage(body, res.status), details: body };
}

function rupeesFromPaiseString(paise: string) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '0.00';
  return (n / 100).toFixed(2);
}

const PORTAL_KEY_STORAGE = 'sutra_portal_key_v1';

function renderOptions(options: Array<{ value: string; label: string }>) {
  return options.map((o) => (
    <option key={o.value || o.label} value={o.value}>
      {o.label}
    </option>
  ));
}

export function PortalPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const seededTab = sp.get('tab') || 'users';

  const [portalKey, setPortalKey] = useState(localStorage.getItem(PORTAL_KEY_STORAGE) || '');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [orgId, setOrgId] = useState<string>('');

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState<string>('');
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);

  const [storeManagerOpen, setStoreManagerOpen] = useState(false);
  const [warehouseManagerOpen, setWarehouseManagerOpen] = useState(false);
  const [creatingStore, setCreatingStore] = useState<{ code: string; name: string; address: string; stateCode: string }>({
    code: '',
    name: '',
    address: '',
    stateCode: ''
  });
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editingStore, setEditingStore] = useState<{ name: string; phone: string; address: string; gstin: string; footerNote: string }>({
    name: '',
    phone: '',
    address: '',
    gstin: '',
    footerNote: ''
  });
  const [creatingWarehouse, setCreatingWarehouse] = useState<{ name: string }>({ name: '' });

  const [tab, setTab] = useState<'users' | 'products' | 'categories' | 'stock' | 'stitching'>(
    seededTab === 'products' || seededTab === 'categories' || seededTab === 'stock' || seededTab === 'stitching' ? seededTab : 'users'
  );

  useEffect(() => {
    const next = new URLSearchParams(sp);
    next.set('tab', tab);
    setSp(next, { replace: true });
  }, [tab]);

  async function verifyAndLoadOrgs(nextKey?: string) {
    const key = (nextKey ?? portalKey).trim();
    if (!key) {
      setVerified(false);
      setOrgs([]);
      setOrgId('');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await portalFetch<{ ok: true }>({ portalKey: key, path: '/portal/health' });
      const res = await portalFetch<{ orgs: OrgRow[] }>({ portalKey: key, path: '/portal/orgs' });
      setVerified(true);
      setOrgs(res.orgs || []);
      if (!orgId && res.orgs?.[0]?.id) setOrgId(res.orgs[0].id);
      localStorage.setItem(PORTAL_KEY_STORAGE, key);
    } catch (e: any) {
      setVerified(false);
      setOrgs([]);
      setOrgId('');
      setError(e?.message || 'Portal access failed');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void verifyAndLoadOrgs();
  }, []);

  useEffect(() => {
    if (!verified || !orgId) return;
    let active = true;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await portalFetch<{ stores: StoreRow[] }>({
          portalKey,
          path: `/portal/stores?orgId=${encodeURIComponent(orgId)}`
        });
        if (!active) return;
        setStores(res.stores || []);
        const firstStore = res.stores?.[0]?.id || '';
        setStoreId((prev) => prev || firstStore);
        if ((res.stores || []).length === 0) setStoreManagerOpen(true);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load stores');
      } finally {
        if (!active) return;
        setBusy(false);
      }
    })();
    return () => { active = false; };
  }, [verified, orgId]);

  useEffect(() => {
    if (!verified || !orgId || !storeId) return;
    let active = true;
    (async () => {
      try {
        const res = await portalFetch<{ warehouses: WarehouseRow[] }>({
          portalKey,
          path: `/portal/warehouses?orgId=${encodeURIComponent(orgId)}&storeId=${encodeURIComponent(storeId)}`
        });
        if (!active) return;
        setWarehouses(res.warehouses || []);
      } catch {
        if (!active) return;
        setWarehouses([]);
      }
    })();
    return () => { active = false; };
  }, [verified, orgId, storeId]);

  async function loadStores(nextOrgId?: string) {
    const oid = (nextOrgId ?? orgId).trim();
    if (!verified || !oid) return;
    const res = await portalFetch<{ stores: StoreRow[] }>({
      portalKey,
      path: `/portal/stores?orgId=${encodeURIComponent(oid)}`
    });
    setStores(res.stores || []);
    const firstStore = res.stores?.[0]?.id || '';
    setStoreId((prev) => (prev && (res.stores || []).some((s) => s.id === prev) ? prev : firstStore));
  }

  async function loadWarehouses(nextStoreId?: string) {
    const sid = (nextStoreId ?? storeId).trim();
    if (!verified || !orgId || !sid) return;
    const res = await portalFetch<{ warehouses: WarehouseRow[] }>({
      portalKey,
      path: `/portal/warehouses?orgId=${encodeURIComponent(orgId)}&storeId=${encodeURIComponent(sid)}`
    });
    setWarehouses(res.warehouses || []);
  }

  async function loadUsers() {
    if (!verified || !orgId) return;
    const res = await portalFetch<{ users: UserRow[] }>({
      portalKey,
      path: `/portal/users?orgId=${encodeURIComponent(orgId)}`
    });
    setUsers(res.users || []);
  }

  async function loadProducts() {
    if (!verified || !orgId) return;
    const res = await portalFetch<{ products: ProductRow[] }>({
      portalKey,
      path: `/portal/products?orgId=${encodeURIComponent(orgId)}`
    });
    setProducts(res.products || []);
  }

  async function loadCategories() {
    if (!verified || !orgId) return;
    const res = await portalFetch<{ categories: CategoryRow[] }>({
      portalKey,
      path: `/portal/categories?orgId=${encodeURIComponent(orgId)}`
    });
    setCategories(res.categories || []);
  }

  async function createCategory(input: { name: string; posVisible: boolean }) {
    if (!verified || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await portalFetch<{ category: CategoryRow }>({
        portalKey,
        path: `/portal/categories?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'POST', body: JSON.stringify({ name: input.name.trim(), posVisible: input.posVisible }) }
      });
      await loadCategories();
      return res.category;
    } catch (e: any) {
      setError(e?.message || 'Failed to create category');
      return;
    } finally {
      setBusy(false);
    }
  }

  async function setCategoryPosVisible(categoryId: string, next: boolean) {
    if (!verified || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await portalFetch<{ category: CategoryRow }>({
        portalKey,
        path: `/portal/categories/${encodeURIComponent(categoryId)}?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'PATCH', body: JSON.stringify({ posVisible: next }) }
      });
      const updated = res.category;
      setCategories((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    } catch (e: any) {
      setError(e?.message || 'Failed to update category');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!verified || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      await portalFetch({
        portalKey,
        path: `/portal/categories/${encodeURIComponent(categoryId)}?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'DELETE' }
      });
      await loadCategories();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete category');
    } finally {
      setBusy(false);
    }
  }

  async function createStore() {
    if (!verified || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        code: creatingStore.code.trim(),
        name: creatingStore.name.trim(),
        address: creatingStore.address.trim(),
        stateCode: creatingStore.stateCode.trim()
      };
      await portalFetch({
        portalKey,
        path: `/portal/stores?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'POST', body: JSON.stringify(body) }
      });
      setCreatingStore({ code: '', name: '', address: '', stateCode: '' });
      await loadStores();
    } catch (e: any) {
      setError(e?.message || 'Failed to create store');
    } finally {
      setBusy(false);
    }
  }

  async function beginEditStore(id: string) {
    const s = stores.find((x) => x.id === id);
    if (!s) return;
    setEditingStoreId(id);
    setEditingStore({
      name: s.name || '',
      phone: s.phone || '',
      address: s.address || '',
      gstin: s.gstin || '',
      footerNote: s.footerNote || ''
    });
  }

  async function saveStoreEdits() {
    if (!verified || !orgId || !editingStoreId) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: editingStore.name,
        phone: editingStore.phone,
        address: editingStore.address,
        gstin: editingStore.gstin,
        footerNote: editingStore.footerNote
      };
      await portalFetch({
        portalKey,
        path: `/portal/stores/${editingStoreId}?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'PATCH', body: JSON.stringify(body) }
      });
      setEditingStoreId(null);
      await loadStores();
    } catch (e: any) {
      setError(e?.message || 'Failed to update store');
    } finally {
      setBusy(false);
    }
  }

  async function deleteStore(id: string) {
    if (!verified || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      await portalFetch({
        portalKey,
        path: `/portal/stores/${id}?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'DELETE' }
      });
      if (storeId === id) setStoreId('');
      await loadStores();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete store');
    } finally {
      setBusy(false);
    }
  }

  async function createWarehouse() {
    if (!verified || !orgId || !storeId) return;
    setBusy(true);
    setError(null);
    try {
      const body = { storeId, name: creatingWarehouse.name.trim() };
      await portalFetch({
        portalKey,
        path: `/portal/warehouses?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'POST', body: JSON.stringify(body) }
      });
      setCreatingWarehouse({ name: '' });
      await loadWarehouses();
    } catch (e: any) {
      setError(e?.message || 'Failed to create warehouse');
    } finally {
      setBusy(false);
    }
  }

  async function deleteWarehouse(id: string) {
    if (!verified || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      await portalFetch({
        portalKey,
        path: `/portal/warehouses/${id}?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'DELETE' }
      });
      await loadWarehouses();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete warehouse');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!verified || !orgId) return;
    void loadUsers();
    void loadProducts();
    void loadCategories();
  }, [verified, orgId]);

  const orgOptions = useMemo(
    () => [{ value: '', label: 'Select org' }, ...(orgs || []).map((o) => ({ value: o.id, label: o.name }))],
    [orgs]
  );
  const storeOptions = useMemo(
    () => [{ value: '', label: 'Select store' }, ...(stores || []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))],
    [stores]
  );
  const warehouseOptions = useMemo(
    () => [{ value: '', label: 'Select warehouse' }, ...(warehouses || []).map((w) => ({ value: w.id, label: w.name }))],
    [warehouses]
  );
  const portalManagedProducts = useMemo(() => (products || []).filter((p) => !!p.isPortalManaged), [products]);
  const productOptions = useMemo(
    () => [{ value: '', label: 'Select product' }, ...(portalManagedProducts || []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))],
    [portalManagedProducts]
  );
  const categoryOptions = useMemo(
    () => [{ value: '', label: 'Uncategorized' }, ...(categories || []).map((c) => ({ value: c.id, label: c.name }))],
    [categories]
  );

  const [newAdmin, setNewAdmin] = useState<{ fullName: string; phone: string; email: string; password: string; storeId: string }>({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    storeId: ''
  });

  const [newProduct, setNewProduct] = useState<{
    code: string;
    name: string;
    hsnCode: string;
    gstRatePercent: string;
    sellingPriceRupees: string;
    posVisible: boolean;
    categoryId: string;
  }>({ code: '', name: '', hsnCode: '', gstRatePercent: '5', sellingPriceRupees: '', posVisible: true, categoryId: '' });

  const [newCategory, setNewCategory] = useState<{ name: string; posVisible: boolean }>({ name: '', posVisible: true });

  const [directStock, setDirectStock] = useState<{
    warehouseId: string;
    productId: string;
    qty: string;
    unitCostRupees: string;
  }>({ warehouseId: '', productId: '', qty: '', unitCostRupees: '' });

  const [productScope, setProductScope] = useState<'ALL' | 'PORTAL_MANAGED'>('ALL');
  const [productPosFilter, setProductPosFilter] = useState<'ALL' | 'VISIBLE' | 'HIDDEN'>('ALL');
  const [productSearch, setProductSearch] = useState('');

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return (products || []).filter((p) => {
      if (productScope === 'PORTAL_MANAGED' && !p.isPortalManaged) return false;
      if (productPosFilter === 'VISIBLE' && !p.posVisible) return false;
      if (productPosFilter === 'HIDDEN' && p.posVisible) return false;
      if (q) {
        const hay = `${p.code} ${p.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, productScope, productPosFilter, productSearch]);

  async function setProductPosVisible(productId: string, next: boolean) {
    if (!verified || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await portalFetch<{ product: ProductRow }>({
        portalKey,
        path: `/portal/products/${encodeURIComponent(productId)}?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'PATCH', body: JSON.stringify({ posVisible: next }) }
      });
      const updated = res.product;
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    } catch (e: any) {
      setError(e?.message || 'Failed to update product');
    } finally {
      setBusy(false);
    }
  }

  async function createAdminUser() {
    if (!verified || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        orgId,
        storeId: (newAdmin.storeId || storeId || '').trim() || undefined,
        fullName: newAdmin.fullName.trim(),
        phone: newAdmin.phone.trim(),
        email: newAdmin.email.trim() || undefined,
        password: newAdmin.password
      };
      await portalFetch({ portalKey, path: '/portal/admin-users', init: { method: 'POST', body: JSON.stringify(body) } });
      setNewAdmin({ fullName: '', phone: '', email: '', password: '', storeId: '' });
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || 'Failed to create admin user');
    } finally {
      setBusy(false);
    }
  }

  async function createPortalProduct() {
    if (!verified || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      const gstRatePercent = Number(newProduct.gstRatePercent);
      if (!Number.isFinite(gstRatePercent) || gstRatePercent < 0 || gstRatePercent > 28) throw new Error('Invalid GST rate');
      const selling = Number(newProduct.sellingPriceRupees);
      if (!Number.isFinite(selling) || selling < 0) throw new Error('Invalid selling price');
      const body = {
        code: newProduct.code.trim(),
        name: newProduct.name.trim(),
        hsnCode: newProduct.hsnCode.trim(),
        gstRatePercent,
        sellingPriceRupees: selling,
        posVisible: newProduct.posVisible,
        categoryId: newProduct.categoryId.trim() ? newProduct.categoryId.trim() : undefined
      };
      await portalFetch({
        portalKey,
        path: `/portal/products?orgId=${encodeURIComponent(orgId)}`,
        init: { method: 'POST', body: JSON.stringify(body) }
      });
      setNewProduct({
        code: '',
        name: '',
        hsnCode: '',
        gstRatePercent: newProduct.gstRatePercent,
        sellingPriceRupees: '',
        posVisible: true,
        categoryId: ''
      });
      await loadProducts();
    } catch (e: any) {
      setError(e?.message || 'Failed to create product');
    } finally {
      setBusy(false);
    }
  }

  async function receiveDirectStock() {
    if (!verified || !orgId || !storeId) return;
    setBusy(true);
    setError(null);
    try {
      const qty = Number(directStock.qty);
      const unitCost = Number(directStock.unitCostRupees);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('Invalid qty');
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('Invalid unit cost');
      const body = {
        orgId,
        storeId,
        warehouseId: directStock.warehouseId,
        productId: directStock.productId,
        qty,
        unitCostRupees: unitCost
      };
      await portalFetch({ portalKey, path: '/portal/direct-stock', init: { method: 'POST', body: JSON.stringify(body) } });
      setDirectStock({ warehouseId: '', productId: '', qty: '', unitCostRupees: '' });
    } catch (e: any) {
      setError(e?.message || 'Failed to receive stock');
    } finally {
      setBusy(false);
    }
  }

  if (!verified) {
    return (
      <div className="tw-min-h-screen tw-bg-bg">
        <div className="tw-mx-auto tw-max-w-[760px] tw-px-6 tw-py-10 tw-space-y-6">
          <div className="tw-flex tw-items-center tw-gap-3">
            <img src={`${apiBaseUrl()}/assets/logo.svg`} alt="" className="tw-h-10 tw-w-10 tw-rounded-[10px]" />
            <div>
              <div className="tw-text-[20px] tw-font-semibold tw-text-ink">Sutra Portal</div>
              <div className="tw-text-[12px] tw-text-muted">Standalone admin portal (not linked from POS/Backoffice)</div>
            </div>
          </div>

          {error ? <div className="tw-rounded-control tw-border tw-border-red-200 tw-bg-red-50 tw-p-3 tw-text-[14px] tw-text-red-800">{error}</div> : null}

          <StCard title="Portal Access">
            <div className="tw-grid tw-grid-cols-12 tw-gap-4">
              <div className="tw-col-span-12">
                <StLabel>Portal Key</StLabel>
                <StInput value={portalKey} onChange={(e) => setPortalKey(e.target.value)} placeholder="Enter portal key" />
              </div>
              <div className="tw-col-span-12 tw-flex tw-justify-end tw-gap-2">
                <StButton
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(PORTAL_KEY_STORAGE);
                    setPortalKey('');
                    setError(null);
                  }}
                  disabled={busy}
                >
                  Clear
                </StButton>
                <StButton variant="primary" type="button" onClick={() => void verifyAndLoadOrgs(portalKey)} disabled={busy}>
                  Enter
                </StButton>
              </div>
            </div>
          </StCard>

          <div className="tw-text-[12px] tw-text-muted">
            Backend must have <span className="tw-font-semibold">PORTAL_ACCESS_KEY</span> set to enable this portal.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-min-h-screen tw-bg-bg">
      <div className="tw-border-b tw-border-line tw-bg-white">
        <div className="tw-mx-auto tw-max-w-[1280px] tw-px-6 tw-py-5 tw-flex tw-items-start tw-justify-between tw-gap-6">
          <div className="tw-flex tw-items-center tw-gap-3">
            <img src={`${apiBaseUrl()}/assets/logo.svg`} alt="" className="tw-h-9 tw-w-9 tw-rounded-[10px]" />
            <div>
              <div className="tw-flex tw-items-center tw-gap-2">
                <div className="tw-text-[18px] tw-font-semibold tw-text-ink">Sutra Portal</div>
                <StBadge tone="neutral">Private</StBadge>
              </div>
              <div className="tw-text-[12px] tw-text-muted">Admin users, direct products/stock, stitching templates</div>
            </div>
          </div>

          <div className="tw-flex tw-items-center tw-gap-2">
            <StButton
              variant="secondary"
              type="button"
              onClick={() => {
                localStorage.removeItem(PORTAL_KEY_STORAGE);
                setVerified(false);
                setPortalKey('');
                nav('/portal', { replace: true });
              }}
            >
              Logout
            </StButton>
          </div>
        </div>
      </div>

      <div className="tw-mx-auto tw-max-w-[1280px] tw-px-6 tw-py-6 tw-space-y-6">
        {error ? <div className="tw-rounded-control tw-border tw-border-red-200 tw-bg-red-50 tw-p-3 tw-text-[14px] tw-text-red-800">{error}</div> : null}

        <StCard title="Context">
          <div className="tw-grid tw-grid-cols-12 tw-gap-4">
            <div className="tw-col-span-12 md:tw-col-span-6">
              <StLabel>Organization</StLabel>
                <StSelect value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                  {renderOptions(orgOptions)}
                </StSelect>
            </div>
            <div className="tw-col-span-12 md:tw-col-span-6">
                <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                  <StLabel>Store</StLabel>
                  <div className="tw-flex tw-gap-2">
                    <StButton variant="secondary" type="button" onClick={() => setWarehouseManagerOpen(true)} disabled={!storeId}>
                      Warehouses
                    </StButton>
                    <StButton variant="secondary" type="button" onClick={() => setStoreManagerOpen(true)}>
                      Stores
                    </StButton>
                  </div>
                </div>
                <StSelect value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  {renderOptions(storeOptions)}
                </StSelect>
            </div>
          </div>
        </StCard>

        <div className="tw-flex tw-flex-wrap tw-gap-2">
          <StButton variant={tab === 'users' ? 'primary' : 'secondary'} type="button" onClick={() => setTab('users')}>
            Admin Users
          </StButton>
          <StButton variant={tab === 'products' ? 'primary' : 'secondary'} type="button" onClick={() => setTab('products')}>
            Products
          </StButton>
          <StButton variant={tab === 'categories' ? 'primary' : 'secondary'} type="button" onClick={() => setTab('categories')}>
            Categories
          </StButton>
          <StButton variant={tab === 'stock' ? 'primary' : 'secondary'} type="button" onClick={() => setTab('stock')}>
            Direct Stock
          </StButton>
          <StButton variant={tab === 'stitching' ? 'primary' : 'secondary'} type="button" onClick={() => setTab('stitching')}>
            Stitching Templates
          </StButton>
        </div>

        {tab === 'users' ? (
          <div className="tw-grid tw-grid-cols-12 tw-gap-6">
            <div className="tw-col-span-12 lg:tw-col-span-5">
              <StCard title="Create Admin User" right={<StBadge tone="success">Env-protected</StBadge>}>
                <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                  <div className="tw-col-span-12">
                    <StLabel>Full Name</StLabel>
                    <StInput value={newAdmin.fullName} onChange={(e) => setNewAdmin({ ...newAdmin, fullName: e.target.value })} />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Phone</StLabel>
                    <StInput value={newAdmin.phone} onChange={(e) => setNewAdmin({ ...newAdmin, phone: e.target.value })} placeholder="10-digit" />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Email (optional)</StLabel>
                    <StInput value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Password</StLabel>
                    <StInput value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} type="password" />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Store (optional)</StLabel>
                    <StSelect value={newAdmin.storeId} onChange={(e) => setNewAdmin({ ...newAdmin, storeId: e.target.value })}>
                      {renderOptions(storeOptions)}
                    </StSelect>
                  </div>
                  <div className="tw-col-span-12 tw-flex tw-justify-end tw-gap-2">
                    <StButton variant="secondary" type="button" onClick={() => void loadUsers()} disabled={busy}>
                      Refresh
                    </StButton>
                    <StButton variant="primary" type="button" onClick={() => void createAdminUser()} disabled={busy || !orgId}>
                      Create
                    </StButton>
                  </div>
                </div>
              </StCard>
            </div>

            <div className="tw-col-span-12 lg:tw-col-span-7">
              <StCard title="Admin Users">
                {users.length === 0 ? (
                  <StEmpty title="No users" subtitle="Create the first admin user from the left panel" />
                ) : (
                  <div className="tw-overflow-auto tw-rounded-card tw-border tw-border-line tw-bg-white">
                    <table className="tw-w-full tw-text-[13px]">
                      <thead className="tw-bg-bg tw-text-muted">
                        <tr>
                          <th className="tw-text-left tw-px-3 tw-py-2">Name</th>
                          <th className="tw-text-left tw-px-3 tw-py-2">Phone</th>
                          <th className="tw-text-left tw-px-3 tw-py-2">Email</th>
                          <th className="tw-text-left tw-px-3 tw-py-2">Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id} className="tw-border-t tw-border-line">
                            <td className="tw-px-3 tw-py-2">{u.fullName}</td>
                            <td className="tw-px-3 tw-py-2">{u.phone || '-'}</td>
                            <td className="tw-px-3 tw-py-2">{u.email || '-'}</td>
                            <td className="tw-px-3 tw-py-2">
                              <StBadge tone="neutral">{u.role}</StBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </StCard>
            </div>
          </div>
        ) : null}

        {tab === 'products' ? (
          <div className="tw-grid tw-grid-cols-12 tw-gap-6">
            <div className="tw-col-span-12 lg:tw-col-span-5">
              <StCard title="Create Product" right={<StBadge tone="warning">Portal-managed</StBadge>}>
                <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                  <div className="tw-col-span-12">
                    <StLabel>Code</StLabel>
                    <StInput value={newProduct.code} onChange={(e) => setNewProduct({ ...newProduct, code: e.target.value })} placeholder="Unique code" />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Name</StLabel>
                    <StInput value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>HSN</StLabel>
                    <StInput value={newProduct.hsnCode} onChange={(e) => setNewProduct({ ...newProduct, hsnCode: e.target.value })} />
                  </div>
                  <div className="tw-col-span-6">
                    <StLabel>GST %</StLabel>
                    <StInput value={newProduct.gstRatePercent} onChange={(e) => setNewProduct({ ...newProduct, gstRatePercent: e.target.value })} />
                  </div>
                  <div className="tw-col-span-6">
                    <StLabel>Selling Price (₹)</StLabel>
                    <StInput value={newProduct.sellingPriceRupees} onChange={(e) => setNewProduct({ ...newProduct, sellingPriceRupees: e.target.value })} />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Category</StLabel>
                    <StSelect value={newProduct.categoryId} onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })}>
                      {renderOptions(categoryOptions)}
                    </StSelect>
                    <div className="tw-mt-2 tw-grid tw-grid-cols-12 tw-gap-2">
                      <div className="tw-col-span-12 md:tw-col-span-8">
                        <StInput value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="Add new category (optional)" />
                      </div>
                      <div className="tw-col-span-12 md:tw-col-span-4">
                        <StButton
                          variant="secondary"
                          type="button"
                          onClick={async () => {
                            const name = newCategory.name.trim();
                            if (!name) return;
                            const created = await createCategory({ name, posVisible: true });
                            if (!created) return;
                            setNewCategory({ name: '', posVisible: true });
                            setNewProduct((prev) => ({ ...prev, categoryId: created.id }));
                          }}
                          disabled={busy || !orgId || !newCategory.name.trim()}
                          className="tw-w-full"
                        >
                          Add Category
                        </StButton>
                      </div>
                    </div>
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Visible in POS</StLabel>
                    <StSelect value={newProduct.posVisible ? 'YES' : 'NO'} onChange={(e) => setNewProduct({ ...newProduct, posVisible: e.target.value === 'YES' })}>
                      <option value="YES">Yes (Show)</option>
                      <option value="NO">No (Hide)</option>
                    </StSelect>
                  </div>
                  <div className="tw-col-span-12 tw-flex tw-justify-end tw-gap-2">
                    <StButton variant="secondary" type="button" onClick={() => void loadProducts()} disabled={busy}>
                      Refresh
                    </StButton>
                    <StButton variant="primary" type="button" onClick={() => void createPortalProduct()} disabled={busy || !orgId}>
                      Create
                    </StButton>
                  </div>
                </div>
              </StCard>
            </div>

            <div className="tw-col-span-12 lg:tw-col-span-7">
              <StCard
                title="Products"
                right={
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <StSelect className="tw-h-9 tw-text-[13px]" value={productScope} onChange={(e) => setProductScope(e.target.value as any)}>
                      <option value="ALL">All products</option>
                      <option value="PORTAL_MANAGED">Portal-managed only</option>
                    </StSelect>
                    <StSelect className="tw-h-9 tw-text-[13px]" value={productPosFilter} onChange={(e) => setProductPosFilter(e.target.value as any)}>
                      <option value="ALL">All (POS)</option>
                      <option value="VISIBLE">Visible in POS</option>
                      <option value="HIDDEN">Hidden from POS</option>
                    </StSelect>
                  </div>
                }
              >
                {(products || []).length === 0 ? (
                  <StEmpty title="No products" subtitle="Products will appear here after you create them in ERP or Portal" />
                ) : (
                  <div className="tw-space-y-3">
                    <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                      <div className="tw-col-span-12">
                        <StLabel>Search</StLabel>
                        <StInput value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search by code or name" />
                      </div>
                    </div>
                    <div className="tw-overflow-auto tw-rounded-card tw-border tw-border-line tw-bg-white">
                      <table className="tw-w-full tw-text-[13px]">
                      <thead className="tw-bg-bg tw-text-muted">
                        <tr>
                          <th className="tw-text-left tw-px-3 tw-py-2">Code</th>
                          <th className="tw-text-left tw-px-3 tw-py-2">Name</th>
                          <th className="tw-text-left tw-px-3 tw-py-2">Category</th>
                          <th className="tw-text-left tw-px-3 tw-py-2">POS</th>
                          <th className="tw-text-left tw-px-3 tw-py-2">Type</th>
                          <th className="tw-text-right tw-px-3 tw-py-2">GST</th>
                          <th className="tw-text-right tw-px-3 tw-py-2">Selling (₹)</th>
                          <th className="tw-text-right tw-px-3 tw-py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map((p) => (
                          <tr key={p.id} className="tw-border-t tw-border-line">
                            <td className="tw-px-3 tw-py-2 tw-font-medium">{p.code}</td>
                            <td className="tw-px-3 tw-py-2">{p.name}</td>
                            <td className="tw-px-3 tw-py-2">{p.category?.name || '-'}</td>
                            <td className="tw-px-3 tw-py-2">
                              {p.posVisible ? <StBadge tone="success">Visible</StBadge> : <StBadge tone="danger">Hidden</StBadge>}
                            </td>
                            <td className="tw-px-3 tw-py-2">
                              {p.isPortalManaged ? <StBadge tone="warning">Portal</StBadge> : <StBadge tone="neutral">ERP</StBadge>}
                            </td>
                            <td className="tw-px-3 tw-py-2 tw-text-right">{(p.gstRateBp / 100).toFixed(2)}%</td>
                            <td className="tw-px-3 tw-py-2 tw-text-right">{rupeesFromPaiseString(p.sellingPricePaise)}</td>
                            <td className="tw-px-3 tw-py-2 tw-text-right">
                              <StButton
                                variant={p.posVisible ? 'secondary' : 'primary'}
                                className="tw-h-9 tw-px-3 tw-text-[13px]"
                                type="button"
                                onClick={() => void setProductPosVisible(p.id, !p.posVisible)}
                                disabled={busy}
                              >
                                {p.posVisible ? 'Hide' : 'Unhide'}
                              </StButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </StCard>
            </div>
          </div>
        ) : null}

        {tab === 'categories' ? (
          <div className="tw-grid tw-grid-cols-12 tw-gap-6">
            <div className="tw-col-span-12 lg:tw-col-span-5">
              <StCard title="Create Category">
                <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                  <div className="tw-col-span-12">
                    <StLabel>Name</StLabel>
                    <StInput value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Visible in POS</StLabel>
                    <StSelect value={newCategory.posVisible ? 'YES' : 'NO'} onChange={(e) => setNewCategory({ ...newCategory, posVisible: e.target.value === 'YES' })}>
                      <option value="YES">Yes (Show)</option>
                      <option value="NO">No (Hide)</option>
                    </StSelect>
                  </div>
                  <div className="tw-col-span-12 tw-flex tw-justify-end tw-gap-2">
                    <StButton variant="secondary" type="button" onClick={() => void loadCategories()} disabled={busy}>
                      Refresh
                    </StButton>
                    <StButton
                      variant="primary"
                      type="button"
                      onClick={async () => {
                        const created = await createCategory({ name: newCategory.name, posVisible: newCategory.posVisible });
                        if (!created) return;
                        setNewCategory({ name: '', posVisible: true });
                      }}
                      disabled={busy || !orgId || !newCategory.name.trim()}
                    >
                      Create
                    </StButton>
                  </div>
                </div>
              </StCard>
            </div>
            <div className="tw-col-span-12 lg:tw-col-span-7">
              <StCard title="Categories">
                {(categories || []).length === 0 ? (
                  <StEmpty title="No categories" subtitle="Create your first category on the left" />
                ) : (
                  <div className="tw-overflow-auto tw-rounded-card tw-border tw-border-line tw-bg-white">
                    <table className="tw-w-full tw-text-[13px]">
                      <thead className="tw-bg-bg tw-text-muted">
                        <tr>
                          <th className="tw-text-left tw-px-3 tw-py-2">Name</th>
                          <th className="tw-text-left tw-px-3 tw-py-2">POS</th>
                          <th className="tw-text-right tw-px-3 tw-py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(categories || []).map((c) => (
                          <tr key={c.id} className="tw-border-t tw-border-line">
                            <td className="tw-px-3 tw-py-2 tw-font-medium">{c.name}</td>
                            <td className="tw-px-3 tw-py-2">
                              {c.posVisible ? <StBadge tone="success">Visible</StBadge> : <StBadge tone="danger">Hidden</StBadge>}
                            </td>
                            <td className="tw-px-3 tw-py-2 tw-text-right">
                              <div className="tw-flex tw-justify-end tw-gap-2">
                                <StButton
                                  variant={c.posVisible ? 'secondary' : 'primary'}
                                  className="tw-h-9 tw-px-3 tw-text-[13px]"
                                  type="button"
                                  onClick={() => void setCategoryPosVisible(c.id, !c.posVisible)}
                                  disabled={busy}
                                >
                                  {c.posVisible ? 'Hide' : 'Unhide'}
                                </StButton>
                                <StButton
                                  variant="secondary"
                                  className="tw-h-9 tw-px-3 tw-text-[13px]"
                                  type="button"
                                  onClick={() => void deleteCategory(c.id)}
                                  disabled={busy}
                                >
                                  Delete
                                </StButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </StCard>
            </div>
          </div>
        ) : null}

        {tab === 'stock' ? (
          <div className="tw-grid tw-grid-cols-12 tw-gap-6">
            <div className="tw-col-span-12 lg:tw-col-span-5">
              <StCard title="Receive Direct Stock" right={<StBadge tone="warning">Debits Inventory</StBadge>}>
                <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                  <div className="tw-col-span-12">
                    <StLabel>Warehouse</StLabel>
                    <StSelect value={directStock.warehouseId} onChange={(e) => setDirectStock({ ...directStock, warehouseId: e.target.value })}>
                      {renderOptions(warehouseOptions)}
                    </StSelect>
                    {warehouses.length === 0 ? (
                      <div className="tw-mt-2 tw-flex tw-items-center tw-justify-between tw-gap-2 tw-rounded-control tw-border tw-border-line tw-bg-bg tw-px-3 tw-py-2">
                        <div className="tw-text-[12px] tw-text-muted">No warehouse found for this store.</div>
                        <StButton variant="secondary" type="button" onClick={() => setWarehouseManagerOpen(true)}>
                          Add Warehouse
                        </StButton>
                      </div>
                    ) : null}
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Product</StLabel>
                    <StSelect value={directStock.productId} onChange={(e) => setDirectStock({ ...directStock, productId: e.target.value })}>
                      {renderOptions(productOptions)}
                    </StSelect>
                  </div>
                  <div className="tw-col-span-6">
                    <StLabel>Qty</StLabel>
                    <StInput value={directStock.qty} onChange={(e) => setDirectStock({ ...directStock, qty: e.target.value })} />
                  </div>
                  <div className="tw-col-span-6">
                    <StLabel>Unit Cost (₹)</StLabel>
                    <StInput value={directStock.unitCostRupees} onChange={(e) => setDirectStock({ ...directStock, unitCostRupees: e.target.value })} />
                  </div>
                  <div className="tw-col-span-12 tw-flex tw-justify-end tw-gap-2">
                    <StButton variant="primary" type="button" onClick={() => void receiveDirectStock()} disabled={busy || !directStock.warehouseId || !directStock.productId}>
                      Receive
                    </StButton>
                  </div>
                </div>
              </StCard>
            </div>

            <div className="tw-col-span-12 lg:tw-col-span-7">
              <StCard title="Notes">
                <div className="tw-text-[13px] tw-text-muted tw-space-y-2">
                  <div>- Direct stock is allowed only for portal-managed products.</div>
                  <div>- Accounting entry stays balanced: Inventory (Dr) vs Stock Adjustment Equity (Cr).</div>
                  <div>- POS product/category lists are filtered and will not show Materials/Services or any product marked hidden.</div>
                </div>
              </StCard>
            </div>
          </div>
        ) : null}

        {tab === 'stitching' ? (
          <StCard
            title="Stitching Templates"
            right={
              <div className="tw-flex tw-items-center tw-gap-2">
                <StBadge tone="neutral">Portal Only</StBadge>
              </div>
            }
          >
            {!orgId ? (
              <StEmpty title="Select organization" subtitle="Pick an organization in Context above" />
            ) : (
              <BackofficeStitchingProductsPage mode="PORTAL" portalKey={portalKey} orgId={orgId} storeId={storeId} />
            )}
          </StCard>
        ) : null}

        <div className="tw-text-[12px] tw-text-muted">
          Not linked from POS/Backoffice. Access directly at <span className="tw-font-semibold">/portal</span>.
        </div>
      </div>

      <StModal
        open={storeManagerOpen}
        title="Manage Stores"
        onClose={() => {
          setStoreManagerOpen(false);
          setEditingStoreId(null);
        }}
        footer={
          <div className="tw-flex tw-justify-end tw-gap-2">
            <StButton
              variant="secondary"
              type="button"
              onClick={() => void loadStores()}
              disabled={busy || !orgId}
            >
              Refresh
            </StButton>
          </div>
        }
        width="lg"
      >
        {!orgId ? (
          <StEmpty title="Select organization" subtitle="Pick an organization first" />
        ) : (
          <div className="tw-grid tw-grid-cols-12 tw-gap-6">
            <div className="tw-col-span-12 lg:tw-col-span-5">
              <StCard title="Add Store">
                <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                  <div className="tw-col-span-12">
                    <StLabel>Code</StLabel>
                    <StInput value={creatingStore.code} onChange={(e) => setCreatingStore({ ...creatingStore, code: e.target.value })} placeholder="e.g. ST01" />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Name</StLabel>
                    <StInput value={creatingStore.name} onChange={(e) => setCreatingStore({ ...creatingStore, name: e.target.value })} />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>Address</StLabel>
                    <StInput value={creatingStore.address} onChange={(e) => setCreatingStore({ ...creatingStore, address: e.target.value })} />
                  </div>
                  <div className="tw-col-span-12">
                    <StLabel>State Code (GST, 2 digits)</StLabel>
                    <StInput value={creatingStore.stateCode} onChange={(e) => setCreatingStore({ ...creatingStore, stateCode: e.target.value })} placeholder="e.g. 29" />
                  </div>
                  <div className="tw-col-span-12 tw-flex tw-justify-end tw-gap-2">
                    <StButton variant="primary" type="button" onClick={() => void createStore()} disabled={busy}>
                      Add Store
                    </StButton>
                  </div>
                </div>
              </StCard>
            </div>

            <div className="tw-col-span-12 lg:tw-col-span-7">
              <StCard title="Stores">
                {stores.length === 0 ? (
                  <StEmpty title="No stores" subtitle="Add your first store on the left" />
                ) : (
                  <div className="tw-space-y-3">
                    <div className="tw-overflow-auto tw-rounded-card tw-border tw-border-line tw-bg-white">
                      <table className="tw-w-full tw-text-[13px]">
                        <thead className="tw-bg-bg tw-text-muted">
                          <tr>
                            <th className="tw-text-left tw-px-3 tw-py-2">Code</th>
                            <th className="tw-text-left tw-px-3 tw-py-2">Name</th>
                            <th className="tw-text-left tw-px-3 tw-py-2">State</th>
                            <th className="tw-text-right tw-px-3 tw-py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stores.map((s) => (
                            <tr key={s.id} className="tw-border-t tw-border-line">
                              <td className="tw-px-3 tw-py-2 tw-font-medium">{s.code}</td>
                              <td className="tw-px-3 tw-py-2">{s.name}</td>
                              <td className="tw-px-3 tw-py-2">{s.stateCode}</td>
                              <td className="tw-px-3 tw-py-2 tw-text-right">
                                <div className="tw-flex tw-justify-end tw-gap-2">
                                  <StButton variant="secondary" type="button" onClick={() => void beginEditStore(s.id)} disabled={busy}>
                                    Edit
                                  </StButton>
                                  <StButton variant="secondary" type="button" onClick={() => void deleteStore(s.id)} disabled={busy}>
                                    Delete
                                  </StButton>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {editingStoreId ? (
                      <StCard title="Edit Store">
                        <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                          <div className="tw-col-span-12">
                            <StLabel>Name</StLabel>
                            <StInput value={editingStore.name} onChange={(e) => setEditingStore({ ...editingStore, name: e.target.value })} />
                          </div>
                          <div className="tw-col-span-12">
                            <StLabel>Phone</StLabel>
                            <StInput value={editingStore.phone} onChange={(e) => setEditingStore({ ...editingStore, phone: e.target.value })} />
                          </div>
                          <div className="tw-col-span-12">
                            <StLabel>Address</StLabel>
                            <StInput value={editingStore.address} onChange={(e) => setEditingStore({ ...editingStore, address: e.target.value })} />
                          </div>
                          <div className="tw-col-span-12">
                            <StLabel>GSTIN</StLabel>
                            <StInput value={editingStore.gstin} onChange={(e) => setEditingStore({ ...editingStore, gstin: e.target.value })} />
                          </div>
                          <div className="tw-col-span-12">
                            <StLabel>Footer Note</StLabel>
                            <StInput value={editingStore.footerNote} onChange={(e) => setEditingStore({ ...editingStore, footerNote: e.target.value })} />
                          </div>
                          <div className="tw-col-span-12 tw-flex tw-justify-end tw-gap-2">
                            <StButton variant="secondary" type="button" onClick={() => setEditingStoreId(null)} disabled={busy}>
                              Cancel
                            </StButton>
                            <StButton variant="primary" type="button" onClick={() => void saveStoreEdits()} disabled={busy}>
                              Save
                            </StButton>
                          </div>
                        </div>
                      </StCard>
                    ) : null}
                  </div>
                )}
              </StCard>
            </div>
          </div>
        )}
      </StModal>

      <StModal
        open={warehouseManagerOpen}
        title="Manage Warehouses"
        onClose={() => setWarehouseManagerOpen(false)}
        footer={
          <div className="tw-flex tw-justify-end tw-gap-2">
            <StButton variant="secondary" type="button" onClick={() => void loadWarehouses()} disabled={busy || !storeId}>
              Refresh
            </StButton>
          </div>
        }
        width="md"
      >
        {!orgId || !storeId ? (
          <StEmpty title="Select store" subtitle="Pick an organization and store first" />
        ) : (
          <div className="tw-space-y-4">
            <StCard title="Add Warehouse">
              <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                <div className="tw-col-span-12">
                  <StLabel>Name</StLabel>
                  <StInput value={creatingWarehouse.name} onChange={(e) => setCreatingWarehouse({ name: e.target.value })} placeholder="e.g. Main" />
                </div>
                <div className="tw-col-span-12 tw-flex tw-justify-end">
                  <StButton variant="primary" type="button" onClick={() => void createWarehouse()} disabled={busy}>
                    Add Warehouse
                  </StButton>
                </div>
              </div>
            </StCard>

            <StCard title="Warehouses">
              {warehouses.length === 0 ? (
                <StEmpty title="No warehouses" subtitle="Add your first warehouse above" />
              ) : (
                <div className="tw-overflow-auto tw-rounded-card tw-border tw-border-line tw-bg-white">
                  <table className="tw-w-full tw-text-[13px]">
                    <thead className="tw-bg-bg tw-text-muted">
                      <tr>
                        <th className="tw-text-left tw-px-3 tw-py-2">Name</th>
                        <th className="tw-text-right tw-px-3 tw-py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warehouses.map((w) => (
                        <tr key={w.id} className="tw-border-t tw-border-line">
                          <td className="tw-px-3 tw-py-2">{w.name}</td>
                          <td className="tw-px-3 tw-py-2 tw-text-right">
                            <StButton variant="secondary" type="button" onClick={() => void deleteWarehouse(w.id)} disabled={busy}>
                              Delete
                            </StButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </StCard>
          </div>
        )}
      </StModal>
    </div>
  );
}
