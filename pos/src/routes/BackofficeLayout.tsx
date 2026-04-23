import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth } from '../lib/auth';
import { BoIcon } from '../components/BoIcon';

export function BackofficeLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const [hovered, setHovered] = useState(false);
  const expanded = hovered;

  const title =
    loc.pathname.includes('/backoffice/inventory') ? 'Inventory' :
    loc.pathname.includes('/backoffice/purchases') ? 'Purchases' :
    loc.pathname.includes('/backoffice/gst') ? 'GST' :
    loc.pathname.includes('/backoffice/accounting') ? 'Accounting' :
    loc.pathname.includes('/backoffice/users') ? 'Users' :
    loc.pathname.includes('/backoffice/customers') ? 'Customers' :
    loc.pathname.includes('/backoffice/stores') ? 'Stores' :
    loc.pathname.includes('/backoffice/loyalty') ? 'Loyalty' :
    loc.pathname.includes('/backoffice/returns') ? 'Returns' :
    loc.pathname.includes('/backoffice/coupons') ? 'Coupons' :
    loc.pathname.includes('/backoffice/credit') ? 'Credit' :
    loc.pathname.includes('/backoffice/feedback') ? 'Feedback' :
    'Backoffice';

  const subtitle =
    loc.pathname.includes('/backoffice/inventory') ? 'Track and manage your stock' :
    loc.pathname.includes('/backoffice/purchases') ? 'Create and manage purchase invoices' :
    loc.pathname.includes('/backoffice/gst') ? 'GST' :
    loc.pathname.includes('/backoffice/accounting') ? 'Journal entries' :
    loc.pathname.includes('/backoffice/users') ? 'Users' :
    loc.pathname.includes('/backoffice/customers') ? 'Customers' :
    loc.pathname.includes('/backoffice/stores') ? 'Stores' :
    loc.pathname.includes('/backoffice/loyalty') ? 'Loyalty' :
    loc.pathname.includes('/backoffice/returns') ? 'Returns' :
    loc.pathname.includes('/backoffice/coupons') ? 'Coupons' :
    loc.pathname.includes('/backoffice/credit') ? 'Credit' :
    loc.pathname.includes('/backoffice/feedback') ? 'Feedback' :
    'Backoffice';

  const sections: Array<{ title: string; items: Array<{ to: string; label: string; icon: any }> }> = [
    {
      title: 'Core',
      items: [
        { to: '/backoffice/inventory', label: 'Stock', icon: 'inventory' },
        { to: '/backoffice/purchases', label: 'Buy', icon: 'purchases' },
        { to: '/backoffice/stitching/new', label: 'Stitching', icon: 'stitchOrders' },
      ]
    },
    {
      title: 'Finance',
      items: [
        { to: '/backoffice/accounting', label: 'Books', icon: 'books' },
        { to: '/backoffice/gst', label: 'GST', icon: 'gst' },
        { to: '/backoffice/credit', label: 'Credit', icon: 'credit' }
      ]
    },
    {
      title: 'CRM',
      items: [
        { to: '/backoffice/customers', label: 'Customers', icon: 'customers' },
        { to: '/backoffice/loyalty', label: 'Loyalty', icon: 'loyalty' },
        { to: '/backoffice/feedback', label: 'Feedback', icon: 'feedback' }
      ]
    },
    {
      title: 'System',
      items: [
        { to: '/backoffice/users', label: 'Users', icon: 'users' },
        { to: '/backoffice/returns', label: 'Returns', icon: 'returns' },
        { to: '/backoffice/coupons', label: 'Coupons', icon: 'coupons' },
        { to: '/backoffice/stores', label: 'Stores', icon: 'stores' }
      ]
    }
  ];

  return (
    <div className="posWrap">
      <div className="posShell">
        <aside
          className={`boSideM ${expanded ? 'expanded' : 'collapsed'}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="boTopM">
            <button type="button" className="boBrandM" onClick={() => nav('/backoffice')} aria-label="Backoffice home">
              <div className="boBrandMarkM">
                <img src="/sutra-logo.ico" alt="" />
              </div>
              {expanded ? <div className="boBrandTextM">Sutra</div> : null}
            </button>
          </div>

          <div className="boNavM">
            {sections.map((sec) => (
              <div key={sec.title} className="boSecM">
                {expanded ? <div className="boSecTitleM">{sec.title}</div> : <div className="boSecGapM" />}
                {sec.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    title={!expanded ? it.label : undefined}
                    data-tooltip={!expanded ? it.label : undefined}
                    className={({ isActive }) => `boItemM ${isActive ? 'active' : ''}`}
                  >
                    <span className="boItemIconM">
                      <BoIcon name={it.icon} />
                    </span>
                    {expanded ? <span className="boItemLabelM">{it.label}</span> : null}
                  </NavLink>
                ))}
              </div>
            ))}
          </div>

          <div className="boBottomM">
            <div className="boDividerM" />
            <button
              className="boItemM"
              onClick={() => {
                clearAuth();
                window.location.href = '/login';
              }}
              title={!expanded ? 'Logout' : undefined}
              data-tooltip={!expanded ? 'Logout' : undefined}
            >
              <span className="boItemIconM">
                <BoIcon name="logout" />
              </span>
              {expanded ? <span className="boItemLabelM">Logout</span> : null}
            </button>
          </div>
        </aside>

        <main className="boMain2">
          <div className="boTop2">
            <div>
              <div className="boTitle2">{title}</div>
              <div className="boSub2">{subtitle}</div>
            </div>
          </div>
          <div className="boBody2">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
