# CyberLab Academy — Frontend (`Milestone 01C`)

Next.js App Router + React 19 + strict TypeScript + Tailwind CSS + `shadcn/ui` frontend for **CyberLab Academy**, integrated with the Milestone 01B FastAPI account, session, MFA, and administrative governance backend (`shared-contracts/openapi.json` v0.2.0).

## Technology Stack

- **Framework:** Next.js 16 (App Router) + React 19 + strict TypeScript
- **Styling & Design System:** Tailwind CSS 4 (CSS-first `@theme` tokens in `styles/globals.css`), `tw-animate-css`, `shadcn/ui` primitives, Lucide icons, SOC dark-first theme with optional light mode
- **Forms & Validation:** React Hook Form + Zod (matching backend password, token, and field rules)
- **Telemetry Charts:** Recharts
- **QR Code Rendering:** Client-side SVG generation via `qrcode` (never sends TOTP URIs to external services)
- **Automated Testing:** Vitest + React Testing Library (`jsdom`)

## Environment Configuration

Copy `.env.example` to `.env.local` if custom overrides are required:

```bash
cp .env.example .env.local
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `CYBERLAB_BACKEND_URL` | `http://127.0.0.1:8000` | Server-side FastAPI target for the same-origin `/api/v1/[...path]` proxy |
| `NEXT_PUBLIC_ENABLE_PREVIEW_DEMO` | `true` | Allows manual activation of the labeled in-memory Cloud Preview Demo Adapter when local FastAPI is unreachable (`false` disables it completely in production) |

## Local Development with FastAPI

1. **Start the FastAPI backend (`127.0.0.1:8000`)** following `docs/LOCAL_EXECUTION_REPORT.md` (with `ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"` and `FRONTEND_URL="http://localhost:3000"`).
2. **Install & run the frontend (`localhost:3000`):**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. All browser requests use relative `/api/v1/...` paths with `credentials: "include"`, preserving the `HttpOnly` `cyberlab_session` cookie and `Origin` header through `app/api/v1/[...path]/route.ts`.

## Cloud Preview Demo Mode

When running in a standalone cloud preview where `127.0.0.1:8000` is unreachable, the top `BackendModeBar` displays an explicit notice and lets reviewers opt into **Cloud Preview Demo Mode**. This mode runs strictly in JavaScript memory (never persisting credentials, tokens, or recovery codes) and clearly labels all simulated actions.

## Verification Commands

```bash
npm run typecheck   # Strict TypeScript check (tsc --noEmit)
npm run lint        # ESLint (React 19 + Next.js rules)
npm test            # Vitest + Testing Library suite
npm run build       # Production Next.js build
```

See [`../docs/MILESTONE_01C_FRONTEND_REPORT.md`](../docs/MILESTONE_01C_FRONTEND_REPORT.md) for the complete architecture, integration matrix, and verification report.
