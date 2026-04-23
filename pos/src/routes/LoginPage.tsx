import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { setAuth } from '../lib/auth';

export function LoginPage() {
  const nav = useNavigate();
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phoneOrEmail, password })
      });

      setAuth({
        accessToken: res.accessToken,
        user: {
          id: res.user.id,
          fullName: res.user.fullName,
          role: res.user.role,
          storeId: res.user.storeId ?? undefined
        }
      });
      nav('/pos', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="loginShell">
      <div className="loginLeft">
        <div className="loginBrand">
          <div className="loginBrandRow">
            <img src="/sutra-logo.ico" alt="" className="loginLogo" />
            <div className="loginBrandText">
              <div className="loginBrandName">Sutra</div>
              <div className="loginBrandTag">Covering of the Soul</div>
            </div>
          </div>
        </div>
        <div className="loginShapes" />
      </div>

      <div className="loginRight">
        <div className="loginCard">
          <div className="loginHdr">
            <div className="loginTitle">Sign in</div>
            <div className="loginSub">Welcome back, please login</div>
          </div>
          <form onSubmit={onSubmit} className="loginForm">
            <div className="loginField">
              <input
                value={phoneOrEmail}
                onChange={(e) => setPhoneOrEmail(e.target.value)}
                placeholder="Phone / Email"
                autoFocus
              />
            </div>
            <div className="loginField loginPassword">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
              />
              <button type="button" className="loginEye" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <div className="loginMeta">
              <button type="button" className="loginLink" disabled>
                Forgot password?
              </button>
            </div>
            <button className="loginBtn" disabled={loading || !phoneOrEmail.trim() || !password}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="loginFoot">
              API: {import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}
            </div>
          </form>
        </div>
      </div>

      {error ? (
        <div className="gModalBack" onMouseDown={() => setError(null)}>
          <div className="gModal" style={{ maxWidth: 520 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="gModalHd">
              <div style={{ fontWeight: 900 }}>Error</div>
              <button className="gBtn ghost" onClick={() => setError(null)}>
                Close
              </button>
            </div>
            <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{error}</div>
              <button className="gBtn" onClick={() => setError(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
