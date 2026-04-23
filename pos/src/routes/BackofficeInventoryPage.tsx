import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiBaseUrl, apiFetch } from '../lib/api';
import { getAuth } from '../lib/auth';
import { paiseStringToBigInt, paiseToRupeesString } from '../lib/money';

type Store = { id: string; code: string; name: string };
type Category = { id: string; name: string; imageUrl?: string };
type Product = { 
  id: string; 
  code: string; 
  name: string; 
  sizeLabel?: string;
  parentProductId?: string | null;
  imageUrl?: string | null;
  hsnCode: string; 
  gstRateBp: number; 
  sellingPricePaise: string; 
  costPricePaise: string;
  categoryId?: string | null;
  category?: { name: string } | null;
};

function parseQty(q: string) {
  const n = Number(q);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function BackofficeInventoryPage() {
  const [tab, setTab] = useState<'STOCK' | 'PRODUCTS' | 'CATEGORIES'>('STOCK');
  const [includeSizes, setIncludeSizes] = useState(false);

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>('');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [stock, setStock] = useState<Array<{ product: Product; qtyAvailable: string }>>([]);
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'EMPTY'>('ALL');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<{ id: string; kind: 'product' | 'category' } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const menuAnchorElRef = useRef<HTMLElement | null>(null);
  const menuPortalRef = useRef<HTMLDivElement | null>(null);
  const [drawer, setDrawer] = useState<{ open: boolean; product?: Product; qtyAvailable?: string }>({ open: false });

  // Modals
  const [catModal, setCatModal] = useState<{ open: boolean; id?: string; name: string }>({ open: false, name: '' });
  const [prodModal, setProdModal] = useState<{ open: boolean; id?: string; code: string; name: string; hsnCode: string; gstRatePercent: string; sellingPriceRupees: string; categoryId: string }>({
    open: false, code: '', name: '', hsnCode: '', gstRatePercent: '', sellingPriceRupees: '', categoryId: ''
  });
  const [confirm, setConfirm] = useState<{ open: boolean; kind: 'product' | 'category'; id?: string; label?: string }>({ open: false, kind: 'product' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        const s = await apiFetch<{ stores: Store[] }>('/stores');
        if (!active) return;
        setStores(s.stores);
        setStoreId((prev) => prev || getAuth()?.user.storeId || s.stores[0]?.id || '');
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load stores');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        if (tab === 'STOCK' && storeId) {
          const res = await apiFetch<{ stock: Array<{ product: Product; qtyAvailable: string }> }>(
            `/inventory/stock?storeId=${storeId}&q=${encodeURIComponent(q.trim())}`
          );
          if (!active) return;
          setStock(res.stock);
        } else if (tab === 'PRODUCTS') {
          const [res, cats] = await Promise.all([
            apiFetch<{ products: Product[] }>(`/products?q=${encodeURIComponent(q.trim())}`),
            apiFetch<{ categories: Category[] }>('/categories')
          ]);
          if (!active) return;
          setProducts(res.products);
          setCategories(cats.categories);
        } else if (tab === 'CATEGORIES') {
          const res = await apiFetch<{ categories: Category[] }>('/categories');
          if (!active) return;
          setCategories(res.categories);
        }
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load data');
      }
    })();
    return () => {
      active = false;
    };
  }, [storeId, q, tab]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => {
      setMenuOpen(null);
      setMenuAnchor(null);
      menuAnchorElRef.current = null;
    };

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuPortalRef.current && menuPortalRef.current.contains(t)) return;
      if (menuAnchorElRef.current && menuAnchorElRef.current.contains(t)) return;
      close();
    };

    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  async function saveCategory() {
    try {
      if (catModal.id) {
        await apiFetch(`/categories/${catModal.id}`, { method: 'PATCH', body: JSON.stringify({ name: catModal.name }) });
      } else {
        await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ name: catModal.name }) });
      }
      setCatModal({ open: false, name: '' });
      setQ(' '); setQ(''); // force refresh
    } catch (e: any) { setError(e?.message); }
  }

  async function deleteCategory(id: string) {
    try {
      await apiFetch(`/categories/${id}`, { method: 'DELETE' });
      setQ(' '); setQ('');
    } catch (e: any) { setError(e?.message); }
  }

  async function saveProduct() {
    try {
      const code = prodModal.code.trim().toUpperCase();
      const hsn = prodModal.hsnCode.trim();
      const name = prodModal.name.trim();
      const gst = Number(prodModal.gstRatePercent);
      const price = Number(prodModal.sellingPriceRupees);
      if (!prodModal.id) {
        if (!/^[A-Z0-9]{2,6}-\d{4}(?:-[A-Z0-9]{1,12})?$/.test(code)) throw new Error('Invalid code. Example: SAR-0002 or SAR-0002-S');
      }
      if (name.length < 2) throw new Error('Enter product name');
      if (!/^\d{4,8}$/.test(hsn)) throw new Error('Invalid HSN (4–8 digits)');
      if (!Number.isFinite(gst) || gst < 0 || gst > 28) throw new Error('Invalid GST %');
      if (!Number.isFinite(price) || price < 0) throw new Error('Invalid selling price');

      if (prodModal.id) {
        const payload = {
          name,
          hsnCode: hsn,
          gstRatePercent: gst,
          sellingPriceRupees: price,
          categoryId: prodModal.categoryId || undefined
        };
        await apiFetch(`/products/${prodModal.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        const payload = {
          code,
          name,
          hsnCode: hsn,
          gstRatePercent: gst,
          sellingPriceRupees: price,
          categoryId: prodModal.categoryId || undefined
        };
        await apiFetch('/products', { method: 'POST', body: JSON.stringify(payload) });
      }
      setProdModal({ ...prodModal, open: false });
      setQ(' '); setQ('');
    } catch (e: any) {
      const issues = e?.details?.issues;
      if (Array.isArray(issues) && issues.length) {
        setError(issues.map((i: any) => `${i.path ? `${i.path}: ` : ''}${i.message}`).join('\n'));
      } else {
        setError(e?.message || 'Failed to save product');
      }
    }
  }

  async function deleteProduct(id: string) {
    try {
      await apiFetch(`/products/${id}`, { method: 'DELETE' });
      setQ(' '); setQ('');
    } catch (e: any) { setError(e?.message); }
  }

  const totalSkus = stock.length;
  const totalQty = useMemo(() => stock.reduce((s, r) => s + (parseQty(r.qtyAvailable) || 0), 0), [stock]);
  const lowCount = useMemo(() => stock.filter((r) => {
    const v = parseQty(r.qtyAvailable) ?? 0;
    return v > 0 && v <= 2;
  }).length, [stock]);
  const filteredStock = useMemo(() => {
    if (stockFilter === 'EMPTY') return stock.filter((r) => (parseQty(r.qtyAvailable) ?? 0) <= 0);
    if (stockFilter === 'LOW') return stock.filter((r) => {
      const v = parseQty(r.qtyAvailable) ?? 0;
      return v > 0 && v <= 2;
    });
    return stock;
  }, [stock, stockFilter]);

  const visibleProducts = useMemo(() => {
    if (includeSizes) return products;
    return products.filter((p) => !p.parentProductId);
  }, [products, includeSizes]);

  const sizesCount = useMemo(() => products.filter((p) => !!p.parentProductId).length, [products]);

  const filteredProducts = useMemo(() => {
    const base = visibleProducts;
    if (!categoryId) return base;
    return base.filter((p) => p.categoryId === categoryId);
  }, [visibleProducts, categoryId]);

  const [prodSort, setProdSort] = useState<{ key: 'PRICE' | 'GST' | 'CATEGORY'; dir: 'ASC' | 'DESC' } | null>(null);
  const sortedProducts = useMemo(() => {
    const arr = [...filteredProducts];
    if (!prodSort) return arr;
    const dir = prodSort.dir === 'ASC' ? 1 : -1;
    if (prodSort.key === 'PRICE') {
      arr.sort((a, b) => {
        const da = paiseStringToBigInt(a.sellingPricePaise);
        const db = paiseStringToBigInt(b.sellingPricePaise);
        return (da === db ? 0 : da > db ? 1 : -1) * dir;
      });
      return arr;
    }
    if (prodSort.key === 'GST') {
      arr.sort((a, b) => (a.gstRateBp - b.gstRateBp) * dir);
      return arr;
    }
    arr.sort((a, b) => ((a.category?.name || '').localeCompare(b.category?.name || '') || a.name.localeCompare(b.name)) * dir);
    return arr;
  }, [filteredProducts, prodSort]);

  function toggleSort(key: 'PRICE' | 'GST' | 'CATEGORY') {
    setProdSort((p) => {
      if (!p || p.key !== key) return { key, dir: 'ASC' };
      return { key, dir: p.dir === 'ASC' ? 'DESC' : 'ASC' };
    });
  }

  function openProductDrawer(p: Product, qtyAvailable?: string) {
    setDrawer({ open: true, product: p, qtyAvailable });
  }

  return (
    <div className="boPage invPage" onClick={() => setMenuOpen(null)}>
      <div className="invHeader">

        <div className="invHdrActions">
          {tab === 'PRODUCTS' ? (
            <button className="gBtn" onClick={() => setProdModal({ open: true, code: '', name: '', hsnCode: '', gstRatePercent: '', sellingPriceRupees: '', categoryId: '' })}>
              + Add Product
            </button>
          ) : tab === 'CATEGORIES' ? (
            <button className="gBtn" onClick={() => setCatModal({ open: true, name: '' })}>
              + Add Category
            </button>
          ) : null}
        </div>
      </div>

      <div className="invTabs">
        <button className={`invTab ${tab === 'STOCK' ? 'active' : ''}`} onClick={() => { setTab('STOCK'); setQ(''); setMenuOpen(null); setDrawer({ open: false }); }}>Stock Levels</button>
        <button className={`invTab ${tab === 'PRODUCTS' ? 'active' : ''}`} onClick={() => { setTab('PRODUCTS'); setQ(''); setMenuOpen(null); setDrawer({ open: false }); }}>Products</button>
        <button className={`invTab ${tab === 'CATEGORIES' ? 'active' : ''}`} onClick={() => { setTab('CATEGORIES'); setQ(''); setMenuOpen(null); setDrawer({ open: false }); }}>Categories</button>
      </div>

      {tab === 'STOCK' ? (
        <div className="invStats">
          <div className="invStat">
            <div className="invStatLabel">Total SKUs</div>
            <div className="invStatValue">{totalSkus}</div>
          </div>
          <div className="invStat">
            <div className="invStatLabel">Total Quantity</div>
            <div className="invStatValue">{totalQty.toFixed(3)}</div>
          </div>
          <div className="invStat">
            <div className="invStatLabel">Low Stock</div>
            <div className="invStatValue">{lowCount}</div>
          </div>
        </div>
      ) : null}

      {error && <div className="boToast">{error}</div>}

      <div className="invFilterBar">
        <div className="invSearch">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, SKU, category..." />
        </div>
        {tab === 'STOCK' ? (
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="invSelect">
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        ) : tab === 'PRODUCTS' ? (
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="invSelect">
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <div className="invFilters">
          {tab === 'STOCK' ? (
            <div className="invSeg">
              <button className={`invSegBtn ${stockFilter === 'ALL' ? 'active' : ''}`} onClick={() => setStockFilter('ALL')}>All</button>
              <button className={`invSegBtn ${stockFilter === 'LOW' ? 'active' : ''}`} onClick={() => setStockFilter('LOW')}>Low</button>
              <button className={`invSegBtn ${stockFilter === 'EMPTY' ? 'active' : ''}`} onClick={() => setStockFilter('EMPTY')}>Empty</button>
            </div>
          ) : tab === 'PRODUCTS' ? (
            <label className="invToggle" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={includeSizes} onChange={(e) => setIncludeSizes(e.target.checked)} />
              <span>Include sizes {sizesCount ? `(${sizesCount})` : ''}</span>
            </label>
          ) : null}
        </div>
      </div>

      <div className="gCard invCard">
        {tab === 'STOCK' && (
          <table className="invTable">
            <thead>
              <tr>
                <th>Product</th>
                <th>Size</th>
                <th>HSN</th>
                <th>GST</th>
                <th className="right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {filteredStock.map((r) => (
                <tr key={r.product.id} className="invRow" onClick={() => openProductDrawer(r.product, r.qtyAvailable)}>
                  <td>
                    <div style={{ fontWeight: 900 }}>{r.product.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--pos-muted)' }}>{r.product.code}</div>
                  </td>
                  <td>{r.product.sizeLabel || 'NO_SIZE'}</td>
                  <td>{r.product.hsnCode}</td>
                  <td>{(r.product.gstRateBp / 100).toFixed(2)}%</td>
                  <td className="right" style={{ fontWeight: 900 }}>
                    <span className={`invQty ${(() => { const v = parseQty(r.qtyAvailable) ?? 0; return v <= 0 ? 'zero' : v <= 2 ? 'low' : 'ok'; })()}`}>
                      {r.qtyAvailable}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredStock.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--pos-muted)' }}>No stock data</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'PRODUCTS' && (
          <table className="invTable">
            <thead>
              <tr>
                <th>Product</th>
                <th>Size</th>
                <th>
                  <button className="invThBtn" onClick={(e) => { e.stopPropagation(); toggleSort('CATEGORY'); }}>
                    Category {prodSort?.key === 'CATEGORY' ? (prodSort.dir === 'ASC' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th>HSN</th>
                <th>
                  <button className="invThBtn" onClick={(e) => { e.stopPropagation(); toggleSort('GST'); }}>
                    GST {prodSort?.key === 'GST' ? (prodSort.dir === 'ASC' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="right">
                  <button className="invThBtn right" onClick={(e) => { e.stopPropagation(); toggleSort('PRICE'); }}>
                    Price (₹) {prodSort?.key === 'PRICE' ? (prodSort.dir === 'ASC' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="right" style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((p) => (
                <tr key={p.id} className="invRow" onClick={() => openProductDrawer(p)}>
                  <td>
                    <div className="invProdCell">
                      <div className="invThumb">
                        <img
                          src={`${apiBaseUrl()}/media/products/${p.id}`}
                          alt=""
                          onError={(e) => {
                            const el = e.currentTarget as HTMLImageElement;
                            if (p.imageUrl && el.src !== p.imageUrl) el.src = p.imageUrl;
                            else el.style.display = 'none';
                          }}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--pos-muted)' }}>{p.code}</div>
                      </div>
                    </div>
                  </td>
                  <td>{p.sizeLabel || 'NO_SIZE'}</td>
                  <td>{p.category?.name || '—'}</td>
                  <td>{p.hsnCode}</td>
                  <td>{(p.gstRateBp / 100).toFixed(2)}%</td>
                  <td className="right" style={{ fontWeight: 900 }}>{paiseToRupeesString(paiseStringToBigInt(p.sellingPricePaise))}</td>
                  <td className="right" onClick={(e) => e.stopPropagation()}>
                    <div className="invMenuWrap">
                      <button
                        className="invKebab"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          menuAnchorElRef.current = e.currentTarget as HTMLElement;
                          setMenuAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
                          setMenuOpen({ id: p.id, kind: 'product' });
                        }}
                      >
                        ⋯
                      </button>
                      {menuOpen?.kind === 'product' && menuOpen.id === p.id && menuAnchor ? (
                        createPortal(
                          <div
                            ref={menuPortalRef}
                            className="invMenu invMenuPortal"
                            style={{
                              top: menuAnchor.top + menuAnchor.height + 8,
                              left: Math.min(menuAnchor.left + menuAnchor.width - 180, window.innerWidth - 180 - 8)
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setMenuAnchor(null); setProdModal({
                            open: true, id: p.id, code: p.code, name: p.name, hsnCode: p.hsnCode, gstRatePercent: (p.gstRateBp / 100).toString(),
                            sellingPriceRupees: paiseToRupeesString(paiseStringToBigInt(p.sellingPricePaise)),
                            categoryId: p.categoryId || ''
                          }); }}>Edit</button>
                            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setMenuAnchor(null); setProdModal({
                            open: true,
                            code: `${p.code}-COPY`,
                            name: p.name,
                            hsnCode: p.hsnCode,
                            gstRatePercent: (p.gstRateBp / 100).toString(),
                            sellingPriceRupees: paiseToRupeesString(paiseStringToBigInt(p.sellingPricePaise)),
                            categoryId: p.categoryId || ''
                          }); }}>Duplicate</button>
                            <button className="danger" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setMenuAnchor(null); setConfirm({ open: true, kind: 'product', id: p.id, label: p.name }); }}>Delete</button>
                          </div>,
                          document.body
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {sortedProducts.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--pos-muted)' }}>No products</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'CATEGORIES' && (
          <div className="invList">
            {categories.length === 0 ? (
              <div className="invEmpty">
                <div className="invEmptyIcon">🗂️</div>
                <div className="invEmptyTitle">No categories yet</div>
                <div className="invEmptySub">Create your first category to organize products</div>
                <button className="gBtn" onClick={() => setCatModal({ open: true, name: '' })}>+ Create Category</button>
              </div>
            ) : (
              categories.map((c) => (
                <div key={c.id} className="invListRow">
                  <div style={{ fontWeight: 900 }}>{c.name}</div>
                  <div style={{ position: 'relative' }}>
                    <button
                      className="invKebab"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        menuAnchorElRef.current = e.currentTarget as HTMLElement;
                        setMenuAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
                        setMenuOpen({ id: c.id, kind: 'category' });
                      }}
                    >
                      ⋯
                    </button>
                    {menuOpen?.kind === 'category' && menuOpen.id === c.id && menuAnchor ? (
                      createPortal(
                        <div
                          ref={menuPortalRef}
                          className="invMenu invMenuPortal"
                          style={{
                            top: menuAnchor.top + menuAnchor.height + 8,
                            left: Math.min(menuAnchor.left + menuAnchor.width - 180, window.innerWidth - 180 - 8)
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setMenuAnchor(null); setCatModal({ open: true, id: c.id, name: c.name }); }}>Edit</button>
                          <button className="danger" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setMenuAnchor(null); setConfirm({ open: true, kind: 'category', id: c.id, label: c.name }); }}>Delete</button>
                        </div>,
                        document.body
                      )
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {drawer.open && drawer.product ? (
        <div className="invDrawerBack" onMouseDown={() => setDrawer({ open: false })}>
          <div className="invDrawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="invDrawerHd">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{drawer.product.name}</div>
                <div style={{ fontSize: 12, color: 'var(--pos-muted)' }}>{drawer.product.code}{drawer.product.sizeLabel && drawer.product.sizeLabel !== 'NO_SIZE' ? ` · ${drawer.product.sizeLabel}` : ''}</div>
              </div>
              <button className="gBtn ghost" onClick={() => setDrawer({ open: false })}>Close</button>
            </div>
            <div className="invDrawerBd">
              {drawer.qtyAvailable !== undefined ? (
                <div className="invDrawerStat">
                  <div className="invStatLabel">Qty Available</div>
                  <div className="invStatValue">{drawer.qtyAvailable}</div>
                </div>
              ) : null}
              <div className="invDrawerGrid">
                <div><div className="invFieldLabel">HSN</div><div className="invFieldVal">{drawer.product.hsnCode}</div></div>
                <div><div className="invFieldLabel">GST</div><div className="invFieldVal">{(drawer.product.gstRateBp / 100).toFixed(2)}%</div></div>
                <div><div className="invFieldLabel">Category</div><div className="invFieldVal">{drawer.product.category?.name || '—'}</div></div>
                <div><div className="invFieldLabel">Price</div><div className="invFieldVal">₹{paiseToRupeesString(paiseStringToBigInt(drawer.product.sellingPricePaise))}</div></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost" onClick={() => setDrawer({ open: false })}>Done</button>
                <button
                  className="gBtn"
                  onClick={() => {
                    const p = drawer.product!;
                    setDrawer({ open: false });
                    setProdModal({
                      open: true,
                      id: p.id,
                      code: p.code,
                      name: p.name,
                      hsnCode: p.hsnCode,
                      gstRatePercent: (p.gstRateBp / 100).toString(),
                      sellingPriceRupees: paiseToRupeesString(paiseStringToBigInt(p.sellingPricePaise)),
                      categoryId: p.categoryId || ''
                    });
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {confirm.open ? (
        <div className="gModalBack" onMouseDown={() => setConfirm({ open: false, kind: confirm.kind })}>
          <div className="gModal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Confirm delete</div>
              <button className="gBtn ghost" onClick={() => setConfirm({ open: false, kind: confirm.kind })}>Close</button>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>Delete "{confirm.label || 'item'}"?</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost" onClick={() => setConfirm({ open: false, kind: confirm.kind })}>Cancel</button>
                <button
                  className="gBtn danger"
                  onClick={async () => {
                    const id = confirm.id;
                    const kind = confirm.kind;
                    setConfirm({ open: false, kind });
                    if (!id) return;
                    if (kind === 'product') await deleteProduct(id);
                    else await deleteCategory(id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {catModal.open && (
        <div className="gModalBack" onClick={() => setCatModal({ open: false, name: '' })}>
          <div className="gModal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>{catModal.id ? 'Edit Category' : 'New Category'}</div>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gField">
                <label>Name</label>
                <input value={catModal.name} onChange={(e) => setCatModal({ ...catModal, name: e.target.value })} />
              </div>
              <div className="gRow" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="gBtn ghost" onClick={() => setCatModal({ open: false, name: '' })}>Cancel</button>
                <button className="gBtn" onClick={saveCategory}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {prodModal.open && (
        <div className="gModalBack" onClick={() => setProdModal({ ...prodModal, open: false })}>
          <div className="gModal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>{prodModal.id ? 'Edit Product' : 'New Product'}</div>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gGrid2">
                <div className="gField">
                  <label>Code (e.g. ABC-1234)</label>
                  <input value={prodModal.code} onChange={(e) => setProdModal({ ...prodModal, code: e.target.value.toUpperCase() })} disabled={!!prodModal.id} />
                </div>
                <div className="gField">
                  <label>Name</label>
                  <input value={prodModal.name} onChange={(e) => setProdModal({ ...prodModal, name: e.target.value })} />
                </div>
                <div className="gField">
                  <label>HSN Code</label>
                  <input value={prodModal.hsnCode} onChange={(e) => setProdModal({ ...prodModal, hsnCode: e.target.value })} />
                </div>
                <div className="gField">
                  <label>GST Rate %</label>
                  <input type="number" value={prodModal.gstRatePercent} onChange={(e) => setProdModal({ ...prodModal, gstRatePercent: e.target.value })} />
                </div>
                <div className="gField">
                  <label>Selling Price (₹)</label>
                  <input type="number" value={prodModal.sellingPriceRupees} onChange={(e) => setProdModal({ ...prodModal, sellingPriceRupees: e.target.value })} />
                </div>
                <div className="gField" style={{ gridColumn: '1 / -1' }}>
                  <label>Category</label>
                  <select value={prodModal.categoryId} onChange={(e) => setProdModal({ ...prodModal, categoryId: e.target.value })}>
                    <option value="">None</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="gRow" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="gBtn ghost" onClick={() => setProdModal({ ...prodModal, open: false })}>Cancel</button>
                <button className="gBtn" onClick={saveProduct}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
