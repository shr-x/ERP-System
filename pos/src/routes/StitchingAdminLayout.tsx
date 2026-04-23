import { NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { getAuth } from '../lib/auth';
import { StButton, StInput } from '../components/stitching/AdminUi';

function tabTitle(pathname: string) {
  if (pathname.includes('/backoffice/stitching/new')) return 'Manage Products';
  if (pathname.includes('/backoffice/stitching/orders')) return 'Orders';
  if (pathname.includes('/backoffice/stitching/customers')) return 'Customers';
  if (pathname.includes('/backoffice/stitching/tailor')) return 'Tailor';
  return 'Stitching';
}

export function StitchingAdminLayout() {
  const auth = getAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const [q, setQ] = useState('');
  const title = useMemo(() => tabTitle(loc.pathname), [loc.pathname]);
  const subtitle = useMemo(() => {
    if (title === 'Manage Products') return 'Manage stitching product templates used in POS';
    return 'Search by order ID and jump to order details';
  }, [title]);

  useEffect(() => {
    const seed = sp.get('q') || '';
    if (seed && !q.trim()) setQ(seed);
  }, [sp]);

  const who = auth?.user?.fullName || 'Admin';

  return (
    <div className="stShell">
      <aside className="stSide">
        <div className="stBrand" onClick={() => nav('/backoffice/stitching/new')} role="button" tabIndex={0}>
          <div className="stMark">
            <img src="/sutra-logo.svg" alt="" />
          </div>
          <div className="stBrandText">
            <div className="stBrandName">Sutra</div>
            <div className="stBrandSub">Stitching Admin</div>
          </div>
        </div>

        <nav className="stNav">
          <NavLink to="/backoffice/stitching/new" className={({ isActive }) => `stNavItem${isActive ? ' active' : ''}`}>
            Manage Products
          </NavLink>
          <NavLink to="/backoffice/stitching/orders" className={({ isActive }) => `stNavItem${isActive ? ' active' : ''}`}>
            Orders
          </NavLink>
          <NavLink to="/backoffice/stitching/customers" className={({ isActive }) => `stNavItem${isActive ? ' active' : ''}`}>
            Customers
          </NavLink>
          <NavLink to="/backoffice/stitching/tailor" className={({ isActive }) => `stNavItem${isActive ? ' active' : ''}`}>
            Tailor
          </NavLink>
        </nav>

        <div className="stSideFoot">
          <div className="stUser">
            <div className="stUserName">{who}</div>
            <div className="stUserRole">{auth?.user?.role || ''}</div>
          </div>
        </div>
      </aside>

      <main className="stMain">
        <div className="tw-border-b tw-border-line tw-bg-white">
          <div className="tw-mx-auto tw-max-w-[1280px] tw-px-6 tw-py-5 tw-flex tw-items-start tw-justify-between tw-gap-6">
            <div>
              <div className="tw-text-[20px] tw-font-semibold tw-text-ink">{title}</div>
              <div className="tw-mt-1 tw-text-[12px] tw-text-muted">{subtitle}</div>
            </div>

            <div className="tw-flex tw-items-center tw-gap-3">
              <div className="tw-text-[12px] tw-text-muted tw-font-medium">{who}</div>
              <div className="tw-w-[280px]">
                <StInput
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search Order ID…"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const v = q.trim();
                    if (!v) return;
                    nav(`/backoffice/stitching/orders?q=${encodeURIComponent(v)}`);
                  }}
                />
              </div>
              <StButton
                variant="primary"
                onClick={() => {
                  const v = q.trim();
                  if (!v) return;
                  nav(`/backoffice/stitching/orders?q=${encodeURIComponent(v)}`);
                }}
                type="button"
              >
                Search
              </StButton>
            </div>
          </div>
        </div>

        <div className="stBody tw-bg-bg">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function StitchingAdminIndex() {
  return <Navigate to="/backoffice/stitching/new" replace />;
}
