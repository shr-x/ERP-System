import { useEffect, useMemo, useState } from 'react';
import { apiBaseUrl, apiFetch } from '../lib/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StBadge, StButton, StCard, StEmpty, StInput, StLabel, StModal, StSelect } from '../components/stitching/AdminUi';

type TemplateCategory = 'FULL_SET' | 'TOP' | 'PANTS' | 'SLEEVES';
type StitchingCategory = { id: string; name: string; posVisible: boolean };

const presetCategories: TemplateCategory[] = ['FULL_SET', 'TOP', 'PANTS', 'SLEEVES'];

function presetKey(c: TemplateCategory) {
  return `PRESET:${c}`;
}

function customKey(id: string) {
  return `CUSTOM:${id}`;
}

function parseCategoryKey(key: string): { category: TemplateCategory; categoryId: string | null } {
  const v = (key || '').trim();
  if (v.startsWith('CUSTOM:')) {
    const id = v.slice('CUSTOM:'.length).trim();
    return { category: 'FULL_SET', categoryId: id || null };
  }
  if (v.startsWith('PRESET:')) {
    const raw = v.slice('PRESET:'.length).trim() as TemplateCategory;
    const category = presetCategories.includes(raw) ? raw : 'FULL_SET';
    return { category, categoryId: null };
  }
  return { category: 'FULL_SET', categoryId: null };
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

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function portalFetch<T>(args: { portalKey: string; path: string; init?: RequestInit }): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-shrx-portal-key': args.portalKey.trim(),
    ...(args.init?.headers ? (args.init.headers as any) : {})
  };

  if (args.init?.body && !headers['Content-Type']) {
    const body: any = args.init.body as any;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isFormData) headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${apiBaseUrl()}${args.path}`, { ...args.init, headers });
  if (res.ok) return (await parseJsonSafe(res)) as T;
  const body = await parseJsonSafe(res);
  throw { status: res.status, message: coerceErrorMessage(body, res.status), details: body };
}

type MeasurementProfile = { id: string; measurementName: string; fields: string[] };
type Color = { id: string; colorName: string; colorCode: string; imageUrl?: string | null };
type MaterialConfig = { id: string; erpMaterialId: string; metersRequired: string };

type ProductTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  categoryId?: string | null;
  categoryRef?: StitchingCategory | null;
  measurementProfiles: MeasurementProfile[];
  colors: Color[];
  materialConfigs: MaterialConfig[];
};

type MaterialRow = { id: string; code: string; name: string; qtyAvailableMeters: string; imageUrl?: string | null };

function errorMessage(e: unknown, fallback: string) {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  if (e && typeof e === 'object' && 'status' in e && 'message' in e) {
    const s = (e as any).status;
    const m = (e as any).message;
    if (typeof s === 'number' && typeof m === 'string' && m.trim()) return `HTTP ${s}: ${m}`;
  }
  return fallback;
}

function isHexColor(v: string) {
  return /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

function resolveImageUrl(url?: string | null) {
  const u = (url || '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/')) return `${apiBaseUrl()}${u}`;
  return u;
}

function templateCategoryLabel(p: ProductTemplate) {
  return p.categoryRef?.name || p.category;
}

function templateCategoryKey(p: ProductTemplate) {
  return p.categoryRef?.id ? customKey(p.categoryRef.id) : presetKey(p.category);
}

function firstImage(p: ProductTemplate | null) {
  const url = p?.colors?.[0]?.imageUrl || '';
  return resolveImageUrl(typeof url === 'string' ? url : '');
}

function ProductsModal({
  open,
  onClose,
  onChanged,
  seedSelectedId,
  mode,
  portalKey,
  orgId,
  storeId
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  seedSelectedId?: string | null;
  mode: 'BACKOFFICE' | 'PORTAL';
  portalKey?: string;
  orgId?: string;
  storeId?: string;
}) {
  const templatesBase = mode === 'PORTAL' ? '/portal/stitching/templates' : '/stitching/products';
  const materialsBase = mode === 'PORTAL' ? '/portal/materials' : '/erp/materials';
  const categoriesBase = mode === 'PORTAL' ? '/portal/stitching/categories' : '/stitching/products/categories';

  async function fetcher<T>(path: string, init?: RequestInit) {
    if (mode !== 'PORTAL') return apiFetch<T>(path, init);
    const key = (portalKey || '').trim();
    if (!key) throw { status: 403, message: 'Portal key missing' };
    return portalFetch<T>({ portalKey: key, path, init });
  }

  function withOrg(path: string) {
    if (mode !== 'PORTAL') return path;
    const oid = (orgId || '').trim();
    if (!oid) throw new Error('orgId is required');
    const join = path.includes('?') ? '&' : '?';
    return `${path}${join}orgId=${encodeURIComponent(oid)}`;
  }

  function withOrgAndStore(path: string) {
    if (mode !== 'PORTAL') return path;
    const oid = (orgId || '').trim();
    if (!oid) throw new Error('orgId is required');
    const sid = (storeId || '').trim();
    const join = path.includes('?') ? '&' : '?';
    const extra = sid ? `&storeId=${encodeURIComponent(sid)}` : '';
    return `${path}${join}orgId=${encodeURIComponent(oid)}${extra}`;
  }

  const [q, setQ] = useState('');
  const [products, setProducts] = useState<ProductTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selected, setSelected] = useState<ProductTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stitchingCategories, setStitchingCategories] = useState<StitchingCategory[]>([]);
  const [createCategoryName, setCreateCategoryName] = useState('');
  const [editCategoryName, setEditCategoryName] = useState('');

  useEffect(() => {
    if (!open) return;
    const seed = (seedSelectedId || '').trim();
    if (!seed) return;
    setSelectedId(seed);
  }, [open, seedSelectedId]);

  const [base, setBase] = useState<{ name: string; categoryKey: string }>({ name: '', categoryKey: presetKey('TOP') });
  const [create, setCreate] = useState<{ name: string; categoryKey: string }>({ name: '', categoryKey: presetKey('TOP') });
  const [newProfile, setNewProfile] = useState<{ measurementName: string; fieldsCsv: string }>({ measurementName: '', fieldsCsv: '' });
  const [newColor, setNewColor] = useState<{ colorName: string; colorCode: string; imageUrl: string }>({
    colorName: '',
    colorCode: '#000000',
    imageUrl: ''
  });
  const [newColorFile, setNewColorFile] = useState<File | null>(null);

  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
  const [materialPickQ, setMaterialPickQ] = useState('');
  const [materialPickResults, setMaterialPickResults] = useState<MaterialRow[]>([]);
  const [newMaterial, setNewMaterial] = useState<{ erpMaterialId: string; metersRequired: string }>({ erpMaterialId: '', metersRequired: '' });

  async function loadStitchingCategories() {
    const res = await fetcher<{ categories: StitchingCategory[] }>(withOrg(categoriesBase));
    setStitchingCategories(res.categories || []);
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        await loadStitchingCategories();
      } catch (e: unknown) {
        if (!active) return;
        setStitchingCategories([]);
        setError(errorMessage(e, 'Failed to load categories'));
      }
    })();
    return () => { active = false; };
  }, [open, mode, orgId, portalKey]);

  async function deleteStitchingCategory(target: 'create' | 'base') {
    if (mode !== 'PORTAL') return;
    const key = target === 'create' ? create.categoryKey : base.categoryKey;
    const { categoryId } = parseCategoryKey(key);
    if (!categoryId) return;
    if (!confirm('Delete this category?')) return;
    setBusy(true);
    setError(null);
    try {
      await fetcher(withOrg(`${categoriesBase}/${categoryId}`), { method: 'DELETE' });
      await loadStitchingCategories();
      if (target === 'create') setCreate((prev) => ({ ...prev, categoryKey: presetKey('TOP') }));
      else setBase((prev) => ({ ...prev, categoryKey: presetKey('TOP') }));
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to delete category'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        setError(null);
        const res = await fetcher<any>(withOrg(`${templatesBase}?q=${encodeURIComponent(q.trim())}&page=1&pageSize=100`));
        if (!active) return;
        const templates = res.templates || [];
        setProducts(templates);
        const id = selectedId || templates?.[0]?.id || '';
        if (id) setSelectedId(id);
      } catch (e: unknown) {
        if (!active) return;
        setError(errorMessage(e, 'Failed to load products'));
      }
    })();
    return () => { active = false; };
  }, [open, q]);

  async function reloadList() {
    const res = await fetcher<any>(withOrg(`${templatesBase}?q=${encodeURIComponent(q.trim())}&page=1&pageSize=100`));
    const templates = res.templates || [];
    setProducts(templates);
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      if (!selectedId) { setSelected(null); return; }
      try {
        setError(null);
        const res = await fetcher<{ template: ProductTemplate }>(withOrg(`${templatesBase}/${selectedId}`));
        if (!active) return;
        setSelected(res.template);
        setBase({ name: res.template.name, categoryKey: templateCategoryKey(res.template) });
      } catch (e: unknown) {
        if (!active) return;
        setSelected(null);
        setError(errorMessage(e, 'Failed to load product'));
      }
    })();
    return () => { active = false; };
  }, [open, selectedId]);

  useEffect(() => {
    if (!open) return;
    if (!selected?.materialConfigs?.length) { setMaterialRows([]); return; }
    const ids = selected.materialConfigs.map((x) => x.erpMaterialId).filter(Boolean);
    if (!ids.length) { setMaterialRows([]); return; }
    let active = true;
    (async () => {
      try {
        const res = await fetcher<{ materials: MaterialRow[] }>(
          withOrgAndStore(`${materialsBase}/by-ids?ids=${encodeURIComponent(ids.join(','))}`)
        );
        if (!active) return;
        setMaterialRows(res.materials || []);
      } catch {
        if (!active) return;
        setMaterialRows([]);
      }
    })();
    return () => { active = false; };
  }, [open, selected?.id]);

  const selectableMaterials = useMemo(() => {
    const v = materialPickQ.trim().toLowerCase();
    if (!v) return materialPickResults;
    return materialPickResults.filter((m) => `${m.name} ${m.code}`.toLowerCase().includes(v));
  }, [materialPickResults, materialPickQ]);

  async function searchErpMaterials() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetcher<{ materials: MaterialRow[] }>(
        withOrgAndStore(`${materialsBase}?q=${encodeURIComponent(materialPickQ.trim())}&page=1&pageSize=30`)
      );
      setMaterialPickResults(res.materials || []);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to load materials'));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSelected(nextId?: string) {
    const id = nextId || selectedId;
    if (!id) return;
    const res = await fetcher<{ template: ProductTemplate }>(withOrg(`${templatesBase}/${id}`));
    setSelected(res.template);
    setBase({ name: res.template.name, categoryKey: templateCategoryKey(res.template) });
    setEditCategoryName('');
    onChanged();
  }

  async function addStitchingCategory(target: 'create' | 'base') {
    const raw = target === 'create' ? createCategoryName : editCategoryName;
    const name = raw.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetcher<{ category: StitchingCategory }>(withOrg(categoriesBase), {
        method: 'POST',
        body: JSON.stringify({ name, posVisible: true })
      });
      await loadStitchingCategories();
      const key = customKey(res.category.id);
      if (target === 'create') {
        setCreate((prev) => ({ ...prev, categoryKey: key }));
        setCreateCategoryName('');
      } else {
        setBase((prev) => ({ ...prev, categoryKey: key }));
        setEditCategoryName('');
      }
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to create category'));
    } finally {
      setBusy(false);
    }
  }

  async function createProduct() {
    setBusy(true);
    setError(null);
    try {
      const name = create.name.trim();
      if (name.length < 2) throw new Error('Enter product name');
      const { category, categoryId } = parseCategoryKey(create.categoryKey);
      const res = await fetcher<{ template: ProductTemplate }>(withOrg(templatesBase), {
        method: 'POST',
        body: JSON.stringify({ name, category, categoryId })
      });
      setCreate({ name: '', categoryKey: create.categoryKey });
      setCreateCategoryName('');
      setSelectedId(res.template.id);
      await reloadList();
      onChanged();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to create product'));
    } finally {
      setBusy(false);
    }
  }

  async function saveBase() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const name = base.name.trim();
      if (name.length < 2) throw new Error('Enter product name');
      const { category, categoryId } = parseCategoryKey(base.categoryKey);
      await fetcher(withOrg(`${templatesBase}/${selectedId}`), {
        method: 'PATCH',
        body: JSON.stringify({ name, category, categoryId })
      });
      await refreshSelected();
      await reloadList();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to save product'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct() {
    if (!selectedId) return;
    if (!confirm('Delete this product?')) return;
    setBusy(true);
    setError(null);
    try {
      await fetcher(withOrg(`${templatesBase}/${selectedId}`), { method: 'DELETE' });
      setSelectedId('');
      setSelected(null);
      await reloadList();
      onChanged();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to delete product'));
    } finally {
      setBusy(false);
    }
  }

  async function addProfile() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const measurementName = newProfile.measurementName.trim();
      const fields = newProfile.fieldsCsv.split(',').map((x) => x.trim()).filter(Boolean);
      if (!measurementName) throw new Error('Enter profile name');
      if (!fields.length) throw new Error('Add at least one field');
      await fetcher(withOrg(`${templatesBase}/${selectedId}/measurement-profiles`), {
        method: 'POST',
        body: JSON.stringify({ measurementName, fields })
      });
      setNewProfile({ measurementName: '', fieldsCsv: '' });
      await refreshSelected();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to add measurement profile'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile(profileId: string) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await fetcher(withOrg(`${templatesBase}/${selectedId}/measurement-profiles/${profileId}`), { method: 'DELETE' });
      await refreshSelected();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to delete measurement profile'));
    } finally {
      setBusy(false);
    }
  }

  async function addColor() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const colorName = newColor.colorName.trim();
      const colorCode = newColor.colorCode.trim();
      const imageUrl = newColor.imageUrl.trim();
      if (!colorName) throw new Error('Enter color name');
      if (!isHexColor(colorCode)) throw new Error('Invalid color code');
      if (!imageUrl && !newColorFile) throw new Error('Add image URL or upload file');
      const created = await fetcher<{ color: { id: string } }>(withOrg(`${templatesBase}/${selectedId}/colors`), {
        method: 'POST',
        body: JSON.stringify({ colorName, colorCode, imageUrl: imageUrl || undefined })
      });
      if (newColorFile) {
        const form = new FormData();
        form.append('file', newColorFile);
        await fetcher(withOrg(`${templatesBase}/${selectedId}/colors/${created.color.id}/image`), { method: 'POST', body: form });
      }
      setNewColor({ colorName: '', colorCode: '#000000', imageUrl: '' });
      setNewColorFile(null);
      await refreshSelected();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to add color'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteColor(colorId: string) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await fetcher(withOrg(`${templatesBase}/${selectedId}/colors/${colorId}`), { method: 'DELETE' });
      await refreshSelected();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to delete color'));
    } finally {
      setBusy(false);
    }
  }

  async function addMaterialConfig() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const erpMaterialId = newMaterial.erpMaterialId.trim();
      const metersRequired = Number(newMaterial.metersRequired);
      if (!erpMaterialId) throw new Error('Select material');
      if (!Number.isFinite(metersRequired) || metersRequired <= 0) throw new Error('Invalid meters');
      await fetcher(withOrg(`${templatesBase}/${selectedId}/material-configs`), {
        method: 'POST',
        body: JSON.stringify({ erpMaterialId, metersRequired })
      });
      setNewMaterial({ erpMaterialId: '', metersRequired: '' });
      await refreshSelected();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to add material config'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteMaterialConfig(configId: string) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await fetcher(withOrg(`${templatesBase}/${selectedId}/material-configs/${configId}`), { method: 'DELETE' });
      await refreshSelected();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to delete material config'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <StModal
      open={open}
      title="Manage Products"
      onClose={() => !busy && onClose()}
      width="xl"
      footer={
        <div className="tw-flex tw-justify-between tw-gap-2">
          {error ? <div className="tw-text-[12px] tw-text-red-700">{error}</div> : <div />}
          <div className="tw-flex tw-items-center tw-gap-2">
            <StButton variant="secondary" onClick={saveBase} disabled={busy || !selectedId} type="button">Save</StButton>
            <StButton variant="danger" onClick={deleteProduct} disabled={busy || !selectedId} type="button">Delete</StButton>
          </div>
        </div>
      }
    >
      <div className="tw-grid tw-grid-cols-12 tw-gap-6">
        <div className="tw-col-span-12 lg:tw-col-span-4">
          <StCard title="Products">
            <div>
              <StLabel>Search</StLabel>
              <StInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" />
            </div>

            <div className="tw-mt-4 tw-rounded-card tw-border tw-border-line tw-bg-bg tw-p-4">
              <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                <div className="tw-col-span-12">
                  <StLabel>Name</StLabel>
                  <StInput value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} placeholder="e.g. Kurti Stitching" />
                </div>
                <div className="tw-col-span-8">
                  <StLabel>Category</StLabel>
                    <StSelect value={create.categoryKey} onChange={(e) => setCreate({ ...create, categoryKey: e.target.value })}>
                      {presetCategories.map((c) => (
                        <option key={c} value={presetKey(c)}>{c}</option>
                      ))}
                      {stitchingCategories.map((c) => (
                        <option key={c.id} value={customKey(c.id)}>
                          {c.name}{c.posVisible ? '' : ' (Hidden)'}
                        </option>
                      ))}
                  </StSelect>
                    {mode === 'PORTAL' ? (
                      <div className="tw-mt-2 tw-grid tw-grid-cols-12 tw-gap-2">

                      </div>
                    ) : null}
                </div>
                <div className="tw-col-span-4 tw-flex tw-items-end">
                  <StButton variant="primary" onClick={createProduct} disabled={busy || create.name.trim().length < 2} type="button" className="tw-w-full">
                    Add
                  </StButton>
                </div>
              </div>
            </div>

            <div className="tw-mt-4 tw-max-h-[calc(100vh-320px)] tw-overflow-auto tw-rounded-card tw-border tw-border-line">
              {(products || []).map((p) => {
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    className={[
                      'tw-w-full tw-text-left tw-px-4 tw-py-3 tw-border-b tw-border-line hover:tw-bg-slate-50 tw-transition',
                      active ? 'tw-bg-accent' : ''
                    ].join(' ')}
                    onClick={() => setSelectedId(p.id)}
                    type="button"
                  >
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                      <div className="tw-font-medium tw-text-ink">{p.name}</div>
                      <StBadge tone="neutral">{templateCategoryLabel(p)}</StBadge>
                    </div>
                  </button>
                );
              })}
              {(products || []).length === 0 ? <div className="tw-p-6"><StEmpty title="No products" subtitle="Create one to start taking orders" /></div> : null}
            </div>
          </StCard>
        </div>

        <div className="tw-col-span-12 lg:tw-col-span-8">
          {!selected ? (
            <StEmpty title="Select a product" subtitle="Pick a product from the list to edit details" />
          ) : (
            <div className="tw-space-y-6">
              <StCard title="Basic Info">
                <div className="tw-grid tw-grid-cols-12 tw-gap-4">
                  <div className="tw-col-span-12 md:tw-col-span-7">
                    <StLabel>Name</StLabel>
                    <StInput value={base.name} onChange={(e) => setBase({ ...base, name: e.target.value })} />
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-5">
                    <StLabel>Category</StLabel>
                    <StSelect value={base.categoryKey} onChange={(e) => setBase({ ...base, categoryKey: e.target.value })}>
                      {presetCategories.map((c) => (
                        <option key={c} value={presetKey(c)}>{c}</option>
                      ))}
                      {stitchingCategories.map((c) => (
                        <option key={c.id} value={customKey(c.id)}>
                          {c.name}{c.posVisible ? '' : ' (Hidden)'}
                        </option>
                      ))}
                    </StSelect>
                    {mode === 'PORTAL' ? (
                      <div className="tw-mt-2 tw-grid tw-grid-cols-12 tw-gap-2">
                        <div className="tw-col-span-12 md:tw-col-span-6">
                          <StInput value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)} placeholder="Add new category (optional)" />
                        </div>
                        <div className="tw-col-span-12 md:tw-col-span-4">
                          <StButton
                            variant="secondary"
                            onClick={() => void addStitchingCategory('base')}
                            disabled={busy || !editCategoryName.trim()}
                            type="button"
                            className="tw-w-full"
                          >
                            Add Category
                          </StButton>
                        </div>
                        <div className="tw-col-span-12 md:tw-col-span-2">
                          <StButton
                            variant="danger"
                            onClick={() => void deleteStitchingCategory('base')}
                            disabled={busy || !parseCategoryKey(base.categoryKey).categoryId}
                            type="button"
                            className="tw-w-full"
                          >
                            Delete
                          </StButton>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </StCard>

              <StCard title="Measurement Builder">
                <div className="tw-grid tw-grid-cols-12 tw-gap-3">
                  <div className="tw-col-span-12 md:tw-col-span-4">
                    <StLabel>Profile Name</StLabel>
                    <StInput value={newProfile.measurementName} onChange={(e) => setNewProfile({ ...newProfile, measurementName: e.target.value })} placeholder="e.g. Regular" />
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-8">
                    <StLabel>Fields (comma separated)</StLabel>
                    <StInput value={newProfile.fieldsCsv} onChange={(e) => setNewProfile({ ...newProfile, fieldsCsv: e.target.value })} placeholder="chest, shoulder, length" />
                  </div>
                </div>
                <div className="tw-mt-3 tw-flex tw-justify-end">
                  <StButton variant="secondary" onClick={addProfile} disabled={busy} type="button">Add Profile</StButton>
                </div>

                <div className="tw-mt-4 tw-overflow-auto tw-rounded-card tw-border tw-border-line">
                  <table className="tw-w-full tw-text-left tw-text-[14px]">
                    <thead className="tw-bg-bg">
                      <tr className="tw-text-[12px] tw-text-muted">
                        <th className="tw-px-4 tw-py-3">Name</th>
                        <th className="tw-px-4 tw-py-3">Fields</th>
                        <th className="tw-px-4 tw-py-3 tw-text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.measurementProfiles.map((p) => (
                        <tr key={p.id} className="hover:tw-bg-slate-50">
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-font-medium tw-text-ink">{p.measurementName}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{p.fields.join(', ')}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-right">
                            <StButton variant="ghost" onClick={() => deleteProfile(p.id)} disabled={busy} type="button" className="tw-text-red-700 hover:tw-bg-red-50">
                              Delete
                            </StButton>
                          </td>
                        </tr>
                      ))}
                      {selected.measurementProfiles.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="tw-border-t tw-border-line tw-px-4 tw-py-10 tw-text-center tw-text-[12px] tw-text-muted">
                            No profiles
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </StCard>

              <StCard title="Colors">
                <div className="tw-grid tw-grid-cols-12 tw-gap-3 tw-items-end">
                  <div className="tw-col-span-12 md:tw-col-span-3">
                    <StLabel>Palette</StLabel>
                    <input
                      type="color"
                      value={isHexColor(newColor.colorCode) ? newColor.colorCode : '#000000'}
                      onChange={(e) => setNewColor({ ...newColor, colorCode: e.target.value })}
                      className="tw-h-10 tw-w-full tw-rounded-control tw-border tw-border-line tw-bg-white"
                    />
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-3">
                    <StLabel>Name</StLabel>
                    <StInput value={newColor.colorName} onChange={(e) => setNewColor({ ...newColor, colorName: e.target.value })} placeholder="e.g. Wine Red" />
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-4">
                    <StLabel>Image URL (optional)</StLabel>
                    <StInput value={newColor.imageUrl} onChange={(e) => setNewColor({ ...newColor, imageUrl: e.target.value })} placeholder="Paste URL or upload file" />
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-2">
                    <StLabel>Upload (optional)</StLabel>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setNewColorFile(f);
                      }}
                      className="tw-block tw-w-full tw-text-[12px] tw-text-muted"
                    />
                  </div>
                </div>
                {newColorFile ? <div className="tw-mt-2 tw-text-[12px] tw-text-muted">Selected file: {newColorFile.name}</div> : null}
                <div className="tw-mt-3 tw-flex tw-justify-end">
                  <StButton variant="secondary" onClick={addColor} disabled={busy} type="button">Add Color</StButton>
                </div>

                <div className="tw-mt-4 tw-overflow-auto tw-rounded-card tw-border tw-border-line">
                  <table className="tw-w-full tw-text-left tw-text-[14px]">
                    <thead className="tw-bg-bg">
                      <tr className="tw-text-[12px] tw-text-muted">
                        <th className="tw-px-4 tw-py-3">Color</th>
                        <th className="tw-px-4 tw-py-3">Image</th>
                        <th className="tw-px-4 tw-py-3 tw-text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.colors.map((c) => (
                        <tr key={c.id} className="hover:tw-bg-slate-50">
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3">
                            <div className="tw-flex tw-items-center tw-gap-2">
                              <span className="tw-inline-block tw-h-4 tw-w-4 tw-rounded-md tw-border tw-border-line" style={{ background: c.colorCode }} />
                              <span className="tw-font-medium tw-text-ink">{c.colorName}</span>
                              <span className="tw-text-[12px] tw-text-muted">{c.colorCode}</span>
                            </div>
                          </td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3">
                            {resolveImageUrl(c.imageUrl) ? (
                              <div className="tw-flex tw-items-center tw-gap-3">
                                <img
                                  src={resolveImageUrl(c.imageUrl)}
                                  alt={c.colorCode}
                                  className="tw-h-14 tw-w-14 tw-rounded-control tw-border tw-border-line tw-object-cover"
                                />
                                <div className="tw-max-w-[380px] tw-truncate tw-text-[12px] tw-text-muted">{c.imageUrl}</div>
                              </div>
                            ) : (
                              <div className="tw-text-[12px] tw-text-muted">—</div>
                            )}
                          </td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-right">
                            <StButton variant="ghost" onClick={() => deleteColor(c.id)} disabled={busy} type="button" className="tw-text-red-700 hover:tw-bg-red-50">
                              Delete
                            </StButton>
                          </td>
                        </tr>
                      ))}
                      {selected.colors.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="tw-border-t tw-border-line tw-px-4 tw-py-10 tw-text-center tw-text-[12px] tw-text-muted">
                            No colors
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </StCard>

              <StCard title="Dress Materials (ERP)">
                <div className="tw-grid tw-grid-cols-12 tw-gap-3 tw-items-end">
                  <div className="tw-col-span-12 md:tw-col-span-8">
                    <StLabel>Search ERP Materials</StLabel>
                    <StInput value={materialPickQ} onChange={(e) => setMaterialPickQ(e.target.value)} placeholder="Search by name/code" />
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-4">
                    <StButton variant="secondary" onClick={searchErpMaterials} disabled={busy} type="button" className="tw-w-full">
                      Search
                    </StButton>
                  </div>
                </div>

                <div className="tw-mt-4 tw-grid tw-grid-cols-12 tw-gap-3 tw-items-end">
                  <div className="tw-col-span-12 md:tw-col-span-8">
                    <StLabel>ERP Material</StLabel>
                    <StSelect value={newMaterial.erpMaterialId} onChange={(e) => setNewMaterial({ ...newMaterial, erpMaterialId: e.target.value })}>
                      <option value="">Select</option>
                      {selectableMaterials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.code}) · {m.qtyAvailableMeters}m
                        </option>
                      ))}
                    </StSelect>
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-4">
                    <StLabel>Meters Required</StLabel>
                    <StInput value={newMaterial.metersRequired} onChange={(e) => setNewMaterial({ ...newMaterial, metersRequired: e.target.value })} placeholder="e.g. 2.5" />
                  </div>
                </div>

                <div className="tw-mt-3 tw-flex tw-justify-end">
                  <StButton variant="secondary" onClick={addMaterialConfig} disabled={busy} type="button">Add Material</StButton>
                </div>

                <div className="tw-mt-4 tw-overflow-auto tw-rounded-card tw-border tw-border-line">
                  <table className="tw-w-full tw-text-left tw-text-[14px]">
                    <thead className="tw-bg-bg">
                      <tr className="tw-text-[12px] tw-text-muted">
                        <th className="tw-px-4 tw-py-3">ERP Material</th>
                        <th className="tw-px-4 tw-py-3 tw-text-right">Meters</th>
                        <th className="tw-px-4 tw-py-3 tw-text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.materialConfigs.map((mc) => (
                        <tr key={mc.id} className="hover:tw-bg-slate-50">
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">
                            {(() => {
                              const m = materialRows.find((x) => x.id === mc.erpMaterialId) || null;
                              if (!m) return mc.erpMaterialId;
                              return `${m.name} (${m.code})`;
                            })()}
                          </td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-right tw-text-ink">{mc.metersRequired}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-right">
                            <StButton variant="ghost" onClick={() => deleteMaterialConfig(mc.id)} disabled={busy} type="button" className="tw-text-red-700 hover:tw-bg-red-50">
                              Delete
                            </StButton>
                          </td>
                        </tr>
                      ))}
                      {selected.materialConfigs.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="tw-border-t tw-border-line tw-px-4 tw-py-10 tw-text-center tw-text-[12px] tw-text-muted">
                            No materials
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </StCard>
            </div>
          )}
        </div>
      </div>
    </StModal>
  );
}

export function BackofficeStitchingProductsPage(props?: {
  mode?: 'BACKOFFICE' | 'PORTAL';
  portalKey?: string;
  orgId?: string;
  storeId?: string;
}) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const manageSeed = sp.get('manageProducts') === '1';
  const mode = props?.mode ?? 'BACKOFFICE';

  const [products, setProducts] = useState<ProductTemplate[]>([]);
  const [productsQ, setProductsQ] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [manageOpen, setManageOpen] = useState(false);
  const [seedSelectedId, setSeedSelectedId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>('');

  useEffect(() => {
    if (manageSeed) setManageOpen(true);
  }, [manageSeed]);

  async function loadProducts() {
    if (mode !== 'PORTAL') {
      const res = await apiFetch<{ templates: ProductTemplate[] }>('/pos/stitching/templates');
      setProducts(res.templates || []);
      return;
    }

    const key = (props?.portalKey || '').trim();
    const orgId = (props?.orgId || '').trim();
    if (!key) throw new Error('Portal key missing');
    if (!orgId) throw new Error('orgId is required');
    const res = await portalFetch<{ templates: ProductTemplate[] }>({
      portalKey: key,
      path: `/portal/stitching/templates?orgId=${encodeURIComponent(orgId)}&q=&page=1&pageSize=200`
    });
    setProducts(res.templates || []);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        await loadProducts();
      } catch (e: unknown) {
        if (!active) return;
        setError(errorMessage(e, 'Failed to load page'));
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const filteredProducts = useMemo(() => {
    const v = productsQ.trim().toLowerCase();
    if (!v) return products;
    return (products || []).filter((p) => `${p.name} ${templateCategoryLabel(p)}`.toLowerCase().includes(v));
  }, [products, productsQ]);

  return (
    <div className="tw-mx-auto tw-max-w-[1280px] tw-px-6 tw-py-6 tw-space-y-6">
      {error ? <div className="tw-rounded-control tw-border tw-border-red-200 tw-bg-red-50 tw-p-3 tw-text-[14px] tw-text-red-800">{error}</div> : null}

      <StCard
        title="Products"
        right={
          <StButton
            variant="secondary"
            onClick={() => {
              setSeedSelectedId(null);
              setManageOpen(true);
            }}
            disabled={loading}
            type="button"
          >
            Manage Products
          </StButton>
        }
      >
        <div>
          <StLabel>Search</StLabel>
          <StInput value={productsQ} onChange={(e) => setProductsQ(e.target.value)} placeholder="Name / category" />
        </div>

        <div className="tw-mt-5 tw-grid tw-grid-cols-2 sm:tw-grid-cols-3 tw-gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="tw-animate-pulse tw-rounded-card tw-border tw-border-line tw-bg-white tw-overflow-hidden">
                <div className="tw-h-[120px] tw-bg-slate-100" />
                <div className="tw-p-4">
                  <div className="tw-h-4 tw-w-28 tw-rounded tw-bg-slate-100" />
                  <div className="tw-mt-2 tw-h-3 tw-w-16 tw-rounded tw-bg-slate-100" />
                </div>
              </div>
            ))
          ) : (
            filteredProducts.map((p) => {
              const active = p.id === selectedCardId;
              const img = firstImage(p);
              return (
                <button
                  key={p.id}
                  className={[
                    'tw-text-left tw-rounded-card tw-border tw-bg-white tw-shadow-soft tw-overflow-hidden tw-transition hover:tw-translate-y-[-1px]',
                    active ? 'tw-border-slate-400' : 'tw-border-line'
                  ].join(' ')}
                  onClick={() => {
                    setSelectedCardId(p.id);
                    setSeedSelectedId(p.id);
                    setManageOpen(true);
                  }}
                  type="button"
                >
                  <div className="tw-h-[130px] tw-bg-bg tw-flex tw-items-center tw-justify-center tw-overflow-hidden">
                    {img ? <img src={img} alt={p.name} className="tw-h-full tw-w-full tw-object-cover" /> : <div className="tw-h-10 tw-w-10 tw-rounded-full tw-border tw-border-line tw-bg-white" />}
                  </div>
                  <div className="tw-p-4">
                    <div className="tw-font-medium tw-text-ink tw-truncate">{p.name}</div>
                    <div className="tw-mt-1"><StBadge tone="neutral">{templateCategoryLabel(p)}</StBadge></div>
                  </div>
                </button>
              );
            })
          )}
          {!loading && filteredProducts.length === 0 ? (
            <div className="tw-col-span-full">
              <StEmpty title="No products found" subtitle="Try a different search or add a product" />
            </div>
          ) : null}
        </div>
      </StCard>

      <ProductsModal
        open={manageOpen}
        onClose={() => {
          setManageOpen(false);
          setSeedSelectedId(null);
          if (mode !== 'PORTAL') nav('/backoffice/stitching/new');
        }}
        onChanged={() => void loadProducts()}
        seedSelectedId={seedSelectedId}
        mode={mode}
        portalKey={props?.portalKey}
        orgId={props?.orgId}
        storeId={props?.storeId}
      />
    </div>
  );
}
