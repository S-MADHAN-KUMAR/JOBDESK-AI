# DemandAccel AI — Frontend

A modern, role-based demand acceleration platform built with **Next.js 15 (App Router)**, **React 19**, **Tailwind CSS v4**, and **shadcn/ui**. The frontend communicates with a Django REST Framework backend via JWT authentication.

---

## ✨ Features

| Area | Capability |
|------|------------|
| **Authentication** | JWT login/refresh/logout with HttpOnly-compatible localStorage tokens |
| **RBAC** | 5 roles (Admin, Market Analyst, CEO/Management, Training Manager, Recruitment Team) — enforced on both frontend routes and backend APIs |
| **Job Explorer** | Search, filter, paginate, bulk delete, and enrich raw job records from multiple providers |
| **Contact Enrichment** | Run provider waterfall (ContactOut → Apollo) to find recruiters/TA contacts with verification state |
| **Source Management (Admin)** | Configure job ingestion connectors (base URL, rate limits, default params, credentials, health status) |
| **Enrichment Sources (Admin)** | Configure contact-enrichment connectors with provider codes, rate limits, and test connections |
| **User Management (Admin)** | CRUD users, assign roles, activate/deactivate, pagination, search, role filter |
| **Theming** | Light/dark mode with system preference detection, persisted in localStorage |
| **Responsive Layout** | Collapsible sidebar, mobile drawer, top navbar with breadcrumbs |
| **Accessibility** | ARIA labels, keyboard navigation, focus management, semantic HTML |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router, Server Components where possible) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 + `tw-animate-css` + shadcn/ui design tokens |
| UI Primitives | shadcn/ui (Radix UI / Base UI under the hood) |
| Icons | Lucide React |
| State | React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`) — no global store needed |
| Data Fetching | Custom `apiFetch` with automatic token refresh on 401 |
| Font | Inter (via `next/font/google`) |

---

## 📁 Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout, ThemeProvider, metadata
│   │   ├── globals.css          # Tailwind v4 + CSS variables + custom loader
│   │   ├── page.tsx             # Dashboard (role-aware quick links)
│   │   ├── login/page.tsx       # Sign-in page
│   │   ├── jobs/page.tsx        # Job Explorer (Market Analyst + Admin)
│   │   ├── enrichment/page.tsx  # Contact Enrichment (Market Analyst + Admin)
│   │   └── admin/
│   │       ├── users/page.tsx         # User Management (Admin only)
│   │       ├── sources/page.tsx       # Job Source Management (Admin only)
│   │       └── enrichment-sources/page.tsx  # Enrichment Source Management (Admin only)
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components (button, card, table, dialog, select, input, label, badge, switch)
│   │   ├── app-shell.tsx        # Layout wrapper: Sidebar + Navbar + main
│   │   ├── navbar.tsx           # Top bar: breadcrumbs, user avatar, role badge, theme toggle, logout
│   │   ├── sidebar.tsx          # Navigation rail (desktop) + Drawer (mobile) with role-filtered links
│   │   ├── theme-provider.tsx   # React Context for light/dark mode
│   │   ├── theme-toggle.tsx     # Icon button to toggle theme
│   │   └── loader.tsx           # Animated square loader
│   └── lib/
│       ├── api.ts               # All API calls, types, auth token management, RBAC constants
│       └── utils.ts             # `cn()` className utility (clsx + tailwind-merge)
├── public/                      # Static assets (SVGs)
├── next.config.ts               # Next.js config
├── eslint.config.mjs            # ESLint flat config
├── postcss.config.mjs           # PostCSS (Tailwind v4)
├── package.json
└── tsconfig.json
```

---

## 🔐 Role-Based Access Control (RBAC)

| Role | Dashboard | Job Explorer | Enrichment | User Mgmt | Source Mgmt | Enrichment Sources |
|------|-----------|--------------|------------|-----------|-------------|-------------------|
| **ADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **MARKET_ANALYST** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **CEO_MANAGEMENT** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **TRAINING_MANAGER** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **RECRUITMENT_TEAM** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

- Frontend: `NAV_GROUPS` in `sidebar.tsx` and `QUICK_LINKS` in `page.tsx` filter by `user.role`
- Backend: Every mutating endpoint enforces permissions; 403 returns redirect to login

---

## 🔌 API Integration (`src/lib/api.ts`)

### Authentication
```ts
login(username, password)    // → sets access + refresh tokens, returns User
fetchProfile()               // GET /auth/profile/
logout()                     // POST /auth/logout/ + clears tokens
```

### Token Management
- Access token in `localStorage.demandaccel_access`
- Refresh token in `localStorage.demandaccel_refresh`
- `apiFetch` auto-refreshes on 401 (single-flight promise to avoid race conditions)

### Job Explorer
```ts
fetchRawJobs({ q, provider, page })        // Paginated search
fetchJobProviders()                         // Distinct provider codes
deleteRawJobs(ids[])                        // Bulk delete
```

### Contact Enrichment
```ts
runCompanyEnrichment({ company_name, titles?, location? })  // Waterfall run
fetchEnrichmentContacts({ company, provider, verification, page })
fetchEnrichmentCompanies()
```

### Admin — Job Sources
```ts
fetchJobSources()                           // List all
createJobSource(input)                      // POST
updateJobSource(id, patch)                  // PATCH
testJobSource(id)                           // Health check
runJobSourceIngestion(id, { keyword, location, country, max_pages })
```

### Admin — Enrichment Sources
```ts
fetchEnrichmentSources()
createEnrichmentSource(input)
updateEnrichmentSource(id, patch)
testEnrichmentSource(id)                    // Connection test
```

### Admin — Users
```ts
apiFetch<User[]>("/admin/users/")           // List
apiFetch<User>("/admin/users/", { method: "POST", body })  // Create
apiFetch<User>(`/admin/users/${id}/`, { method: "PATCH" }) // Update
apiFetch(`/admin/users/${id}/`, { method: "DELETE" })       // Delete
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- pnpm (recommended) or npm/yarn/bun
- Backend API running at `http://localhost:8000/api` (configure via `NEXT_PUBLIC_API_URL`)

### Install & Run
```bash
cd frontend
pnpm install          # or npm install / yarn / bun install
pnpm dev              # starts on http://localhost:3000
```

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | Backend API base URL |

Create `.env.local` in `frontend/` to override:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

---

## 🧭 Key User Flows

### 1. Sign In
- Navigate to `/login`
- Enter credentials → JWT tokens stored → redirect to `/` (or `/admin/users` for admins)

### 2. Dashboard (`/`)
- Role-aware quick-link cards:
  - **Job Explorer** → `/jobs` (Market Analyst, Admin)
  - **Contact Enrichment** → `/enrichment` (Market Analyst, Admin)
  - **User Management** → `/admin/users` (Admin)
  - **Source Management** → `/admin/sources` (Admin)
  - **Enrichment Sources** → `/admin/enrichment-sources` (Admin)

### 3. Job Explorer (`/jobs`)
- Search across title, company, location, description
- Filter by provider
- Pagination (client-side page state)
- Row selection → bulk **Enrich** (runs waterfall per company) or **Delete**
- Click row → side panel with full raw payload

### 4. Contact Enrichment (`/enrichment`)
- **Run enrichment**: company + optional titles + location → waterfall (ContactOut → Apollo)
- Real-time call logs table (provider, status, latency, verified)
- **Enriched contacts table**: filter by provider & verification state, paginated
- Deep link from Job Explorer: `/enrichment?company=Acme&location=Chennai&autoRun=1`

### 5. Admin — User Management (`/admin/users`)
- Stats cards: total, active, admin count
- Search + role filter + pagination
- Inline role selector (instant PATCH)
- Activate/Deactivate toggle with confirmation
- Create/Edit/Delete dialogs with validation

### 6. Admin — Source Management (`/admin/sources`)
- Card grid per connector: health badge, daily usage progress bar, RPM, last run
- Toggle active/inactive (Switch)
- **Edit** dialog: name, provider code, base URL, rate limits, default params
- **Credentials** dialog: API key (encrypted server-side, never in frontend)
- **Test connection** dialog: run ingestion with overrides, see fetched/error counts

### 7. Admin — Enrichment Sources (`/admin/enrichment-sources`)
- Same pattern as Source Management but for contact-enrichment providers
- Provider codes: `contactout`, `apollo`
- **Test connection** runs a lightweight health check

---

## 🎨 Theming

- CSS variables in `globals.css` (`:root` + `.dark`)
- `ThemeProvider` reads `localStorage.demandaccel_theme` or `prefers-color-scheme`
- `ThemeToggle` in navbar switches and persists
- All shadcn/ui components consume the design tokens automatically

---

## ♿ Accessibility Highlights

- Semantic HTML: `<main>`, `<nav>`, `<header>`, `<aside>`, `<table>`, `<dialog>`
- ARIA: `aria-label`, `aria-current`, `aria-expanded`, `role="dialog"`
- Keyboard: Tab order, Enter/Space on buttons, Escape closes dialogs/drawer
- Focus: Visible focus rings (`focus-visible:ring-3`), focus trap in drawers
- Color contrast: Tailwind semantic colors meet WCAG AA

---

## 📦 Available Scripts

```bash
pnpm dev        # Development server with Turbopack
pnpm build      # Production build
pnpm start      # Run production build
pnpm lint       # ESLint (flat config)
pnpm typecheck  # tsc --noEmit
```

---

## 🔗 Related

- **Backend**: Django REST Framework (separate repo)
- **API Spec**: OpenAPI/Swagger at `/api/schema/` on backend
- **shadcn/ui**: <https://ui.shadcn.com>
- **Tailwind CSS v4**: <https://tailwindcss.com/docs>

---

## 📄 License

Proprietary — internal use only.