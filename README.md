# Ledgerly

Ledgerly is a local-first, offline-ready desktop application built for complete inventory tracking and ledger management. Designed to be private, fast, and completely self-contained, it combines the desktop integration of Electron with a streamlined React single-page frontend and a powerful local SQLite database engine.

Instead of relying on cloud servers, all business states are saved directly into portable, encrypted workspace files on your machine.

---

## Core Architecture & Technical Stack

The system is split into an isolated main desktop process (the backend architecture) and a high-performance rendering window (the frontend user interface):

* **App Shell Framework:** Electron manages the underlying native operating system communication channels, custom desktop windows, and native file system dialog interactions.
* **Database Engine:** Powered by `better-sqlite3`, providing high-performance, synchronous database transaction capabilities straight into an embedded SQLite engine.
* **Frontend UI Library:** Built with React 18 and paired with React Router DOM for fast, fluid client-side single-page routing structures.
* **State Management:** Core client state, interface configurations, and active workspace conditions are handled via a lightweight, atomic Zustand store wrapper.
* **Styling Engine:** Styled dynamically using Tailwind CSS with deep Vite build integrations to optimize stylesheet sizes and compilation metrics.
* **Bundler & Tooling:** Vite coordinates hot-reloading performance and module resolution across both main and renderer threads using specialized Electron plugins.
* **Data Visualization:** Sales analytics, performance charts, and revenue data trends are plotted using the Recharts graphing library.

---

## Deep Feature Breakdown

### 1. File-Bound Multi-Profile Workspaces (`.biz`)

* Every bit of business data is packaged inside localized tracking documents using a custom `.biz` file extension.
* A single workspace document can host multiple independent business profiles or separate accounting cost centers simultaneously.
* Profiles feature dedicated name descriptors, optional local passwords to restrict access, and visual color themes mapped inside the user interface.
* The application tracks session persistence, allowing the app state manager to log open profiles and restore your exact multi-profile workflow automatically when restarted.

### 2. Advanced Local Financial Security & Encryption

* Ledgerly safeguards sensitive business intelligence records on your hard drive by utilizing column-level database field encryption.
* Personally identifiable fields including supplier names, customer names, primary addresses, and telephone contact details are automatically scrambled before hitting the SQLite data files.
* Financial data values such as individual ledger particulars, unit item cost rates, and invoice totals are transformed into encrypted strings to prevent raw text data sniffing via unauthorized external database viewing utilities.
* Cleartext decoding happens entirely in-memory during runtime queries using cryptographic key buffers loaded securely when a profile opens.

### 3. Strict Accounting Periods & Stock Snapshots

* Ledger and inventory tracking operations happen inside discrete, structured tracking blocks called periods.
* The engine enforces a strict constraint where only a single accounting period is allowed to remain active at any given moment.
* Closing an active period runs an isolated database transaction that automatically snaps the entire global inventory state, logging current volumes and rates into `stock_snapshot_items`.
* Once the snapshot completes, the application shifts the target period status to closed and initializes a brand new active tracking duration block seamlessly.
* Data integrity is protected at the database engine level by native SQLite triggers (`periods_no_overlap_insert` and `periods_no_overlap_update`) that immediately block any date changes that would result in overlapping timelines.

### 4. Automated Invoice Numbering & Sequence Gaps Prevention

* Invoices utilize a system-managed numbering scheme handled via localized counter trackers inside the `invoice_counters` table.
* The persistence layer automatically scans historical rows within an active period block to determine maximum sequence constraints.
* Allocating a new purchase or sale record auto-increments the sequence counter cleanly to completely avoid manual numbering typos or accounting duplicate sequence errors.
* Strict isolation boundaries ensure that system-managed invoice sequences are unalterable once created, and existing invoice entries can never be moved across different accounting period blocks.

### 5. Smart Inventory Tracking & Ledger Management

* Global stock levels automatically calculate and balance themselves instantly whenever invoices transition to a posted state.
* Posting a purchase invoice increments `purchaseQty`, updates the current `purchaseRate`, and registers new items automatically if the code does not exist.
* Posting a sale invoice automatically tracks outgoing product volumes using `saleQty` parameters.
* Individual customer ledgers track debit and credit operations smoothly, maintaining precise item indexing and using field encryption to protect transaction descriptions.

### 6. Organized PDF Exports & Resilient Backups

* The platform packages a native PDF conversion pipeline through the `invoice:savePdf` channel handler.
* Generated invoices are organized inside your computer's local directories using a predictable tree arrangement: `Documents/Ledgerly/[Profile Name]/[Invoice Type]/[Year]/[Month]/`.
* Output filenames are standardized automatically based on business initials and dates: `[Initials]-[P/S]-[DD-MMM-YY]-[InvoiceNumber].pdf`.
* Successful document generation finishes by opening an OS explorer window to pinpoint the exact folder path.
* The application includes automated historical backup rotations alongside explicit manual user-triggered backup entry routines.

### 7. Native Windows Integration & Optimizations

* The app shell includes optimizations specifically targeted for Windows deployment environments.
* It appends specific Chromium command switches (`disable-http-cache` and `disable-gpu-shader-disk-cache`) at startup to mitigate filesystem access conflicts and lockups common to the Windows platform.
* Single-instance window enforcement is maintained via native system locks. If you double-click a `.biz` file in the file explorer, the arguments route the data into the primary active app window instead of spinning up a brand new heavy app container.
* The browser window container is configured without standard OS borders (`frame: false`) to let the React client output its own custom styling title bar component.

---

## Database Schema Design

The SQLite relational table layer is initialized automatically by the main process upon opening a workspace profile. The schema tracks data through several normalized tables:

```sql
-- Core vendor transactions
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoiceNumber TEXT,
  invoiceSequence INTEGER,
  invoiceDate TEXT,
  supplierName TEXT,      -- Encrypted
  total TEXT DEFAULT '0', -- Encrypted
  totalQty INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  periodId INTEGER,
  address TEXT,           -- Encrypted
  contactNo TEXT,         -- Encrypted
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (periodId) REFERENCES periods(id)
);

-- Core consumer transactions
CREATE TABLE IF NOT EXISTS sale_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoiceNumber TEXT,
  invoiceSequence INTEGER,
  invoiceDate TEXT,
  customerName TEXT,      -- Encrypted
  total TEXT DEFAULT '0', -- Encrypted
  totalQty INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  periodId INTEGER,
  address TEXT,           -- Encrypted
  contactNo TEXT,         -- Encrypted
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (periodId) REFERENCES periods(id)
);

-- Real-time global stock balances
CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  name TEXT,
  purchaseRate TEXT DEFAULT '0', -- Encrypted
  purchaseQty INTEGER DEFAULT 0,
  saleRate TEXT DEFAULT '0',     -- Encrypted
  saleQty INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Historical stock snapshots recorded on period closeout
CREATE TABLE IF NOT EXISTS stock_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodId INTEGER NOT NULL UNIQUE,
  capturedAt TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE
);

```

---

## Development and Workflow

### Requirements

* **Node.js:** version 20 or higher
* **Package Manager:** `pnpm` (configured workspace)
* **Target OS:** Windows is currently the primary packaged distribution target

### Setup & Installation

Clone the repository and install the project dependencies inside the workspace root folder:

```bash
pnpm install

```

### Running Local Development

To launch the application in development mode with active hot reloading and an automated Chromium DevTools window popup:

```bash
pnpm run dev

```

### Quality Assurance Checks

Run the TypeScript type check routine alongside ESLint verification modules before committing code:

```bash
# Verify type alignments across scripts
pnpm run type-check

# Run syntax standard checks
pnpm run lint

```

### Running Automated Tests

The application uses Vitest for testing execution. Since the storage layers rely on native database compilation extensions, the testing commands automatically trigger pre-compilation routines to build binary matching bindings smoothly:

```bash
# Executes standard test specs with dynamic native rebuilds
pnpm test

# Runs raw unit test assertions inside specific directories
pnpm run test:unit:raw

```

### Production Packaging

To compile the TypeScript main process code, bundle the React production frontend app via Vite, and package everything into an executable production build installer using `electron-builder`:

```bash
pnpm run build

```