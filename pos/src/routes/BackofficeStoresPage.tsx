import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';

type Store = { id: string; code: string; name: string; address: string; phone?: string | null; gstin?: string | null; stateCode: string; footerNote?: string | null; isActive?: boolean };
type Warehouse = { id: string; name: string };

export function BackofficeStoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const store = useMemo(() => stores.find((s) => s.id === storeId) || null, [stores, storeId]);

  const [createStoreOpen, setCreateStoreOpen] = useState(false);
  const [newStore, setNewStore] = useState({ code: '', name: '', address: '', stateCode: '' });

  const [editStore, setEditStore] = useState({ name: '', address: '', phone: '', gstin: '', footerNote: '' });

  const [newWarehouseName, setNewWarehouseName] = useState('');

  async function loadStores() {
    const res = await apiFetch<{ stores: Store[] }>('/stores');
    setStores(res.stores);
    setStoreId((prev) => prev || res.stores[0]?.id || '');
  }

  async function loadWarehouses(nextStoreId: string) {
    if (!nextStoreId) {
      setWarehouses([]);
      return;
    }
    const res = await apiFetch<{ warehouses: Warehouse[] }>(`/warehouses?storeId=${nextStoreId}`);
    setWarehouses(res.warehouses);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        await loadStores();
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load stores');
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        await loadWarehouses(storeId);
        if (!active) return;
        const s = stores.find((x) => x.id === storeId);
        if (s) {
          setEditStore({
            name: s.name || '',
            address: s.address || '',
            phone: s.phone || '',
            gstin: s.gstin || '',
            footerNote: s.footerNote || ''
          });
        }
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load store details');
      }
    })();
    return () => { active = false; };
  }, [storeId, stores]);

  async function createStore() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/stores', { method: 'POST', body: JSON.stringify(newStore) });
      setCreateStoreOpen(false);
      setNewStore({ code: '', name: '', address: '', stateCode: '' });
      await loadStores();
    } catch (e: any) {
      setError(e?.message || 'Failed to create store');
    } finally {
      setBusy(false);
    }
  }

  async function saveStore() {
    if (!storeId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/stores/${storeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editStore.name,
          address: editStore.address,
          phone: editStore.phone,
          gstin: editStore.gstin,
          footerNote: editStore.footerNote
        })
      });
      await loadStores();
    } catch (e: any) {
      setError(e?.message || 'Failed to update store');
    } finally {
      setBusy(false);
    }
  }

  async function createWarehouse() {
    if (!storeId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/warehouses', {
        method: 'POST',
        body: JSON.stringify({ storeId, name: newWarehouseName.trim() })
      });
      setNewWarehouseName('');
      await loadWarehouses(storeId);
    } catch (e: any) {
      setError(e?.message || 'Failed to create store warehouse');
    } finally {
      setBusy(false);
    }
  }

  async function deleteStore() {
    if (!storeId) return;
    if (!confirm('Delete this store? This will remove it from active lists.')) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/stores/${storeId}`, { method: 'DELETE' });
      setStoreId('');
      await loadStores();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete store');
    } finally {
      setBusy(false);
    }
  }

  async function deleteWarehouse(id: string) {
    if (!storeId) return;
    if (!confirm('Delete this warehouse?')) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/warehouses/${id}`, { method: 'DELETE' });
      await loadWarehouses(storeId);
    } catch (e: any) {
      setError(e?.message || 'Failed to delete warehouse');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="boPage">
      {error && <div className="boToast">{error}</div>}

      <div className="gCard">
        <div className="gCardHd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="gCardTitle">Stores</div>
          <button className="gBtn" onClick={() => setCreateStoreOpen(true)}>+ New Store</button>
        </div>
        <div className="gCardBd">
          <div className="gRow">
            <div className="gField" style={{ flex: 1 }}>
              <label>Select Store</label>
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {store && (
        <div className="gGrid2">
          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardTitle">Store Details</div>
            </div>
            <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gField">
                <label>Name</label>
                <input value={editStore.name} onChange={(e) => setEditStore((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="gField">
                <label>Address</label>
                <input value={editStore.address} onChange={(e) => setEditStore((p) => ({ ...p, address: e.target.value }))} />
              </div>
              <div className="gGrid2">
                <div className="gField">
                  <label>Phone</label>
                  <input value={editStore.phone} onChange={(e) => setEditStore((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="gField">
                  <label>GSTIN</label>
                  <input value={editStore.gstin} onChange={(e) => setEditStore((p) => ({ ...p, gstin: e.target.value }))} />
                </div>
              </div>
              <div className="gField">
                <label>Footer Note (Invoice)</label>
                <input value={editStore.footerNote} onChange={(e) => setEditStore((p) => ({ ...p, footerNote: e.target.value }))} />
              </div>
              <div className="boMetaRow">
                <div className="boPill">State: {store.stateCode}</div>
                <div className="boPill">Code: {store.code}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost danger" onClick={deleteStore} disabled={busy}>
                  Delete Store
                </button>
                <button className="gBtn" onClick={saveStore} disabled={busy}>Save</button>
              </div>
            </div>
          </div>

          <div className="gCard">
            <div className="gCardHd">
              <div className="gCardTitle">Store Warehouses (rename as needed)</div>
            </div>
            <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gRow">
                <div className="gField" style={{ flex: 1 }}>
                  <label>New Warehouse Name</label>
                  <input value={newWarehouseName} onChange={(e) => setNewWarehouseName(e.target.value)} placeholder="e.g. Main Counter" />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button className="gBtn ghost" onClick={createWarehouse} disabled={busy || newWarehouseName.trim().length < 2}>
                    Add
                  </button>
                </div>
              </div>

              <div style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr><th>Name</th><th className="right">Actions</th></tr>
                  </thead>
                  <tbody>
                    {warehouses.map((w) => (
                      <tr key={w.id}>
                        <td style={{ fontWeight: 900 }}>{w.name}</td>
                        <td className="right">
                          <button className="gBtn ghost danger mini" onClick={() => deleteWarehouse(w.id)} disabled={busy}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {warehouses.length === 0 && <tr><td colSpan={2} style={{ color: 'var(--pos-muted)' }}>No warehouses</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {createStoreOpen && (
        <div className="gModalBack" onClick={() => !busy && setCreateStoreOpen(false)}>
          <div className="gModal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>New Store</div>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="gGrid2">
                <div className="gField">
                  <label>Code</label>
                  <input value={newStore.code} onChange={(e) => setNewStore((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
                </div>
                <div className="gField">
                  <label>State Code</label>
                  <input value={newStore.stateCode} onChange={(e) => setNewStore((p) => ({ ...p, stateCode: e.target.value }))} placeholder="e.g. 29" />
                </div>
              </div>
              <div className="gField">
                <label>Name</label>
                <input value={newStore.name} onChange={(e) => setNewStore((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="gField">
                <label>Address</label>
                <input value={newStore.address} onChange={(e) => setNewStore((p) => ({ ...p, address: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost" onClick={() => setCreateStoreOpen(false)} disabled={busy}>Cancel</button>
                <button className="gBtn" onClick={createStore} disabled={busy || newStore.code.trim().length < 2 || newStore.name.trim().length < 2 || newStore.address.trim().length < 5 || newStore.stateCode.trim().length !== 2}>
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
