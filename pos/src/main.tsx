import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import { LoginPage } from './routes/LoginPage';
import { BackofficeLayout } from './routes/BackofficeLayout';
import { BackofficeAccountingPage } from './routes/BackofficeAccountingPage';
import { BackofficeGstPage } from './routes/BackofficeGstPage';
import { BackofficeInventoryPage } from './routes/BackofficeInventoryPage';
import { BackofficeCustomersPage } from './routes/BackofficeCustomersPage';
import { BackofficeLoyaltyPage } from './routes/BackofficeLoyaltyPage';
import { BackofficePurchasesPage } from './routes/BackofficePurchasesPage';
import { BackofficeStoresPage } from './routes/BackofficeStoresPage';
import { BackofficeUsersPage } from './routes/BackofficeUsersPage';
import { BackofficeCouponsPage } from './routes/BackofficeCouponsPage.tsx';
import { BackofficeReturnsPage } from './routes/BackofficeReturnsPage.tsx';
import { BackofficeCreditPage } from './routes/BackofficeCreditPage';
import { BackofficeFeedbackPage } from './routes/BackofficeFeedbackPage';
import { BackofficeStitchingOrdersPage } from './routes/BackofficeStitchingOrdersPage.tsx';
import { BackofficeStitchingProductsPage } from './routes/BackofficeStitchingProductsPage.tsx';
import { BackofficeStitchingCustomersPage } from './routes/BackofficeStitchingCustomersPage.tsx';
import { BackofficeStitchingTailorsPage } from './routes/BackofficeStitchingTailorsPage.tsx';
import { PosSinglePage } from './routes/PosSinglePage';
import { RequireAuth } from './routes/RequireAuth';
import { RequireAdmin } from './routes/RequireAdmin';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StitchingAdminIndex, StitchingAdminLayout } from './routes/StitchingAdminLayout';
import { PortalPage } from './routes/PortalPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/portal" element={<PortalPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/pos" element={<PosSinglePage />} />
            <Route element={<RequireAdmin />}>
              <Route path="/backoffice/stitching" element={<StitchingAdminLayout />}>
                <Route index element={<StitchingAdminIndex />} />
                <Route path="new" element={<BackofficeStitchingProductsPage />} />
                <Route path="orders" element={<BackofficeStitchingOrdersPage />} />
                <Route path="customers" element={<BackofficeStitchingCustomersPage />} />
                <Route path="tailor" element={<BackofficeStitchingTailorsPage />} />
              </Route>
              <Route path="/backoffice" element={<BackofficeLayout />}>
                <Route index element={<Navigate to="/backoffice/inventory" replace />} />
                <Route path="inventory" element={<BackofficeInventoryPage />} />
                <Route path="purchases" element={<BackofficePurchasesPage />} />
                <Route path="gst" element={<BackofficeGstPage />} />
                <Route path="accounting" element={<BackofficeAccountingPage />} />
                <Route path="customers" element={<BackofficeCustomersPage />} />
                <Route path="loyalty" element={<BackofficeLoyaltyPage />} />
                <Route path="returns" element={<BackofficeReturnsPage />} />
                <Route path="coupons" element={<BackofficeCouponsPage />} />
                <Route path="credit" element={<BackofficeCreditPage />} />
                <Route path="feedback" element={<BackofficeFeedbackPage />} />
                <Route path="users" element={<BackofficeUsersPage />} />
                <Route path="stores" element={<BackofficeStoresPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
