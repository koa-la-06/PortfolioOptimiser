# Constrained Portfolio Optimization: Frontend Specification

> **Instructions for GitHub Copilot:** Build the React frontend described below in a `frontend/` folder. Follow this document literally. Where something is marked **[ASSUMPTION]**, implement it as written but keep it easy to change (constants file / props). Build in the order given in [Section 13](#13-build-order). Do not add features that are not listed.

---

## 1. Project Context

This is a university project on **constrained portfolio optimisation** using about 49 Indian stocks from diverse sectors (IT, Banking, etc.). Data comes from Yahoo Finance (Jan 1999 to Jan 2026), stored as CSV files (columns: `Date`, `Ticker`, `Close`, `Sector`).

There are two optimisation models, both solved on the same data:

| | **Easy version** | **Hard version** |
|---|---|---|
| Type | Quadratic Programming (QP) | Mixed-Integer Quadratic Programming (MIQP) |
| Goal | Minimise portfolio risk (variance) for a target return | Same, but with real-world constraints |
| Constraints | Weights sum to 1, no short selling, target return | Everything in Easy, plus: **max K stocks**, **allowed sectors only**, **brokerage fee** |
| Behaviour | Spreads tiny amounts across all ~49 stocks | Picks a small, familiar, fee-efficient set of stocks |

The user chooses a **date range**. Only price data inside that range is used to compute expected returns **μ** and the covariance matrix **Σ**, which are then fed into the optimiser.

The frontend lets the user configure inputs, run the optimisation via a backend, and view/download the **optimised portfolio report**.

### System overview

```
CSV files ──► FastAPI backend ──► filters by dates ──► computes μ, Σ ──► calls optimisation code (from .ipynb) ──► JSON result
                    ▲                                                                                              │
                    └──────────────────────────  React frontend (this spec)  ◄───────────────────────────────────────┘
```

**The frontend is the scope of this document.** The backend contract is in [Section 8](#8-backend-api-contract) so the frontend can be built and tested against mock data first.

---

## 2. Tech Stack (fixed)

- **Vite + React 18 + TypeScript** (strict mode on)
- **Tailwind CSS** with `darkMode: 'class'`
- **Recharts** for the donut chart
- **TanStack Query (`@tanstack/react-query`)** for API calls (loading/error states, caching)
- **react-hook-form + zod** for form state and validation
- **jsPDF + jspdf-autotable** for the PDF report (client-side)
- **lucide-react** for icons
- No UI component library. Write small custom components styled with Tailwind.
- No global state library. Local state plus React Query is enough.

---

## 3. Design Principles

- **Simple, clean, uncluttered.** Lots of whitespace, one clear primary action ("Optimise").
- One page, no routing.
- Neutral palette with **one accent colour** (indigo). Use colour sparingly, mostly for the primary button, focus rings and chart.
- Rounded corners (`rounded-xl`), subtle borders instead of heavy shadows.
- Font: **Inter** (system-ui fallback). Numbers use `tabular-nums`.
- Fully responsive: two columns on desktop (≥1024px), single column stacked on mobile/tablet.
- Accessible: labels on all inputs, visible focus rings, colour contrast ≥ WCAG AA in **both** themes, keyboard operable, charts have text alternatives (the table acts as one).

---

## 4. Light / Dark Mode

- Tailwind `darkMode: 'class'`. The `dark` class is toggled on `<html>`.
- **Default** = user's OS preference (`prefers-color-scheme`). After the user clicks the toggle, **persist** the choice in `localStorage` under key `theme` (`"light" | "dark"`).
- Apply the theme **before first paint** (small inline script in `index.html`) to avoid a flash of the wrong theme.
- Toggle button (sun/moon icon) in the top-right of the header, with `aria-label="Toggle theme"`.
- Define colours as semantic tokens in `tailwind.config.ts` / CSS variables so components never hardcode hex values:

| Token | Light | Dark |
|---|---|---|
| `bg` (page) | `#F8FAFC` | `#0B1220` |
| `surface` (cards) | `#FFFFFF` | `#111A2E` |
| `border` | `#E2E8F0` | `#1F2A44` |
| `text` | `#0F172A` | `#E5E7EB` |
| `muted` (secondary text) | `#64748B` | `#94A3B8` |
| `accent` | `#4F46E5` | `#818CF8` |
| `danger` | `#DC2626` | `#F87171` |

- Chart colours must be readable on both backgrounds. Use a fixed 10-colour palette (e.g. indigo, sky, emerald, amber, rose, violet, teal, orange, lime, slate) and cycle it. Chart tooltips and labels must follow the theme.

---

## 5. Page Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Header:  [logo/icon] Portfolio Optimizer          [☀/🌙]     │
├───────────────────────┬──────────────────────────────────────┤
│  INPUT PANEL (card)   │  RESULTS PANEL                        │
│                       │                                       │
│  Model: (Easy|Hard)   │  (empty / loading / error / report)   │
│  Date range           │                                       │
│  Target return        │                                       │
│  Max stocks (K)       │                                       │
│  Sectors              │                                       │
│  Brokerage fee        │                                       │
│                       │                                       │
│  [   Optimise   ]     │                                       │
├───────────────────────┴──────────────────────────────────────┤
│  Footer: project name, team names (small, muted)              │
└──────────────────────────────────────────────────────────────┘
```

Left panel ≈ 380px wide on desktop (sticky); right panel fills the rest.

Footer text: *"Constrained Portfolio Optimization · Sri Hansika Chitturi, Mahithi Kuppa, Geethika Grandhe"*.

---

## 6. Input Panel (the form)

### 6.1 Model toggle
- Segmented control with two options: **Easy (QP)** and **Hard (MIQP)**. Default: **Hard**.
- Below it, a one-line muted description that changes with the selection:
  - Easy: *"Idealised model. No fees, no stock limit, any sector."*
  - Hard: *"Realistic model. Limits stock count, restricts sectors, accounts for brokerage fees."*
- **Easy mode:** the **Max stocks (K)**, **Sectors** and **Brokerage fee** fields are **disabled/greyed out** (not hidden, so the user sees what they're missing) with a small note "Only used in Hard mode". Their values are **not** sent to the API in Easy mode.

### 6.2 Date range (the key feature)
- Two date inputs: **From** and **To** (`<input type="date">` styled with Tailwind; works well on mobile).
- Bounds come from `GET /api/meta` (`min_date`, `max_date`). Set `min`/`max` attributes on both inputs. Until the meta is loaded, show a skeleton.
- **Defaults:** From = `max_date` minus 5 years, To = `max_date`.
- **Quick-select chips** below the inputs: `1Y`, `3Y`, `5Y`, `10Y`, `All`. Each sets From/To relative to `max_date` (`All` uses `min_date`). The chip matching the current range is highlighted.
- **Validation (zod + inline error text under the field):**
  - Both dates required and within `[min_date, max_date]`.
  - `From` must be strictly before `To`.
  - **Minimum window of 180 days** **[ASSUMPTION]**: too little data gives an unreliable covariance matrix. Constant `MIN_WINDOW_DAYS = 180`.
- Under the inputs, show a muted helper: *"≈ 1,258 trading days"** once the range is valid (rough estimate = calendar days × 252/365; the exact figure is shown in the report).

### 6.3 Target return
- Number input (with a slider synced to it), unit **% per year** (annualised). Range **0–50**, step **0.5**, default **12**.
- Label: "Target annual return".
- Helper text: *"Minimum-risk portfolio that achieves at least this return."*

### 6.4 Max number of stocks (K) *(Hard only)*
- Number stepper (− / + buttons and typed input). Integer, min **1**, max = number of stocks in the currently selected sectors (from meta), default **10**.
- Label: "Max stocks in portfolio (K)".
- If sector selection changes and K exceeds the new maximum, clamp K.

### 6.5 Sector selection *(Hard only)*
- A grid of **toggle chips** (multi-select), one per sector from `GET /api/meta` → `sectors`. Each chip shows the sector name and stock count, e.g. `IT · 8`.
- Buttons: **Select all** / **Clear**.
- Default: all sectors selected **[ASSUMPTION]**.
- Validation: at least one sector must be selected.

### 6.6 Brokerage fee *(Hard only)*
- Number input, unit **%**, range **0–5**, step **0.01**, default **0.10** **[ASSUMPTION]**.
- Label: "Brokerage fee (% per stock held)".
- Tooltip (info icon): *"Cost charged for each stock you hold. More stocks means more fees."*
- **[ASSUMPTION]** Fee semantics (percentage of the amount invested in each selected stock) must match the team's notebook formulation. Keep the conversion in one place (`toApiRequest()`), so it's trivial to change.

### 6.7 Submit
- Primary full-width button **"Optimise portfolio"**.
- Disabled while the form is invalid or a request is in flight. While loading, show a spinner and the text "Optimising…".
- Secondary text button **"Reset"** restores the defaults.
- Pressing Enter in any field submits the form.

---

## 7. Results Panel (the optimised portfolio report)

The panel has four states:

1. **Empty** (before first run): a friendly illustration/icon and the text *"Choose your settings and run the optimiser to see your portfolio."*
2. **Loading:** skeleton placeholders for the metrics cards, chart and table (not just a spinner). The Hard model can take several seconds because it's an MIQP.
3. **Error:** a card with the error message from the API (`detail.message`) and a "Try again" button. Special friendly messages by `detail.code`:
   - `INFEASIBLE`: *"No portfolio satisfies these constraints. Try lowering the target return, raising K, or selecting more sectors."*
   - `INSUFFICIENT_DATA`: *"Not enough data in this date range. Try a longer period."*
   - `NETWORK` (fetch failed): *"Can't reach the server. Is the backend running?"*
4. **Report** (success): the following, top to bottom.

### 7.1 Report header
- Title "Optimised portfolio", with a badge for the model used (`Easy (QP)` / `Hard (MIQP)`).
- Muted line with the period and the number of trading days used: *"Data: 01 Jan 2019 – 01 Jan 2024 · 1,235 trading days"*.
- Right side: **Download** dropdown/buttons: **CSV** and **PDF** (see 7.5).

### 7.2 Metrics cards (row of 4–5 small cards)
| Card | Source field | Format |
|---|---|---|
| Expected return (annual) | `metrics.expected_return` | `12.43%` |
| Volatility (annual risk) | `metrics.volatility` | `15.02%` |
| Sharpe ratio | `metrics.sharpe_ratio` | `0.83` |
| Total brokerage fees | `metrics.total_fees` | `0.80%` (Easy mode: show `n/a`, muted) |
| Stocks held | `metrics.num_stocks` | `9` (with sub-label "of 49 available") |

Each card: small muted label on top, large `tabular-nums` value below.

### 7.3 Donut chart
- Recharts `PieChart` with `innerRadius`, showing the weights.
- A small **segmented toggle above the chart**: **By stock** (default) | **By sector**.
  - By stock: one slice per allocated stock (weight > 0). Group slices < 2% into "Other".
  - By sector: use `sector_weights`.
- Legend beside/below the chart with colour dot, label and percentage.
- Tooltip shows label and weight with 2 decimals.
- Centre of the donut: text showing the count of stocks (or sectors).

### 7.4 Allocation table
- Columns: **Stock (ticker)**, **Sector**, **Weight (%)**, plus a thin inline bar showing the weight visually.
- Sorted by weight **descending** by default. Clicking a column header toggles sorting (ticker, sector, weight).
- Only show stocks with weight ≥ 0.01% (hide numerical noise). Show a muted footer row: "Total 100.00%".
- Zebra-free, clean rows with subtle bottom borders. Sticky header if the table scrolls (max height ≈ 420px).
- Weights displayed with 2 decimals, right-aligned, `tabular-nums`.

### 7.5 Download report
- **CSV** (generated client-side): one row per holding: `Ticker,Sector,Weight_%`. Then a blank row, then metrics as `Metric,Value` rows, and the settings used (model, dates, target return, K, sectors, fee). File name: `portfolio_<model>_<from>_<to>.csv`.
- **PDF** (generated client-side with jsPDF + autotable): A4 portrait, containing: title, model, date range and parameters used, the metrics as a small table, the allocation table, and a generated-on timestamp. The PDF is always **light-themed** (white background) regardless of the current UI theme. The donut chart in the PDF is optional (stretch goal).
  File name: `portfolio_<model>_<from>_<to>.pdf`.

---

## 8. Backend API Contract

Base URL from env var `VITE_API_BASE_URL` (default `http://localhost:8000`). Content type JSON. In dev, also configure the Vite proxy for `/api` → `http://localhost:8000`.

### 8.1 `GET /api/meta`
Returns what the UI needs to configure itself.

```json
{
  "min_date": "1999-01-04",
  "max_date": "2026-01-30",
  "total_stocks": 49,
  "sectors": [
    { "name": "IT", "stock_count": 8 },
    { "name": "Banking", "stock_count": 9 }
  ]
}
```

### 8.2 `POST /api/optimize`

**Request**
```json
{
  "model": "hard",
  "start_date": "2019-01-01",
  "end_date": "2024-01-01",
  "target_return": 0.12,
  "max_stocks": 10,
  "sectors": ["IT", "Banking"],
  "brokerage_fee": 0.001
}
```
- `model`: `"easy"` or `"hard"`.
- `target_return`, `brokerage_fee`: **fractions** (0.12 = 12%). The UI works in percentages and converts in `toApiRequest()`.
- In **easy** mode `max_stocks`, `sectors` and `brokerage_fee` are **omitted** from the request.

**Success response (200)**
```json
{
  "model": "hard",
  "period": { "start": "2019-01-01", "end": "2024-01-01", "trading_days": 1235 },
  "allocations": [
    { "ticker": "TCS", "sector": "IT", "weight": 0.18 },
    { "ticker": "HDFCBANK", "sector": "Banking", "weight": 0.15 }
  ],
  "sector_weights": [
    { "sector": "IT", "weight": 0.42 },
    { "sector": "Banking", "weight": 0.58 }
  ],
  "metrics": {
    "expected_return": 0.1243,
    "volatility": 0.1502,
    "sharpe_ratio": 0.83,
    "total_fees": 0.009,
    "num_stocks": 9,
    "solver_status": "optimal",
    "solve_time_ms": 1840
  }
}
```
- All `weight`, `expected_return`, `volatility`, `total_fees` are fractions (0.18 = 18%). `allocations` contains only non-zero holdings.
- `total_fees` is `null` for the easy model.

**Error response (4xx/5xx)**
```json
{ "detail": { "code": "INFEASIBLE", "message": "No feasible portfolio for these constraints." } }
```
Codes: `INFEASIBLE`, `INSUFFICIENT_DATA`, `INVALID_REQUEST`, `SOLVER_ERROR`.

### 8.3 *(Optional, nice-to-have)* `POST /api/return-range`
Given `start_date`, `end_date`, `sectors`, return `{ "min": 0.03, "max": 0.31 }`, the achievable annual return range for that window. If implemented, the UI uses it to clamp the target return slider and show a hint ("Achievable: 3% to 31%"). Skip if the endpoint returns 404.

---

## 9. Backend Notes (FastAPI, for the team / for a separate Copilot task)

Not part of the frontend build, but the frontend depends on this behaviour:

- Load the CSV(s) once at startup with pandas; pivot to a `Date × Ticker` close-price matrix and keep a `Ticker → Sector` map.
- On `/api/optimize`: filter rows to `[start_date, end_date]` (and the chosen sectors in hard mode), compute **daily returns**, then **annualised μ** (mean × 252) and **Σ** (cov × 252). Drop tickers with missing data in the window or return `INSUFFICIENT_DATA`.
- Call the optimisation logic **refactored out of the `.ipynb` files into importable functions** (e.g. `solve_qp(mu, Sigma, target_return)` and `solve_miqp(mu, Sigma, target_return, K, fee)`), in a `.py` module. The notebooks should not be executed by the API.
- Enable CORS for `http://localhost:5173`.
- Use Pydantic models mirroring the JSON above.
- Sharpe ratio = (expected_return − risk_free_rate) / volatility. `RISK_FREE_RATE` constant on the backend (**[ASSUMPTION]** default `0.0`).

---

## 10. Suggested Project Structure

```
frontend/
├─ index.html                  # includes the pre-paint theme script
├─ package.json
├─ tailwind.config.ts
├─ vite.config.ts              # dev proxy for /api
├─ .env.example                # VITE_API_BASE_URL=http://localhost:8000
└─ src/
   ├─ main.tsx
   ├─ App.tsx
   ├─ index.css                # Tailwind directives + CSS variables for theme tokens
   ├─ api/
   │  ├─ client.ts             # fetch wrapper, error normalisation (ApiError with code/message)
   │  ├─ queries.ts            # useMeta(), useOptimize() (React Query)
   │  └─ mock.ts               # mock meta + optimize responses (see Section 12)
   ├─ types/
   │  └─ api.ts                # TypeScript types for all request/response shapes
   ├─ lib/
   │  ├─ format.ts             # formatPercent, formatDate, formatNumber
   │  ├─ toApiRequest.ts       # form values → API request (% → fraction, easy-mode omissions)
   │  ├─ report.ts             # buildCsv(), buildPdf()
   │  └─ constants.ts          # DEFAULTS, MIN_WINDOW_DAYS, RISK_FREE_RATE_NOTE, chart palette
   ├─ hooks/
   │  └─ useTheme.ts
   ├─ schemas/
   │  └─ optimizeForm.ts       # zod schema (depends on meta bounds)
   └─ components/
      ├─ layout/ Header.tsx, Footer.tsx, ThemeToggle.tsx
      ├─ form/
      │  ├─ OptimizerForm.tsx
      │  ├─ ModelToggle.tsx
      │  ├─ DateRangeField.tsx   # two date inputs + presets
      │  ├─ TargetReturnField.tsx
      │  ├─ MaxStocksField.tsx
      │  ├─ SectorPicker.tsx
      │  └─ BrokerageFeeField.tsx
      ├─ results/
      │  ├─ ResultsPanel.tsx     # picks empty/loading/error/report
      │  ├─ ReportHeader.tsx
      │  ├─ MetricCard.tsx
      │  ├─ AllocationDonut.tsx
      │  ├─ AllocationTable.tsx
      │  └─ DownloadMenu.tsx
      └─ ui/ Button.tsx, Card.tsx, Segmented.tsx, Chip.tsx, Skeleton.tsx, Tooltip.tsx
```

---

## 11. Key TypeScript Types

```ts
export type ModelType = 'easy' | 'hard';

export interface MetaResponse {
  min_date: string;           // ISO yyyy-mm-dd
  max_date: string;
  total_stocks: number;
  sectors: { name: string; stock_count: number }[];
}

export interface OptimizeRequest {
  model: ModelType;
  start_date: string;
  end_date: string;
  target_return: number;      // fraction
  max_stocks?: number;        // hard only
  sectors?: string[];         // hard only
  brokerage_fee?: number;     // fraction, hard only
}

export interface Allocation { ticker: string; sector: string; weight: number }
export interface SectorWeight { sector: string; weight: number }

export interface OptimizeResponse {
  model: ModelType;
  period: { start: string; end: string; trading_days: number };
  allocations: Allocation[];
  sector_weights: SectorWeight[];
  metrics: {
    expected_return: number;
    volatility: number;
    sharpe_ratio: number;
    total_fees: number | null;
    num_stocks: number;
    solver_status: string;
    solve_time_ms: number;
  };
}

export type ApiErrorCode =
  | 'INFEASIBLE' | 'INSUFFICIENT_DATA' | 'INVALID_REQUEST' | 'SOLVER_ERROR' | 'NETWORK';
```

---

## 12. Mock Mode

- Env flag `VITE_USE_MOCK=true` makes `api/client.ts` return data from `api/mock.ts` instead of calling the backend (with a fake 1.5s delay), so the whole UI can be built and demoed without the backend.
- Mock `meta`: dates `1999-01-04` to `2026-01-30`, 49 stocks, 5 sectors (IT, Banking, Pharma, FMCG, Energy) with realistic counts.
- Mock `optimize`: return 8–10 allocations whose weights sum to exactly 1 (hard) or ~40 allocations (easy), plus realistic metrics. Make the mock respond to `model` so both modes can be tested, and make one input combination (e.g. target return > 40%) return the `INFEASIBLE` error so the error UI can be tested.

---

## 13. Build Order

1. Scaffold Vite + React + TS, install Tailwind and dependencies, set up theme tokens and the dark-mode class strategy with the pre-paint script.
2. Build the `ui/` primitives and the `Header` with `ThemeToggle`. Verify both themes look good.
3. Write `types/api.ts`, `api/mock.ts`, `api/client.ts`, `api/queries.ts`.
4. Build the form components and zod validation, then `OptimizerForm` with Easy/Hard behaviour.
5. Build the results components (metrics, donut, table) and `ResultsPanel` with all four states.
6. Implement CSV and PDF downloads.
7. Responsive polish, keyboard/focus checks, contrast check in both themes.
8. Write a `frontend/README.md` with install/run instructions and how to switch between mock and real backend.

---

## 14. Acceptance Criteria

- [ ] I can pick a From and To date within the dataset's range; invalid ranges show clear inline errors and disable the submit button.
- [ ] Quick-select chips (1Y/3Y/5Y/10Y/All) set the dates correctly.
- [ ] Toggling Easy/Hard enables/disables the K, sector and fee fields, and Easy requests don't contain those fields.
- [ ] Submitting shows a loading skeleton, then the report with metrics, donut (by stock / by sector), and allocation table.
- [ ] Error states (`INFEASIBLE`, network down) show friendly messages.
- [ ] CSV and PDF downloads work and contain the holdings, metrics and parameters used.
- [ ] Light and dark mode both look polished, with no flash on load, and the choice persists on refresh.
- [ ] Layout works on a 375px-wide phone and a 1440px desktop.
- [ ] `npm run build` completes with no TypeScript errors.

---

## 15. Assumptions to Confirm (edit these if wrong)

| # | Assumption | Where to change |
|---|---|---|
| 1 | Minimum date window is 180 days | `constants.ts` → `MIN_WINDOW_DAYS` |
| 2 | Default date range = last 5 years of available data | `constants.ts` → `DEFAULTS` |
| 3 | Brokerage fee is a % of the amount invested in each held stock; default 0.10% | `toApiRequest.ts`, `constants.ts` |
| 4 | Target return is annualised, default 12% | `constants.ts` |
| 5 | All sectors selected by default; K default 10 | `constants.ts` |
| 6 | Risk-free rate for Sharpe is 0% (computed on the backend) | backend constant |
| 7 | Hard mode is the default model | `constants.ts` |
