type Props = { name: 'inventory' | 'purchases' | 'gst' | 'books' | 'customers' | 'loyalty' | 'returns' | 'coupons' | 'credit' | 'feedback' | 'users' | 'stores' | 'logout' | 'pos' | 'stitching' | 'tailors' | 'stitchOrders' };

export function BoIcon({ name }: Props) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'inventory':
      return (
        <svg {...common}>
          <path d="M21 8v13H3V8" />
          <path d="M22 8 12 3 2 8" />
          <path d="M12 21V8" />
        </svg>
      );
    case 'purchases':
      return (
        <svg {...common}>
          <path d="M6 2h12l2 5H4l2-5Z" />
          <path d="M4 7v13h16V7" />
          <path d="M9 11h6" />
        </svg>
      );
    case 'gst':
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M20 19V5" />
          <path d="M7 8h10" />
          <path d="M7 12h10" />
          <path d="M7 16h6" />
        </svg>
      );
    case 'books':
      return (
        <svg {...common}>
          <path d="M4 19a2 2 0 0 0 2 2h12" />
          <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Z" />
          <path d="M8 7h8" />
          <path d="M8 11h8" />
        </svg>
      );
    case 'customers':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a3 3 0 0 1 0 5.74" />
        </svg>
      );
    case 'loyalty':
      return (
        <svg {...common}>
          <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
          <path d="M4 7h16v5H4z" />
          <path d="M12 22V7" />
          <path d="M12 7a2 2 0 1 0-2-2c0 1.1 2 2 2 2Z" />
          <path d="M12 7a2 2 0 1 1 2-2c0 1.1-2 2-2 2Z" />
        </svg>
      );
    case 'returns':
      return (
        <svg {...common}>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
        </svg>
      );
    case 'coupons':
      return (
        <svg {...common}>
          <path d="M21 10a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2Z" />
          <path d="M13 7v10" />
        </svg>
      );
    case 'credit':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </svg>
      );
    case 'feedback':
      return (
        <svg {...common}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
          <path d="M8 9h8" />
          <path d="M8 13h6" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="10" cy="7" r="3" />
          <path d="M22 11v6" />
          <path d="M19 14h6" />
        </svg>
      );
    case 'stores':
      return (
        <svg {...common}>
          <path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
          <path d="M2 7h20l-1 4a3 3 0 0 1-3 2H6a3 3 0 0 1-3-2L2 7Z" />
          <path d="M5 21V13" />
          <path d="M19 21V13" />
          <path d="M9 21v-6h6v6" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...common}>
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
          <path d="M21 3v18" />
        </svg>
      );
    case 'pos':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 9h8" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      );
    case 'stitching':
      return (
        <svg {...common}>
          <path d="M7 7c2-2 4-2 6 0s4 2 6 0" />
          <path d="M7 17c2-2 4-2 6 0s4 2 6 0" />
          <path d="M3 12h18" />
        </svg>
      );
    case 'tailors':
      return (
        <svg {...common}>
          <path d="M4 4l7 7" />
          <path d="M11 4 4 11" />
          <path d="M14 14l6 6" />
          <path d="M20 14l-6 6" />
        </svg>
      );
    case 'stitchOrders':
      return (
        <svg {...common}>
          <path d="M8 6h12" />
          <path d="M8 10h12" />
          <path d="M8 14h8" />
          <path d="M4 6h.01" />
          <path d="M4 10h.01" />
          <path d="M4 14h.01" />
          <path d="M8 18h12" />
        </svg>
      );
  }
}
