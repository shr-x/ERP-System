import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { StBadge, StButton, StCard, StEmpty, StInput, StLabel, StModal, StSelect } from '../components/stitching/AdminUi';

type Tailor = { id: string; name: string; phone: string; isActive: boolean };
type Job = {
  id: string;
  orderCode: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  deliveryDate: string;
  productTemplate?: { id: string; name: string; category: string };
  selectedColorCode?: string;
  selectedColorImageUrl?: string | null;
};

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

function normalizePhone(v: string) {
  const x = v.replace(/\D/g, '');
  return x.slice(-10);
}

export function BackofficeStitchingTailorsPage() {
  const [q, setQ] = useState('');
  const [tailors, setTailors] = useState<Tailor[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = useMemo(() => tailors.find((t) => t.id === selectedId) || null, [tailors, selectedId]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const pendingJobs = useMemo(() => jobs.filter((j) => j.status !== 'COMPLETED'), [jobs]);
  const completedJobs = useMemo(() => jobs.filter((j) => j.status === 'COMPLETED'), [jobs]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; phone: string; isActive: boolean }>({ name: '', phone: '', isActive: true });

  async function loadTailors(nextQ?: string) {
    const query = (nextQ ?? q).trim();
    const res = await apiFetch<{ tailors: Tailor[] }>(`/stitching/tailors?q=${encodeURIComponent(query)}&page=1&pageSize=100`);
    setTailors(res.tailors || []);
    if (!selectedId && res.tailors?.[0]?.id) setSelectedId(res.tailors[0].id);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        await loadTailors();
      } catch (e: unknown) {
        if (!active) return;
        setError(errorMessage(e, 'Failed to load tailors'));
      }
    })();
    return () => { active = false; };
  }, [q]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedId) { setJobs([]); return; }
      try {
        const res = await apiFetch<{ orders: Job[] }>(`/stitching/tailors/${selectedId}/jobs`);
        if (!active) return;
        setJobs(res.orders || []);
      } catch {
        if (!active) return;
        setJobs([]);
      }
    })();
    return () => { active = false; };
  }, [selectedId]);

  function openAdd() {
    setForm({ name: '', phone: '', isActive: true });
    setAddOpen(true);
    setEditOpen(false);
  }

  function openEdit() {
    if (!selected) return;
    setForm({ name: selected.name, phone: selected.phone, isActive: selected.isActive });
    setEditOpen(true);
    setAddOpen(false);
  }

  async function saveAdd() {
    setBusy(true);
    setError(null);
    try {
      const name = form.name.trim();
      const phone = normalizePhone(form.phone);
      if (name.length < 2) throw new Error('Enter tailor name');
      if (!/^\d{10}$/.test(phone)) throw new Error('Phone must be 10 digits');
      await apiFetch('/stitching/tailors', { method: 'POST', body: JSON.stringify({ name, phone, isActive: true }) });
      setAddOpen(false);
      await loadTailors('');
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to create tailor'));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const name = form.name.trim();
      const phone = normalizePhone(form.phone);
      if (name.length < 2) throw new Error('Enter tailor name');
      if (!/^\d{10}$/.test(phone)) throw new Error('Phone must be 10 digits');
      await apiFetch(`/stitching/tailors/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ name, phone, isActive: form.isActive }) });
      setEditOpen(false);
      await loadTailors();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to update tailor'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTailor() {
    if (!selected) return;
    if (!confirm('Delete this tailor?')) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/stitching/tailors/${selected.id}`, { method: 'DELETE' });
      setSelectedId('');
      setJobs([]);
      await loadTailors();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to delete tailor'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-mx-auto tw-max-w-[1280px] tw-px-6 tw-py-6">
      <div className="tw-grid tw-grid-cols-12 tw-gap-6">
        <div className="tw-col-span-12 lg:tw-col-span-4">
          <StCard
            title="Tailors"
            right={
              <StButton variant="secondary" onClick={openAdd} disabled={busy} type="button">
                Add Tailor
              </StButton>
            }
          >
            {error ? <div className="tw-rounded-control tw-border tw-border-red-200 tw-bg-red-50 tw-p-3 tw-text-[14px] tw-text-red-800">{error}</div> : null}
            <div className="tw-mt-4">
              <StLabel>Search</StLabel>
              <StInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" />
            </div>
            <div className="tw-mt-4 tw-max-h-[calc(100vh-260px)] tw-overflow-auto tw-rounded-card tw-border tw-border-line">
              {tailors.map((t) => {
                const active = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    className={[
                      'tw-w-full tw-text-left tw-px-4 tw-py-3 tw-border-b tw-border-line hover:tw-bg-slate-50 tw-transition',
                      active ? 'tw-bg-accent' : ''
                    ].join(' ')}
                    onClick={() => setSelectedId(t.id)}
                    type="button"
                  >
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                      <div className="tw-font-medium tw-text-ink">{t.name}</div>
                      <StBadge tone={t.isActive ? 'success' : 'neutral'}>{t.isActive ? 'Active' : 'Inactive'}</StBadge>
                    </div>
                    <div className="tw-mt-0.5 tw-text-[12px] tw-text-muted">{t.phone}</div>
                  </button>
                );
              })}
              {tailors.length === 0 ? <div className="tw-p-6"><StEmpty title="No tailors" subtitle="Add your first tailor to start assigning jobs" /></div> : null}
            </div>
          </StCard>
        </div>

        <div className="tw-col-span-12 lg:tw-col-span-8 tw-space-y-6">
          {!selected ? <StEmpty title="Select a tailor" subtitle="Pick a tailor to view assigned and completed jobs" /> : null}

          {selected ? (
            <>
              <StCard
                title="Tailor Details"
                right={
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <StButton variant="secondary" onClick={openEdit} disabled={busy} type="button">Edit</StButton>
                    <StButton variant="danger" onClick={deleteTailor} disabled={busy} type="button">Delete</StButton>
                  </div>
                }
              >
                <div className="tw-grid tw-grid-cols-12 tw-gap-4">
                  <div className="tw-col-span-12 md:tw-col-span-5">
                    <StLabel>Name</StLabel>
                    <div className="tw-mt-1 tw-font-medium tw-text-ink">{selected.name}</div>
                    <div className="tw-mt-0.5 tw-text-[12px] tw-text-muted">{selected.phone}</div>
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-3">
                    <StLabel>Status</StLabel>
                    <div className="tw-mt-1"><StBadge tone={selected.isActive ? 'success' : 'neutral'}>{selected.isActive ? 'Active' : 'Inactive'}</StBadge></div>
                  </div>
                  <div className="tw-col-span-12 md:tw-col-span-4">
                    <StLabel>Jobs</StLabel>
                    <div className="tw-mt-1 tw-font-medium tw-text-ink">{jobs.length}</div>
                  </div>
                </div>
              </StCard>

              <StCard title="Active Jobs">
                <div className="tw-overflow-auto tw-rounded-card tw-border tw-border-line">
                  <table className="tw-w-full tw-min-w-[720px] tw-text-left tw-text-[14px]">
                    <thead className="tw-bg-bg">
                      <tr className="tw-text-[12px] tw-text-muted">
                        <th className="tw-px-4 tw-py-3">Order</th>
                        <th className="tw-px-4 tw-py-3">Status</th>
                        <th className="tw-px-4 tw-py-3">Delivery</th>
                        <th className="tw-px-4 tw-py-3">Product</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingJobs.map((j) => (
                        <tr key={j.id} className="hover:tw-bg-slate-50">
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-font-medium tw-text-ink">{j.orderCode}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3"><StBadge tone={j.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}>{j.status}</StBadge></td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{String(j.deliveryDate).slice(0, 10)}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{j.productTemplate?.name || '—'}</td>
                        </tr>
                      ))}
                      {pendingJobs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="tw-border-t tw-border-line tw-px-4 tw-py-10 tw-text-center tw-text-[12px] tw-text-muted">
                            No active jobs
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </StCard>

              <StCard title="Completed Jobs">
                <div className="tw-overflow-auto tw-rounded-card tw-border tw-border-line">
                  <table className="tw-w-full tw-min-w-[720px] tw-text-left tw-text-[14px]">
                    <thead className="tw-bg-bg">
                      <tr className="tw-text-[12px] tw-text-muted">
                        <th className="tw-px-4 tw-py-3">Order</th>
                        <th className="tw-px-4 tw-py-3">Delivery</th>
                        <th className="tw-px-4 tw-py-3">Product</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedJobs.map((j) => (
                        <tr key={j.id} className="hover:tw-bg-slate-50">
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-font-medium tw-text-ink">{j.orderCode}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{String(j.deliveryDate).slice(0, 10)}</td>
                          <td className="tw-border-t tw-border-line tw-px-4 tw-py-3 tw-text-muted">{j.productTemplate?.name || '—'}</td>
                        </tr>
                      ))}
                      {completedJobs.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="tw-border-t tw-border-line tw-px-4 tw-py-10 tw-text-center tw-text-[12px] tw-text-muted">
                            No completed jobs
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </StCard>
            </>
          ) : null}
        </div>
      </div>

      <StModal
        open={addOpen || editOpen}
        title={addOpen ? 'Add Tailor' : 'Edit Tailor'}
        onClose={() => !busy && (setAddOpen(false), setEditOpen(false))}
        width="md"
        footer={
          <div className="tw-flex tw-justify-end tw-gap-2">
            <StButton variant="secondary" onClick={() => (setAddOpen(false), setEditOpen(false))} disabled={busy} type="button">Cancel</StButton>
            <StButton variant="primary" onClick={addOpen ? saveAdd : saveEdit} disabled={busy} type="button">{busy ? 'Saving…' : 'Save'}</StButton>
          </div>
        }
      >
        <div className="tw-space-y-4">
          <div>
            <StLabel>Name</StLabel>
            <StInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tailor name" />
          </div>
          <div>
            <StLabel>Phone</StLabel>
            <StInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10 digits" />
          </div>
          {editOpen ? (
            <div>
              <StLabel>Status</StLabel>
              <StSelect value={form.isActive ? '1' : '0'} onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </StSelect>
            </div>
          ) : null}
        </div>
      </StModal>
    </div>
  );
}
