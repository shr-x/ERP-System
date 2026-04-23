import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { paiseStringToBigInt, paiseToRupeesString } from '../lib/money';

type CouponRow = {
  id: string;
  code: string;
  title: string | null;
  amountPaise: string;
  usesTotal: number;
  usesRemaining: number;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { redemptions: number };
};

export function BackofficeCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [create, setCreate] = useState({
    code: '',
    title: '',
    amountRupees: '',
    usesTotal: '1',
    validFrom: '',
    validTo: ''
  });

  async function loadCoupons() {
    const res = await apiFetch<{ coupons: CouponRow[] }>('/coupons');
    setCoupons(res.coupons || []);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        await loadCoupons();
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load coupons');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function createCoupon() {
    setBusy(true);
    setError(null);
    try {
      const amountRupees = Number(create.amountRupees);
      const usesTotal = Number(create.usesTotal);
      await apiFetch('/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: create.code,
          title: create.title,
          amountRupees,
          usesTotal,
          validFrom: create.validFrom,
          validTo: create.validTo
        })
      });
      setCreate({ code: '', title: '', amountRupees: '', usesTotal: '1', validFrom: '', validTo: '' });
      await loadCoupons();
    } catch (e: any) {
      setError(e?.message || 'Failed to create coupon');
    } finally {
      setBusy(false);
    }
  }

  async function disableCoupon(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/coupons/${id}/disable`, { method: 'PATCH' });
      await loadCoupons();
    } catch (e: any) {
      setError(e?.message || 'Failed to disable coupon');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="boPage">
      {error && <div className="boToast">{error}</div>}

      <div className="gCard">
        <div className="gCardHd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="gCardTitle">Create Coupon</div>
          <button className="gBtn ghost" onClick={loadCoupons} disabled={busy}>
            Refresh
          </button>
        </div>
        <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="gGrid2">
            <div className="gField">
              <label>Code (optional)</label>
              <input value={create.code} onChange={(e) => setCreate((p) => ({ ...p, code: e.target.value }))} placeholder="CPN-SUMMER10" />
            </div>
            <div className="gField">
              <label>Title (optional)</label>
              <input value={create.title} onChange={(e) => setCreate((p) => ({ ...p, title: e.target.value }))} placeholder="Summer Promo" />
            </div>
          </div>
          <div className="gGrid2">
            <div className="gField">
              <label>Amount (₹)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={create.amountRupees}
                onChange={(e) => setCreate((p) => ({ ...p, amountRupees: e.target.value }))}
                placeholder="100"
              />
            </div>
            <div className="gField">
              <label>Uses</label>
              <input
                type="number"
                min={1}
                step={1}
                value={create.usesTotal}
                onChange={(e) => setCreate((p) => ({ ...p, usesTotal: e.target.value }))}
              />
            </div>
          </div>
          <div className="gGrid2">
            <div className="gField">
              <label>Valid From</label>
              <input type="date" value={create.validFrom} onChange={(e) => setCreate((p) => ({ ...p, validFrom: e.target.value }))} />
            </div>
            <div className="gField">
              <label>Valid To</label>
              <input type="date" value={create.validTo} onChange={(e) => setCreate((p) => ({ ...p, validTo: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="gBtn" onClick={createCoupon} disabled={busy || !create.amountRupees.trim()}>
              {busy ? 'Saving…' : 'Create'}
            </button>
          </div>
        </div>
      </div>

      <div className="gCard">
        <div className="gCardHd">
          <div className="gCardTitle">Coupons</div>
        </div>
        <div className="gCardBd">
          {coupons.length ? (
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th className="right">Value</th>
                  <th className="right">Uses</th>
                  <th>Validity</th>
                  <th className="right">Redeemed</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 800 }}>{c.code}</td>
                    <td>{c.title || '-'}</td>
                    <td className="right">₹{paiseToRupeesString(paiseStringToBigInt(c.amountPaise))}</td>
                    <td className="right">
                      {c.usesRemaining}/{c.usesTotal}
                    </td>
                    <td>
                      {new Date(c.validFrom).toLocaleDateString()}
                      {c.validTo ? ` → ${new Date(c.validTo).toLocaleDateString()}` : ''}
                    </td>
                    <td className="right">{c._count?.redemptions ?? 0}</td>
                    <td>{c.isActive ? 'Active' : 'Disabled'}</td>
                    <td className="right">
                      <button className="gBtn ghost" onClick={() => disableCoupon(c.id)} disabled={busy || !c.isActive}>
                        Disable
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="gHelp">No coupons yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

