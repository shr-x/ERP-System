import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';

type UserRow = { id: string; fullName: string; role: 'ADMIN' | 'STAFF' };
type MyProfile = { id: string; fullName: string; phone: string; email?: string | null; role: 'ADMIN' | 'STAFF' };

export function BackofficeUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [resetModal, setResetModal] = useState<{ open: boolean; userId?: string; fullName?: string; newPassword: string; adminPassword: string }>({
    open: false,
    newPassword: '',
    adminPassword: ''
  });

  const [deleteModal, setDeleteModal] = useState<{ open: boolean; userId?: string; fullName?: string; adminPassword: string }>({
    open: false,
    adminPassword: ''
  });

  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '', email: '', currentPassword: '', newPassword: '' });

  const staff = useMemo(() => users.filter((u) => u.role === 'STAFF'), [users]);

  async function loadUsers() {
    const res = await apiFetch<{ users: UserRow[] }>('/auth/users');
    setUsers(res.users);
  }

  async function loadMyProfile() {
    const res = await apiFetch<{ user: MyProfile }>('/auth/my-profile');
    setProfileForm((p) => ({
      ...p,
      fullName: res.user.fullName || '',
      phone: res.user.phone || '',
      email: res.user.email || ''
    }));
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError(null);
        await loadUsers();
        await loadMyProfile();
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load users');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function createStaff() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: any }>('/auth/staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || '',
          password
        })
      });
      setUsers((prev) => [...prev, res.user]);
      setFullName('');
      setPhone('');
      setEmail('');
      setPassword('');
    } catch (e: any) {
      setError(e?.message || 'Failed to create staff');
    } finally {
      setBusy(false);
    }
  }

  async function resetStaffPassword() {
    if (!resetModal.userId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/auth/staff/${resetModal.userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          newPassword: resetModal.newPassword,
          adminPassword: resetModal.adminPassword
        })
      });
      setResetModal({ open: false, newPassword: '', adminPassword: '' });
    } catch (e: any) {
      setError(e?.message || 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  }

  async function deactivateStaff() {
    if (!deleteModal.userId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/auth/staff/${deleteModal.userId}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({
          adminPassword: deleteModal.adminPassword
        })
      });
      setDeleteModal({ open: false, adminPassword: '' });
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete staff');
    } finally {
      setBusy(false);
    }
  }

  async function updateMyCredentials() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<{ user: MyProfile }>('/auth/my-profile', {
        method: 'POST',
        body: JSON.stringify({
          fullName: profileForm.fullName.trim(),
          phone: profileForm.phone.trim(),
          email: profileForm.email.trim(),
          currentPassword: profileForm.currentPassword,
          newPassword: profileForm.newPassword.trim() || undefined
        })
      });
      setProfileForm((p) => ({ ...p, currentPassword: '', newPassword: '' }));
    } catch (e: any) {
      setError(e?.message || 'Failed to update profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="boPage">
      {error && <div className="boToast">{error}</div>}

      <div className="gGrid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="gCard">
          <div className="gCardHd">
            <div className="gCardTitle">Create Staff</div>
          </div>
          <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="gField">
              <label>Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="gGrid2">
              <div className="gField">
                <label>Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
              </div>
              <div className="gField">
                <label>Email (optional)</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="gField">
              <label>Temporary Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="gBtn" onClick={createStaff} disabled={busy || !fullName.trim() || !phone.trim() || password.length < 8}>
                Create Staff
              </button>
            </div>
          </div>
        </div>

        <div className="gCard">
          <div className="gCardHd">
            <div className="gCardTitle">My Credentials</div>
          </div>
          <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="gField">
              <label>Full Name</label>
              <input value={profileForm.fullName} onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))} />
            </div>
            <div className="gGrid2">
              <div className="gField">
                <label>Phone</label>
                <input value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} placeholder="10-digit mobile" />
              </div>
              <div className="gField">
                <label>Email (optional)</label>
                <input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div className="gField">
              <label>Current Password</label>
              <input type="password" value={profileForm.currentPassword} onChange={(e) => setProfileForm((p) => ({ ...p, currentPassword: e.target.value }))} />
            </div>
            <div className="gField">
              <label>New Password (optional)</label>
              <input type="password" value={profileForm.newPassword} onChange={(e) => setProfileForm((p) => ({ ...p, newPassword: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="gBtn" onClick={updateMyCredentials} disabled={busy || !profileForm.fullName.trim() || !profileForm.phone.trim() || !profileForm.currentPassword || (profileForm.newPassword.length > 0 && profileForm.newPassword.length < 8)}>
                Update Credentials
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="gCard" style={{ marginTop: 16 }}>
        <div className="gCardHd">
          <div className="gCardTitle">Staff Users</div>
        </div>
        <div className="gCardBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {staff.length === 0 ? <div style={{ color: 'var(--pos-muted)' }}>No staff users</div> : null}
          {staff.map((u) => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 900 }}>{u.fullName}</div>
                <div style={{ color: 'var(--pos-muted)', fontSize: 12 }}>{u.id}</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="gBtn ghost"
                  onClick={() => setResetModal({ open: true, userId: u.id, fullName: u.fullName, newPassword: '', adminPassword: '' })}
                >
                  Reset Password
                </button>
                <button
                  className="gBtn ghost danger"
                  onClick={() => setDeleteModal({ open: true, userId: u.id, fullName: u.fullName, adminPassword: '' })}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {resetModal.open && (
        <div className="gModalBack" onClick={() => !busy && setResetModal({ open: false, newPassword: '', adminPassword: '' })}>
          <div className="gModal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Reset Password</div>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: 'var(--pos-muted)', fontSize: 13 }}>{resetModal.fullName}</div>
              <div className="gField">
                <label>New Password</label>
                <input type="password" value={resetModal.newPassword} onChange={(e) => setResetModal((p) => ({ ...p, newPassword: e.target.value }))} />
              </div>
              <div className="gField">
                <label>Admin Password (confirm)</label>
                <input type="password" value={resetModal.adminPassword} onChange={(e) => setResetModal((p) => ({ ...p, adminPassword: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost" onClick={() => setResetModal({ open: false, newPassword: '', adminPassword: '' })} disabled={busy}>
                  Cancel
                </button>
                <button className="gBtn" onClick={resetStaffPassword} disabled={busy || resetModal.newPassword.length < 8 || !resetModal.adminPassword}>
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModal.open && (
        <div className="gModalBack" onClick={() => !busy && setDeleteModal({ open: false, adminPassword: '' })}>
          <div className="gModal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Delete Staff</div>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: 'var(--pos-muted)', fontSize: 13 }}>{deleteModal.fullName}</div>
              <div className="boToast">This will deactivate the staff user (can’t login).</div>
              <div className="gField">
                <label>Admin Password (confirm)</label>
                <input type="password" value={deleteModal.adminPassword} onChange={(e) => setDeleteModal((p) => ({ ...p, adminPassword: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="gBtn ghost" onClick={() => setDeleteModal({ open: false, adminPassword: '' })} disabled={busy}>
                  Cancel
                </button>
                <button className="gBtn danger" onClick={deactivateStaff} disabled={busy || !deleteModal.adminPassword}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
