# Sutra ERP

GST-first retail ERP for small Indian businesses: a fast POS + a lightweight Admin Backoffice, backed by a single PostgreSQL database. Designed for B2C billing, GST reporting, and simple daily operations.

## What’s inside

- **POS + Backoffice UI**: React (Vite) single-page app in `pos/`
- **Backend API**: NestJS + Prisma + PostgreSQL in `backend/`
- **Stitching Portal**: Integrated module for tailoring & custom product measurements
- **Exports & printing**: XLSX/PDF/JSON generation and invoice/receipt rendering (Puppeteer)
- **Deployment**: Docker Compose configuration ready for Dokploy

## Product principles (why the system behaves the way it does)

- **Works offline-first**: everything runs locally (no external GST APIs).
- **INR-only money**: all money values are stored and computed as paise (`BigInt`) and displayed as ₹.
- **GST-first**: all billing validates GST basics (HSN, GST rate, intra/inter-state regime, CGST/SGST/IGST breakup).
- **Walk-in supported**: customer is optional; POS can bill without attaching a customer.
- **Two print formats**: thermal receipt + A4 invoice.
- **Double-entry accounting**: every posting enforces Total Debit = Total Credit (no incorrect entries).
- **Extensible**: Native support for Custom Stitching measurements, categories, and POS flows.

## Architecture

```mermaid
flowchart LR
  UI["POS + Backoffice UI\n(Vite SPA)"]
  API["Backend API\n(NestJS)"]
  JOBS["Exports & Printing\n(XLSX / PDF)"]
  DB[("PostgreSQL\nsutra_erp")]

  UI -->|/api| API
  API --> DB
  API --> JOBS
  JOBS --> DB
```

### Key modules (backend)

- **Auth & Users**: login, admin verification, staff management
- **Stores & Warehouses**: store master + warehouse list per store
- **Inventory**: batches (`InventoryBatch`) + stock moves (`StockMove`, `StockMoveLine`)
- **Sales (POS)**: invoices + payments + stock decrement + accounting journal
- **Sales Returns**: returns + inventory add-back + credit/settlement
- **Purchases**: purchase invoices + stock receive + accounting journal
- **Accounting (Books)**: chart of accounts, journal entries, P\&L exports
- **GST**: GSTR-3B summary/export, ITC register
- **Loyalty**: earn/redeem points ledger
- **Coupons**: issuance + redemption
- **Printing**: A4 + thermal generation + share links
- **Feedback**: customer feedback link + backoffice listing

## Core flows (diagrams)

### POS billing flow (sale)

```mermaid
sequenceDiagram
  autonumber
  actor Cashier
  participant UI as POS UI
  participant API as Backend API
  participant DB as PostgreSQL

  Cashier->>UI: Select items + qty + payment method
  UI->>API: POST /sales/invoices
  API->>DB: Validate store/warehouse + fetch products
  API->>DB: Decrement InventoryBatch (FIFO)
  API->>DB: Create SalesInvoice + SalesInvoiceLine + Payment
  API->>DB: Create StockMove + StockMoveLine
  API->>DB: Create JournalEntry + JournalLine (sale + tax + payment)
  API-->>UI: Invoice response
  UI-->>Cashier: Invoice created + receipt actions
```

### Purchase flow (stock receiving)

```mermaid
sequenceDiagram
  autonumber
  actor Admin
  participant UI as Backoffice UI
  participant API as Backend API
  participant DB as PostgreSQL

  Admin->>UI: Create purchase invoice (supplier + items)
  UI->>API: POST /purchases/invoices
  API->>DB: Create PurchaseInvoice + PurchaseInvoiceLine
  API->>DB: Create InventoryBatch per item (qtyAvailable = qtyReceived)
  API->>DB: Create StockMove(PURCHASE) + StockMoveLine
  API->>DB: Create JournalEntry + JournalLine (inventory + tax + payable)
  API-->>UI: Purchase invoice created
```

### Sales return flow (return + store credit)

```mermaid
sequenceDiagram
  autonumber
  actor Staff
  participant UI as POS UI
  participant API as Backend API
  participant DB as PostgreSQL

  Staff->>UI: Lookup invoice + select items/qty to return
  UI->>API: POST /sales/returns
  API->>DB: Validate invoice + compute GST reversal
  API->>DB: Create SalesReturn + SalesReturnLine
  API->>DB: Create StockMove(RETURN) + StockMoveLine (qty back to batches)
  API->>DB: Create Customer credit entries (if applicable)
  API->>DB: Create JournalEntry + JournalLine (reverse revenue/tax as per rules)
  API-->>UI: Return receipt + share options
```

### Printing/share flow (thermal + A4 + share link)

```mermaid
sequenceDiagram
  autonumber
  actor Staff
  participant UI as POS UI
  participant API as Backend API
  participant JOBS as Print Engine
  participant DB as PostgreSQL

  Staff->>UI: Click Print (Thermal/A4) or Share
  UI->>API: POST /printing/jobs
  API->>DB: Create PrintJob(kind, format, targetId)
  API->>JOBS: Render HTML/PDF (Puppeteer for A4)
  JOBS->>DB: Update PrintJob status + asset path
  API-->>UI: Download/open print file

  Staff->>UI: Click Share
  UI->>API: POST /printing/share-links
  API->>DB: Create tokenized share link (expiresAt)
  API-->>UI: Share URL (WhatsApp/browser)
```

### Feedback flow (token link → submit → backoffice list)

```mermaid
sequenceDiagram
  autonumber
  actor Customer
  participant UI as Browser
  participant API as Backend API
  participant DB as PostgreSQL

  Customer->>UI: Open feedback link
  UI->>API: GET /feedback/:token
  API->>DB: Validate token + expiry + invoice
  API-->>UI: Render feedback form
  Customer->>UI: Submit rating + comment
  UI->>API: POST /feedback/:token
  API->>DB: Create Feedback (idempotent)
  API-->>UI: Thank-you page
```

### Reporting/export flow

```mermaid
sequenceDiagram
  autonumber
  actor Admin
  participant UI as Backoffice UI
  participant API as Backend API
  participant DB as PostgreSQL

  Admin->>UI: Select date range + click Export
  UI->>API: GET /accounting/journal-entries/export
  API->>DB: Query journal entries + linked invoices
  API-->>UI: XLSX download
```

### Double-entry posting (Debit = Credit)

```mermaid
flowchart TB
  A["Transaction event(Sale / Purchase / Return / Manual JE)"] --> B["Prepare JournalEntry header(sourceType, date, narration, storeId)"]
  B --> C["Compute JournalLines(each has debitPaise OR creditPaise)"]
  C --> D["Validation gateΣ(debitPaise) == Σ(creditPaise)"]
  D -->|pass| E["Persist JournalEntry + JournalLines(status=POSTED)"]
  D -->|fail| F["Reject request(no partial write)"]
```

### Inventory FIFO batch consumption (sale)

```mermaid
flowchart LR
  S["Sale line\n(productId, qty)"] --> Q["Find available batches\nORDER BY receivedAt ASC"]
  Q --> B1["Batch 1\nqtyAvailable=a1"]
  Q --> B2["Batch 2\nqtyAvailable=a2"]
  Q --> B3["Batch 3\nqtyAvailable=a3"]
  B1 --> C1["Consume min(need,a1)"]
  C1 -->|need remains| C2["Consume from next batch"]
  C2 -->|need remains| C3["Consume from next batch"]
  C3 -->|need met| M["Create StockMove(SALE)\n+ StockMoveLines (per batch)"]
  M --> U["Update InventoryBatch.qtyAvailable decrements\n(per batch used)"]
  U --> V["If total available < qty\nreject as Out of stock"]
```

## Local development

### Requirements

- Node.js (LTS recommended: 22)
- Docker Desktop (recommended for local PostgreSQL & deployment testing)
- Google Chrome (used by Puppeteer for PDFs)

### 1) Start PostgreSQL (dev)

```bash
cd backend
docker compose -f docker-compose.dev.yml up -d
```

### 2) Backend env

Create `backend/.env` (copy `backend/.env.example` and edit if needed):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sutra_erp?schema=public"
PORT=4000
JWT_ACCESS_SECRET="change_me"
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
UPI_VPA="sutra@upi"
UPI_PAYEE_NAME="Sutra Retail"
```

Create `pos/.env.production` (or `.env` for local dev):

```env
VITE_API_BASE_URL=http://localhost:4000
```

### 3) Reset DB + apply migrations

```bash
cd backend
npm install
npx prisma migrate reset --force
```

### 4) Run backend

```bash
cd backend
npm run dev
```

Health check: `GET http://localhost:4000/health`

### 5) Run POS + Backoffice UI

```bash
cd pos
npm install
npm run dev
```

UI: `http://localhost:5173`

## Production Deployment (Dokploy / Docker Compose)

The project includes a root `compose.yaml` and `Dockerfile`s for both backend and frontend. It is optimized for zero-config deployment on Dokploy or any Docker Swarm/Compose environment.

```bash
# Build and run the entire stack locally for production testing
docker compose up --build
```

- **Backend** runs on port `4000` internally.
- **Frontend** runs on port `5174` and serves static files while proxying `/api` requests to the backend.

## Demo seed contents (what “real store-ish” means here)

- 1 organization (Karnataka, GSTIN configured)
- 1 store + 2 warehouses (Main Warehouse + Shop Floor)
- 3 customers (Walk-in + retail + business with GSTIN)
- 3 product categories + a small catalog (saree, silk saree, dress material, accessories)
- 2 purchase invoices (multiple lines) + batches + stock moves
- 3 sales invoices (multi-line) + payments + stock decrement
- Balanced journal entries for purchases and sales (double-entry)

## Database management (recommended)

Use a stable Postgres GUI:

- **TablePlus** or **DBeaver**
- Connection (default dev):
  - Host: `localhost`
  - Port: `5433`
  - User: `postgres`
  - Password: `postgres`
  - DB: `sutra_erp`

## Backoffice features

- **Users**: create staff, reset passwords, deactivate staff (admin password confirm)
- **Stores**: create warehouses, set store details
- **Inventory**: products/categories, stock levels (store/warehouse)
- **Purchases**: purchase invoices (batch-wise), supplier state code → tax regime
- **Books**: journal entries, P\&L export, journal export
- **GST**: GSTR-3B summary/export, ITC register
- **Printing**: A4 invoices + thermal receipts + share links
- **Feedback**: view customer ratings/comments

## Feature map (end-to-end)

### POS (cashier)

- **Catalog browsing**: category chips, search, sorting
- **Stock visibility**: per-selected warehouse “In/Out” badges (driven by `InventoryBatch.qtyAvailable`)
- **Cart**: add items, change quantity, remove lines
- **Customer**: walk-in by default, lookup by phone, attach customer to bill
- **Loyalty**: earn points on sale, redeem points as discount (validated against balance)
- **Payments**: cash / UPI / card (records a `Payment` against the invoice)
- **Invoice numbering**: store+financial-year invoice series (ex: `BLR1/2026-27/000001`)
- **Receipt / Invoice**: thermal HTML receipt + A4 PDF invoice generation via Puppeteer
- **Share**: creates share link for invoice (for WhatsApp / browser view)

### Backoffice (admin)

- **Users**
  - Create staff user
  - Reset staff password (requires admin password verify)
  - Deactivate staff
- **Stores & Warehouses**
  - Store master: code, name, state code
  - Warehouses per store: create/list, used by POS for stock and billing
- **Inventory**
  - Categories: create/update/delete, image upload
  - Products: create/update/delete, image upload, GST/HSN mapping
  - Stock Levels: view store stock totals and warehouse stock (batch-backed)
- **Purchases**
  - Suppliers: GSTIN + state code
  - Purchase invoices: batch receive into warehouse (creates inventory batches)
  - Auto GST regime (intra/inter-state) from supplier vs store state
- **Books (Accounting)**
  - System chart of accounts setup
  - Manual journal entry posting
  - Journal list with order value + GST breakup
  - Export Journal XLSX (entries + lines)
  - Profit & Loss report + export
- **GST**
  - GSTR-3B summary & export
  - ITC register (input tax credit)
  - GSTR-1 export support (sales outward supplies)

## Data model (high-level)

```mermaid
erDiagram
  ORGANIZATION ||--o{ STORE : has
  STORE ||--o{ WAREHOUSE : has
  STORE ||--o{ USER : employs
  ORGANIZATION ||--o{ CUSTOMER : has
  ORGANIZATION ||--o{ SUPPLIER : has

  ORGANIZATION ||--o{ PRODUCT_CATEGORY : has
  ORGANIZATION ||--o{ PRODUCT : has
  PRODUCT_CATEGORY ||--o{ PRODUCT : groups

  WAREHOUSE ||--o{ INVENTORY_BATCH : holds
  PRODUCT ||--o{ INVENTORY_BATCH : stocked_as

  STORE ||--o{ STOCK_MOVE : records
  STOCK_MOVE ||--o{ STOCK_MOVE_LINE : has
  INVENTORY_BATCH ||--o{ STOCK_MOVE_LINE : references
  PRODUCT ||--o{ STOCK_MOVE_LINE : moved

  STORE ||--o{ SALES_INVOICE : issues
  SALES_INVOICE ||--o{ SALES_INVOICE_LINE : contains
  SALES_INVOICE ||--o{ PAYMENT : paid_by
  SALES_INVOICE ||--o{ SALES_RETURN : can_have
  SALES_RETURN ||--o{ SALES_RETURN_LINE : contains

  STORE ||--o{ PURCHASE_INVOICE : receives
  PURCHASE_INVOICE ||--o{ PURCHASE_INVOICE_LINE : contains

  STORE ||--o{ JOURNAL_ENTRY : posts
  JOURNAL_ENTRY ||--o{ JOURNAL_LINE : contains
  ORGANIZATION ||--o{ CHART_ACCOUNT : defines
  CHART_ACCOUNT ||--o{ JOURNAL_LINE : used_in

  ORGANIZATION ||--o{ COUPON : issues
  COUPON ||--o{ COUPON_REDEMPTION : redeemed_as
  ORGANIZATION ||--o{ LOYALTY_LEDGER : tracks

  ORGANIZATION ||--o{ PRINT_JOB : prints
  ORGANIZATION ||--o{ INVOICE_SHARE_LINK : shares
  ORGANIZATION ||--o{ FEEDBACK_LINK : requests
  ORGANIZATION ||--o{ FEEDBACK : collects
```

## Roles & permissions

- **ADMIN**: full access (setup accounts, create staff, post journals, GST exports, products/categories, warehouses, Stitching configuration)
- **STAFF**: POS operations only (billing, customers, loyalty, stitching orders); restricted from admin modules

## Inventory rules (how stock works)

- Stock is stored as **batches**: `InventoryBatch(qtyReceived, qtyAvailable, unitCostPaise, expiryDate, receivedAt)`
- A sale decrements stock **FIFO by received date** from the selected warehouse
- Purchases create new batches in the selected warehouse (`qtyAvailable = qtyReceived`)
- Transfers move qty from batches in one warehouse to new batches in another warehouse

## Accounting rules (what gets posted)

- Sales invoice posts:
  - Revenue (Sales)
  - GST output (CGST/SGST or IGST based on place of supply)
  - Payment (Cash/UPI/Cards clearing)
  - Inventory/COGS (where applicable via stock moves)
- Purchase invoice posts:
  - Inventory
  - GST input (CGST/SGST or IGST)
  - Accounts payable

## GST rules (how tax is chosen)

- **Intra-state (CGST+SGST)**: when seller state code == place of supply state code.
- **Inter-state (IGST)**: when seller state code != place of supply state code.
- **B2C vs B2B**: customer can be walk-in (no GSTIN) or business (GSTIN); invoices still carry HSN/GST rate per line.
- **Validation**: GST totals are derived from line taxable values and rates; no manual “freehand” tax amounts.

## Printing formats (what gets generated)

- **Thermal**: fast HTML receipt for counter printing/sharing
- **A4**: PDF invoice via Puppeteer for GST-compliant invoices

## Viewer note (Mermaid diagrams)

Mermaid rendering depends on where you view the README:

- GitHub supports Mermaid.
- VS Code needs Mermaid-enabled Markdown preview (or a Mermaid extension).

## API reference (backend)

### Base URLs
- **Direct backend** (dev): `http://localhost:4023` (from `backend/.env` `PORT`)
- **POS proxy server** (prod-like): `http://localhost:5174/api` proxies to backend
  - The POS static server in `pos/server.mjs` defaults to `apiPrefix=/api` and `target=http://localhost:4023`.
- **POS UI config**: set `pos/.env` `VITE_API_BASE_URL` to either:
  - `http://localhost:4023` (direct backend), or
  - `http://localhost:5174/api` (when serving the built UI via `pos/server.mjs`)

### Authentication
- Most endpoints require `Authorization: Bearer <JWT>`.
- Admin-only endpoints are protected by role checks (`ADMIN`).
- Share links and feedback form endpoints are **token-gated** and do not require JWT.

### Conventions
- Money values are stored as paise (`BigInt`) and returned to UI as strings (displayed as ₹ on UI).
- Quantities are decimals (batch stock uses `Decimal(14,3)`), so stock reads/writes are string-like in API responses.
- Error responses generally return `{ message: string }` with appropriate HTTP status codes.

### Health
- `GET /health` → `{ status: "ok" }`

### Auth (`/auth/*`)
- `POST /auth/bootstrap` create org/store/admin (first-time init)
- `POST /auth/login` login (returns JWT + user)
- `GET /auth/me` current user session (JWT)
- `POST /auth/change-password` change password (JWT)
- `GET /auth/users` list store users (JWT)
- `POST /auth/verify-admin-password` verify admin password (JWT + ADMIN)
- `POST /auth/staff` create staff user (JWT + ADMIN)
- `POST /auth/staff/:id/reset-password` reset staff password (JWT + ADMIN)
- `POST /auth/staff/:id/deactivate` deactivate staff (JWT + ADMIN)
- `GET /auth/my-profile` get my profile (JWT)
- `POST /auth/my-profile` update my profile (JWT)
- `POST /auth/starter-pos-data` insert a starter catalog into the first org (dev utility)

### Stores & Warehouses
- `GET /stores` list stores (JWT)
- `POST /stores` create store (JWT + ADMIN)
- `PATCH /stores/:id` update store (JWT + ADMIN)
- `DELETE /stores/:id` delete store (JWT + ADMIN)
- `GET /warehouses?storeId=...&includeInactiveWithStock=1` list warehouses (JWT)
- `POST /warehouses` create warehouse (JWT + ADMIN)
- `DELETE /warehouses/:id` delete warehouse (JWT + ADMIN)

### Categories (`/categories/*`)
- `GET /categories` list categories (JWT)
- `POST /categories` create category (JWT + ADMIN)
- `PATCH /categories/:id` update category (JWT + ADMIN)
- `DELETE /categories/:id` delete category (JWT + ADMIN)
- `POST /categories/:id/image` upload category image (multipart `file`, max 2MB) (JWT + ADMIN)

### Products (`/products/*`)
- `GET /products?q=&categoryId=` list/search products (JWT)
- `GET /products/:id` get one product (JWT)
- `POST /products` create product (JWT + ADMIN)
- `PATCH /products/:id` update product (JWT + ADMIN)
- `DELETE /products/:id` delete product (JWT + ADMIN)
- `POST /products/:id/image` upload product image (multipart `file`, max 2MB) (JWT + ADMIN)
- `POST /products/starter-catalog` seed starter catalog for org (JWT + ADMIN)

### Inventory (`/inventory/*`)
- `GET /inventory/stock?warehouseId=...&q=` stock by warehouse (JWT)
- `GET /inventory/stock?storeId=...&q=` stock totals by store (JWT)
- `GET /inventory/batches?warehouseId=...&productId=...` list batches for a product in a warehouse (JWT)
- `POST /inventory/receive` receive stock (creates/updates batches) (JWT + ADMIN)
- `POST /inventory/transfer` transfer between warehouses (JWT + ADMIN)
- `POST /inventory/restock` restock to minimum levels (JWT + ADMIN)

### Customers (`/customers/*`)
- `GET /customers?q=` search customers (JWT)
- `POST /customers` create customer (JWT)
- `PATCH /customers/:id` update customer (JWT)
- `PATCH /customers/:id/block` block customer (JWT)
- `PATCH /customers/:id/unblock` unblock customer (JWT)
- `DELETE /customers/:id` delete customer (JWT)

### Loyalty
- `GET /loyalty?phone=...` loyalty lookup by phone (JWT)

### Coupons (`/coupons/*`)
- `GET /coupons/validate?code=...` validate coupon code (JWT)
- `GET /coupons` list coupons (JWT + ADMIN)
- `POST /coupons` create coupon (JWT + ADMIN)
- `PATCH /coupons/:id/disable` disable coupon (JWT + ADMIN)

### Purchases (`/purchases/*`)
- `GET /purchases/suppliers?q=` list/search suppliers (JWT)
- `POST /purchases/suppliers` create supplier (JWT + ADMIN)
- `POST /purchases/invoices` create purchase invoice (creates batches + stock move + journal) (JWT + ADMIN)
- `GET /purchases/invoices` list purchase invoices (JWT)
- `GET /purchases/invoices/:id` get purchase invoice (JWT)

### Sales (`/sales/*`)
- `POST /sales/invoices` create invoice (FIFO stock decrement + payment + journal) (JWT)
- `GET /sales/invoices` list invoices (JWT)
- `GET /sales/invoices/:id` get invoice (JWT)
- `GET /sales/invoices/lookup?invoiceNo=...` lookup invoice for return flow (JWT)
- `POST /sales/returns` create return (stock add-back + journal + credit if applicable) (JWT)
- `GET /sales/returns?storeId=&q=` list returns (JWT + ADMIN)
- `POST /sales/invoices/:id/share` create invoice share link; also returns feedback path when available (JWT)
- `POST /sales/returns/:id/share` create return share link (JWT)
- `POST /sales/credit-receipts` create customer credit receipt (JWT)
- `POST /sales/credit-settlements` settle customer credit (JWT)
- `GET /sales/credit-receipts?q=` list credit receipts (JWT + ADMIN)
- `GET /sales/credit-balances?q=` list customer credit balances (JWT + ADMIN)
- `GET /sales/credit-dues?q=` list customer credit dues (JWT + ADMIN)
- `GET /sales/credit-settlements?q=` list settlements (JWT + ADMIN)
- `POST /sales/credit-receipts/:id/share` create share link for credit receipt (JWT)

### Printing (`/print/*`) and share links (`/share/*`)
- `POST /print/invoices/:invoiceId?format=A4|THERMAL_80MM` generate invoice print (JWT)
- `POST /print/returns/:salesReturnId?format=A4|THERMAL_80MM` generate return print (JWT)
- `POST /print/credit-receipts/:receiptId?format=A4|THERMAL_80MM` generate credit receipt print (JWT)
- `GET /print/jobs/:id` get print job (JWT)
- `GET /print/jobs/:id/download` download print output (JWT)

Token-gated share endpoints (no JWT):
- `GET /share/:token/thermal`
- `GET /share/:token/a4`
- `GET /share/return/:token/thermal`
- `GET /share/return/:token/a4`
- `GET /share/credit/:token/thermal`
- `GET /share/credit/:token/a4`

### Feedback (`/feedback*`)
- `GET /feedback/:token` public feedback form (token + expiry)
- `POST /feedback/:token` submit feedback (idempotent)
- `GET /feedback?q=` list feedback (JWT + ADMIN)

### Media (`/media/*`) and assets (`/assets/*`)
- `GET /media/products/:id` product image bytes
- `GET /media/categories/:id` category image bytes
- `GET /assets/logo.ico` Sutra icon

### Accounting (`/accounting/*`)
- `POST /accounting/setup-system-accounts` setup system chart of accounts (JWT + ADMIN)
- `GET /accounting/coa` list chart of accounts (JWT)
- `GET /accounting/journal-entries` list journal entries (JWT)
- `GET /accounting/journal-entries/:id` get one journal entry (JWT)
- `POST /accounting/journal-entries/manual` create manual journal entry (must balance) (JWT + ADMIN)
- `GET /accounting/journal-entries/export?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD` export journal XLSX (JWT)
- `GET /accounting/reports/profit-loss?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD` profit & loss JSON (JWT)
- `GET /accounting/reports/profit-loss/export?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD` profit & loss XLSX (JWT)

### GST (`/gst/*`)
- `POST /gst/gstr1/summary` GSTR-1 summary (JWT + ADMIN)
- `POST /gst/gstr1/export?format=...` export GSTR-1 (JWT + ADMIN)
- `POST /gst/gstr3b/summary` GSTR-3B summary (JWT + ADMIN)
- `POST /gst/gstr3b/export?format=...` export GSTR-3B (JWT + ADMIN)
- `POST /gst/itc-register` ITC register (JWT + ADMIN)
- `GET /gst/exports/:id/download` download an export file by id (JWT)

### Stitching Module (`/stitching/*`)
- Custom category and product template definitions
- Measurement profiles & tailoring configurations
- Order lifecycle tracking (Pending -> In Progress -> Completed)
- Tailor slips & assignment

## Production checklist

- Set a strong `JWT_ACCESS_SECRET`
- Use real Postgres credentials (not `postgres:postgres`)
- The `docker compose up --build` command handles the Node/Vite build process.
- The backend Dockerfile automatically installs `chromium` to support PDF generation via Puppeteer.
- Ensure the production environment defines `VITE_API_BASE_URL=/api` so the frontend server correctly proxies API requests.
