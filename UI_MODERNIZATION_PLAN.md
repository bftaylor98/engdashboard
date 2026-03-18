# Engineering Dashboard — UI Modernization Plan

## Purpose

This document is a step-by-step instruction set for Cursor AI to modernize the frontend of the Engineering Schedule Dashboard. The goal is to achieve a premium, smooth feel inspired by Apple and Ubiquiti (UniFi) design language — clean, spacious, fluid motion, and a sense of quality in every interaction.

**The app owner (Brad) has no coding knowledge. He cannot debug or fix broken code.** Every phase must be atomic, testable, and safe. If something breaks, it must be trivially revertible.

---

## CRITICAL RULES — READ BEFORE ANY WORK

### Rule 1: Never Break What Works
- **Before starting ANY phase**, create a git commit with the message `backup: before phase X`.
- **After completing each phase**, verify the app compiles and runs (`npm run dev`). If it doesn't, revert to the backup commit immediately and try again with a smaller change.
- **Never modify server files** (`server/` directory) during this plan. This is a frontend-only refactor.
- **Never modify `server/lib/proshopClient.js`** under any circumstances.
- **Never rename or remove any exported functions, types, or interfaces** that are imported elsewhere. Search for all usages before changing any export.

### Rule 2: One Phase at a Time
- Complete each phase fully before moving to the next.
- Each phase must end with a working, compilable app.
- Do not combine phases or skip ahead.

### Rule 3: Debugging Loop Protocol
When you encounter an error during or after a phase:
1. **Read the full error message** — identify the exact file and line number.
2. **Check if the error existed before your changes** — run `git stash`, test, then `git stash pop`. If the error existed before, it's not your fault — note it and move on.
3. **If the error is from your changes**: fix only the specific error. Do not refactor surrounding code while fixing a bug.
4. **If you've attempted 3 fixes for the same error and it's still broken**: revert the entire phase (`git checkout .`) and retry with a simpler approach.
5. **Never enter a loop where you're fixing fix-induced bugs.** If fixing error A creates error B, and fixing B creates error C — stop. Revert to the phase backup and take a different approach entirely.
6. **Common traps to avoid**:
   - TypeScript errors from changing a prop type that 5 other components depend on — always search for all usages first.
   - Tailwind classes that don't exist — verify class names against Tailwind v3 docs.
   - Import paths breaking after file moves — update ALL import statements, not just the moved file.
   - CSS specificity wars in `index.css` — the light mode overrides are fragile; don't add more, remove them.

### Rule 4: Test Verification After Each Phase
After each phase, confirm:
1. `npm run dev` starts without errors
2. The app loads in the browser at `http://localhost:5173`
3. Navigation between pages works
4. The page you modified renders correctly
5. Light mode and dark mode both work (toggle in Settings)

---

## Architecture Context

```
Project Root
├── src/
│   ├── App.tsx              — Router, auth gates
│   ├── main.tsx             — Entry point
│   ├── index.css            — Global styles, CSS vars, Tailwind layers
│   ├── components/
│   │   ├── Layout.tsx       — Sidebar + header shell
│   │   ├── WorkOrderDrawer.tsx
│   │   ├── MaterialTrackingContent.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── widgets/         — TV dashboard widgets
│   ├── pages/               — All route pages (Dashboard, Schedule, etc.)
│   ├── contexts/            — AuthContext, ThemeContext
│   ├── hooks/               — useSSE
│   ├── lib/                 — utils.ts (cn, formatDate, etc.)
│   ├── services/            — api.ts (all fetch calls)
│   ├── types/               — index.ts (all interfaces + constants)
│   └── constants/           — tvWidgets.ts
├── server/                  — DO NOT TOUCH
├── tailwind.config.js       — Theme extensions
├── vite.config.ts
└── package.json
```

**Key tech**: React 18, TypeScript, Vite, Tailwind CSS 3, Radix UI primitives, Framer Motion (installed but barely used), Recharts, Lucide icons, Sonner toasts.

**Theme system**: Dark mode is the default. Light mode is toggled by adding class `light` to the root element (managed by `ThemeContext`). Currently, light mode is handled by ~500 lines of manual CSS overrides in `index.css`.

---

## PHASE 0: Preparation and Safety Net

### 0.1 — Create a git branch
```bash
git checkout -b ui-modernization
```

### 0.2 — Verify current state compiles
```bash
npm install
npm run dev
```
If this fails, stop and fix existing issues before proceeding.

### 0.3 — Commit the clean starting point
```bash
git add -A
git commit -m "backup: clean starting point before ui modernization"
```

---

## PHASE 0.5: Credential Security — Move ProShop Secrets to .env

**Goal**: Remove hardcoded ProShop credentials from all source files and load them from a `.env` file instead. This is a security prerequisite — the credentials are currently exposed in the public GitHub repo.

**IMPORTANT**: `.env` is already in `.gitignore`, so it won't be pushed to GitHub. But the hardcoded values in the source files ARE in the repo history. Brad will rotate the password after this phase.

### 0.5.1 — Create the `.env` file in the project root

Create a file called `.env` in the project root with this content:

```env
PROSHOP_ROOT_URL=https://est.adionsystems.com
PROSHOP_USERNAME=admin@esttool.com
PROSHOP_PASSWORD=EstAdmin4626!!
PROSHOP_SCOPE=nonconformancereports:r workorders:r parts:r users:r toolpots:r purchaseorders:r contacts:r customerPo:r estimates:r
```

### 0.5.2 — Create a `.env.example` file (safe to commit)

Create a file called `.env.example` in the project root. This is a template so anyone setting up the project knows what variables are needed, but it contains no real secrets:

```env
PROSHOP_ROOT_URL=https://your-proshop-instance.adionsystems.com
PROSHOP_USERNAME=your-username@company.com
PROSHOP_PASSWORD=your-password-here
PROSHOP_SCOPE=nonconformancereports:r workorders:r parts:r users:r toolpots:r purchaseorders:r contacts:r customerPo:r estimates:r
```

### 0.5.3 — Install dotenv

The server needs to read `.env` files. Run:

```bash
npm install dotenv
```

### 0.5.4 — Add dotenv initialization to `server/index.js`

Add this as the **very first line** of `server/index.js`, before any other imports:

```js
import 'dotenv/config';
```

This loads all variables from `.env` into `process.env` before anything else runs.

### 0.5.5 — Update `server/lib/proshopClient.js`

Replace the hardcoded `PROSHOP_CONFIG` object (lines 6-11) with:

```js
export const PROSHOP_CONFIG = {
  ROOT_URL: process.env.PROSHOP_ROOT_URL || 'https://est.adionsystems.com',
  USERNAME: process.env.PROSHOP_USERNAME || '',
  PASSWORD: process.env.PROSHOP_PASSWORD || '',
  SCOPE: process.env.PROSHOP_SCOPE || 'nonconformancereports:r workorders:r parts:r users:r toolpots:r purchaseorders:r contacts:r customerPo:r estimates:r',
};
```

The fallback for `ROOT_URL` and `SCOPE` keeps the app functional if someone forgets those, but `USERNAME` and `PASSWORD` intentionally default to empty strings so the app clearly fails if the `.env` is missing (rather than silently using stale creds).

### 0.5.6 — Update test files

These 3 test files also have hardcoded credentials. Update each one to read from `process.env` instead:

**`server/test_po_263146.js`** — Replace the `PROSHOP_CONFIG` block at the top with:
```js
import 'dotenv/config';

const PROSHOP_CONFIG = {
  ROOT_URL: process.env.PROSHOP_ROOT_URL,
  USERNAME: process.env.PROSHOP_USERNAME,
  PASSWORD: process.env.PROSHOP_PASSWORD,
  SCOPE: process.env.PROSHOP_SCOPE,
};
```

**`server/test_po_details.js`** — Same replacement.

**`server/test_single_po.js`** — Same replacement.

### 0.5.7 — Update reference project files

The `reference projects/` folder has credentials scattered across many files. These are reference/archive files, not production code, but they're still in the repo. For each of the following files, replace the actual password with a placeholder comment:

**Files to update** (replace the actual password value with `YOUR_PASSWORD_HERE` or similar placeholder):

- `reference projects/Proshop_API_Probe/Last_Night_NCR.py`
- `reference projects/Proshop_API_Probe/Weekly NC Report/ncr_good.py`
- `reference projects/Proshop_API_Probe/Weekly NC Report/PowerAutomate_Integration/config.ini`
- `reference projects/Proshop_API_Probe/Weekly NC Report/PowerAutomate_Integration/config.txt`
- `reference projects/Proshop_API_Probe/Weekly NC Report/config.ini`
- `reference projects/Proshop_API_Probe/Weekly NC Report/weekly_nc_debug.py`
- `reference projects/Proshop_API_Probe/Weekly NC Report/Cursor PS Sources.txt`

For the Python files, replace the password line with:
```python
PASSWORD  = os.environ.get("PROSHOP_PASSWORD", "")  # Set in .env
```

For the `.ini` and `.txt` config files, replace the password line with:
```ini
password = SEE_ENV_FILE
```

For `Cursor PS Sources.txt`, this is a documentation/reference dump — just do a find-and-replace of the actual password string `EstAdmin4626!!` with `[REDACTED - see .env]` throughout the file.

### 0.5.8 — Verify the server still starts

```bash
npm run dev
```

The server should start and connect to ProShop normally, now reading credentials from `.env`.

### 0.5.9 — Commit

```bash
git add -A
git commit -m "phase 0.5: move proshop credentials to .env, remove hardcoded secrets"
```

**After this commit**: Brad will rotate the ProShop password, update the `.env` file with the new password, and optionally make the GitHub repo private or purge the git history.

---

## PHASE 1: Design Token System Overhaul

**Goal**: Replace the fragile dual-theme CSS with a clean token system that automatically handles both themes. This eliminates ~400 lines of brittle light-mode overrides.

**Why first**: Every subsequent phase depends on consistent color tokens. Without this, new styles will just add more overrides.

### 1.1 — Expand CSS custom properties in `src/index.css`

Replace the current `:root` and `.light` blocks (lines 6-31) with a comprehensive token set. Keep the existing variable names but add new ones:

```css
:root {
  /* Backgrounds */
  --bg-primary: #09090b;
  --bg-surface: #18181b;
  --bg-elevated: #27272a;
  --bg-hover: rgba(255, 255, 255, 0.04);
  --bg-active: rgba(255, 255, 255, 0.06);
  --bg-overlay: rgba(0, 0, 0, 0.6);

  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.10);
  --border-strong: rgba(255, 255, 255, 0.16);

  /* Text */
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --text-inverse: #09090b;

  /* Accent */
  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --accent-muted: rgba(59, 130, 246, 0.12);
  --accent-strong: rgba(59, 130, 246, 0.24);

  /* Status colors */
  --color-success: #22c55e;
  --color-warning: #eab308;
  --color-danger: #ef4444;
  --color-info: #3b82f6;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.5);

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;

  /* Transitions */
  --transition-fast: 120ms cubic-bezier(0.25, 0.1, 0.25, 1);
  --transition-normal: 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
  --transition-slow: 350ms cubic-bezier(0.25, 0.1, 0.25, 1);
  --transition-spring: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.light {
  --bg-primary: #ffffff;
  --bg-surface: #f8f8fa;
  --bg-elevated: #f0f0f2;
  --bg-hover: rgba(0, 0, 0, 0.03);
  --bg-active: rgba(0, 0, 0, 0.05);
  --bg-overlay: rgba(0, 0, 0, 0.3);

  --border-subtle: rgba(0, 0, 0, 0.06);
  --border-default: rgba(0, 0, 0, 0.10);
  --border-strong: rgba(0, 0, 0, 0.16);

  --text-primary: #18181b;
  --text-secondary: #52525b;
  --text-muted: #a1a1aa;
  --text-inverse: #fafafa;

  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-muted: rgba(37, 99, 235, 0.08);
  --accent-strong: rgba(37, 99, 235, 0.16);

  --color-success: #16a34a;
  --color-warning: #ca8a04;
  --color-danger: #dc2626;
  --color-info: #2563eb;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.12);
}
```

### 1.2 — Update Tailwind config to use CSS variables

In `tailwind.config.js`, extend the theme to reference these tokens so you can use them as Tailwind utilities:

```js
theme: {
  extend: {
    colors: {
      bg: {
        primary: 'var(--bg-primary)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        hover: 'var(--bg-hover)',
        active: 'var(--bg-active)',
      },
      text: {
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
      },
      border: {
        subtle: 'var(--border-subtle)',
        default: 'var(--border-default)',
        strong: 'var(--border-strong)',
      },
      accent: {
        DEFAULT: 'var(--accent)',
        hover: 'var(--accent-hover)',
        muted: 'var(--accent-muted)',
        strong: 'var(--accent-strong)',
      },
    },
    borderRadius: {
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
    },
    boxShadow: {
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
    },
    transitionTimingFunction: {
      smooth: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  },
},
```

### 1.3 — Update component base classes in `index.css`

Replace the `.card`, `.btn-*`, `.input` classes in the `@layer components` section. These should now use CSS variables directly so they work in both themes without any `.light` overrides:

```css
@layer components {
  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
  }

  .card-hover {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
    transition: all var(--transition-normal);
  }
  .card-hover:hover {
    border-color: var(--border-default);
    box-shadow: var(--shadow-sm);
  }

  .stat-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
    transition: all var(--transition-normal);
    cursor: default;
  }
  .stat-card:hover {
    border-color: var(--border-default);
    box-shadow: var(--shadow-sm);
  }

  .badge {
    @apply inline-flex items-center px-2.5 py-1 text-xs font-medium;
    border-radius: var(--radius-sm);
  }

  .btn-primary {
    @apply inline-flex items-center justify-center gap-2 px-4 py-2.5 font-medium text-sm;
    background: var(--accent);
    color: white;
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }
  .btn-primary:hover {
    background: var(--accent-hover);
  }
  .btn-primary:active {
    transform: scale(0.98);
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    @apply inline-flex items-center justify-center gap-2 px-4 py-2.5 font-medium text-sm;
    background: var(--bg-elevated);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }
  .btn-secondary:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }
  .btn-secondary:active {
    transform: scale(0.98);
  }

  .btn-ghost {
    @apply inline-flex items-center justify-center gap-2 px-3 py-2 font-medium text-sm;
    color: var(--text-secondary);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }
  .btn-ghost:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn-danger {
    @apply inline-flex items-center justify-center gap-2 px-4 py-2.5 font-medium text-sm text-white;
    background: var(--color-danger);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }
  .btn-danger:hover {
    filter: brightness(1.1);
  }
  .btn-danger:active {
    transform: scale(0.98);
  }

  .input {
    @apply w-full px-3 py-2.5 text-sm;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    transition: all var(--transition-fast);
  }
  .input::placeholder {
    color: var(--text-muted);
  }
  .input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }

  .select {
    @apply input appearance-none cursor-pointer;
  }

  .skeleton {
    @apply animate-pulse;
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
  }

  .kanban-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.5rem;
    transition: all var(--transition-normal);
  }
  .kanban-card:hover {
    border-color: var(--border-default);
    box-shadow: var(--shadow-sm);
  }
}
```

### 1.4 — Delete ALL `.light` overrides

**This is the big payoff.** Delete everything from line ~63 onward in `index.css` that starts with `.light` in the `@layer components` section. All of it. The CSS variables now handle both themes automatically.

**IMPORTANT**: Some `.light` overrides in the `@layer base` section handle things like scrollbar colors and heading colors. Keep the scrollbar overrides (lines 46-56 approximately) and the `body` rule (lines 33-37). Delete the rest of the `.light` base overrides (heading color overrides, `.light .text-zinc-*` remappings, etc.) — these will be handled by migrating components to use token-based classes instead of hardcoded zinc classes.

**Do not delete everything at once.** Delete in sections, test after each deletion, and fix any visual regressions by updating the affected component to use CSS variable classes instead.

### 1.5 — Commit
```bash
git add -A
git commit -m "phase 1: design token system overhaul"
```

---

## PHASE 2: Typography and Spacing System

**Goal**: Establish clear visual hierarchy and breathing room. Apple and UniFi use generous spacing and strong typographic contrast.

### 2.1 — Add font import to `index.html`

Add these in the `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Note: The app already uses Inter in the font stack. This just ensures it's always loaded from Google Fonts rather than relying on the system having it installed. If the intranet machines don't have internet access, skip this step — the system font fallback will work fine.

### 2.2 — Define a type scale

Add these utility classes to `index.css` at the bottom of the `@layer components` section:

```css
  /* Type scale — use these instead of arbitrary text-sm / text-xs everywhere */
  .text-display {
    font-size: 1.875rem; /* 30px */
    line-height: 2.25rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    color: var(--text-primary);
  }
  .text-title {
    font-size: 1.25rem; /* 20px */
    line-height: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--text-primary);
  }
  .text-heading {
    font-size: 0.9375rem; /* 15px */
    line-height: 1.375rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  .text-body {
    font-size: 0.875rem; /* 14px */
    line-height: 1.375rem;
    font-weight: 400;
    color: var(--text-secondary);
  }
  .text-caption {
    font-size: 0.75rem; /* 12px */
    line-height: 1rem;
    font-weight: 500;
    color: var(--text-muted);
  }
  .text-mono {
    font-family: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.8125rem; /* 13px */
    line-height: 1.25rem;
  }
```

### 2.3 — Increase base spacing in Layout.tsx

In `src/components/Layout.tsx`, update the main content area padding from `p-4 lg:p-6` to `p-6 lg:p-8`. This gives every page more breathing room:

```tsx
<main className={cn('flex-1 p-6 lg:p-8', mainScrollLocked ? 'overflow-hidden' : 'overflow-y-auto')}>
```

### 2.4 — Update page header patterns

Each page should use consistent heading sizes. When updating individual pages (Phases 4+), apply this pattern at the top of each page:

```tsx
{/* Page header — consistent across all pages */}
<div className="mb-8">
  <h1 className="text-display">Dashboard</h1>
  <p className="text-body mt-1">Overview of engineering work orders and activity.</p>
</div>
```

**Do not update all pages at once.** Update each page's header as you work on that page in later phases.

### 2.5 — Commit
```bash
git add -A
git commit -m "phase 2: typography and spacing system"
```

---

## PHASE 3: Sidebar and Header Polish

**Goal**: Make the sidebar feel like a UniFi navigation — clean, quiet, with a subtle active indicator.

### 3.1 — Update sidebar in Layout.tsx

The sidebar should feel calmer. Key changes:
- Wider default width: `w-56` → `w-60`
- Slightly larger nav items with more padding
- Active state: subtle left accent bar instead of a bordered pill
- Background: use CSS variable `var(--bg-surface)` instead of `bg-zinc-900`
- Remove the border on active nav items — use a subtle background tint and a 2px left accent bar instead

Replace the sidebar `<aside>` background class:
```
Before: bg-zinc-900 border-r border-white/[0.06]
After:  bg-[var(--bg-surface)] border-r border-[var(--border-subtle)]
```

Replace the active NavLink styles:
```
Before: 'bg-accent/10 text-accent border border-accent/20'
After:  'bg-[var(--accent-muted)] text-[var(--accent)] border-l-2 border-l-[var(--accent)] border-y-0 border-r-0'
```

Replace inactive NavLink styles:
```
Before: 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
After:  'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-l-2 border-l-transparent border-y-0 border-r-0'
```

### 3.2 — Update header bar in Layout.tsx

Make the header feel more minimal:
- Remove the `backdrop-blur-sm` — it can cause performance issues on lower-end machines
- Use token-based colors:
```
Before: border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-sm
After:  border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]
```

Update the search input placeholder and text colors to use CSS variables:
```
Before: text-zinc-200 placeholder:text-zinc-500
After:  text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
```

### 3.3 — Sidebar bottom section

Update the user info / logout area border:
```
Before: border-t border-white/[0.06]
After:  border-t border-[var(--border-subtle)]
```

Update all other `border-white/[0.06]` references in Layout.tsx to `border-[var(--border-subtle)]`.

Update all `bg-zinc-800` hover states in Layout.tsx to `bg-[var(--bg-hover)]`.

Update all `text-zinc-400` to `text-[var(--text-muted)]` and `text-zinc-200` to `text-[var(--text-primary)]` in Layout.tsx.

### 3.4 — Commit
```bash
git add -A
git commit -m "phase 3: sidebar and header polish"
```

---

## PHASE 4: Dashboard Page — Reference Implementation

**Goal**: Fully modernize the Dashboard page as the template for all other pages.

### 4.1 — Stat cards

Update the `StatCard` component in `src/pages/Dashboard.tsx`:

- Increase padding: the stat card wrapper should have `p-5` or more
- Make the icon container rounder and slightly larger: `p-3 rounded-xl`
- Add spacing between the number and label
- Use the type scale: value should be `text-display` (or `text-2xl font-bold`), label should be `text-caption`, subtext stays `text-caption` but lighter

The icon background colors (`bg-blue-600`, `bg-red-600`, etc.) are fine — these are intentional accent colors and don't need to change per theme.

### 4.2 — Table modernization

The "My Schedule" table in Dashboard.tsx needs:
- **More row height**: table cells should have `py-3.5` instead of `py-2.5`
- **Rounder corners on the table container**: wrap the `<table>` in a div with `rounded-xl overflow-hidden border border-[var(--border-subtle)]`
- **Header row**: use `text-caption` styling, uppercase text, slightly more padding
- **Zebra striping removal**: UniFi doesn't use zebra stripes. Use a single hover state: `hover:bg-[var(--bg-hover)]`
- **Border between rows**: `divide-y divide-[var(--border-subtle)]` instead of `divide-white/[0.04]`

### 4.3 — Dropdown modernization

The hand-rolled dropdowns (AssigneeCell, MaterialCell, PriorityCell in Dashboard.tsx) should be updated:
- Background: `bg-[var(--bg-elevated)]` instead of `bg-zinc-800`
- Border: `border border-[var(--border-default)]` instead of `border-white/10`
- Shadow: `shadow-lg` (which now uses the token-based shadow)
- Rounded: `rounded-xl` instead of `rounded-lg`
- Item hover: `hover:bg-[var(--bg-hover)]` instead of `hover:bg-zinc-700`
- Add a subtle entrance animation: `animate-fade-in` or use framer-motion `<motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>` 

**NOTE**: Ideally these would be refactored to use Radix UI Popover/DropdownMenu (which is already installed). But that's a bigger refactor. For now, just update the styling. A future phase can swap the implementation.

### 4.4 — "My Info" section cards

The personal info cards (My NCRs, My Projects) use `bg-zinc-800/50 border border-white/[0.06]`. Replace with:
```
bg-[var(--bg-elevated)] border border-[var(--border-subtle)]
```

Update all text color classes inside these cards:
- `text-zinc-100` → `text-[var(--text-primary)]`
- `text-zinc-400` → `text-[var(--text-secondary)]`
- `text-zinc-500` → `text-[var(--text-muted)]`

### 4.5 — Page header

Add a proper page header to Dashboard.tsx:
```tsx
<div className="mb-8">
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Overview of engineering activity</p>
    </div>
    {/* Keep any existing controls/buttons here */}
  </div>
</div>
```

### 4.6 — Commit
```bash
git add -A
git commit -m "phase 4: dashboard page modernized"
```

---

## PHASE 5: Schedule Page Polish

**Goal**: Apply the same patterns from Phase 4 to the Schedule page, which is the most complex and heavily-used page.

### 5.1 — Apply token-based colors

Do a find-and-replace across `src/pages/Schedule.tsx`:
- `bg-zinc-800` → `bg-[var(--bg-elevated)]`
- `bg-zinc-700` → `bg-[var(--bg-elevated)]`
- `border-white/10` → `border-[var(--border-default)]`
- `border-white/[0.06]` → `border-[var(--border-subtle)]`
- `border-white/[0.04]` → `border-[var(--border-subtle)]`
- `text-zinc-100` → `text-[var(--text-primary)]`
- `text-zinc-200` → `text-[var(--text-primary)]`
- `text-zinc-300` → `text-[var(--text-secondary)]`
- `text-zinc-400` → `text-[var(--text-secondary)]`
- `text-zinc-500` → `text-[var(--text-muted)]`
- `hover:bg-zinc-700` → `hover:bg-[var(--bg-hover)]`
- `hover:bg-zinc-800` → `hover:bg-[var(--bg-hover)]`
- `hover:bg-zinc-800/50` → `hover:bg-[var(--bg-hover)]`

**CAUTION**: Do these replacements one at a time with a search, not as a blind global replace. Some classes appear in conditional expressions or combined with other classes. Verify each replacement makes sense in context.

### 5.2 — Table styling

Apply the same table improvements as Phase 4.2:
- Increase cell padding
- Token-based dividers
- Cleaner header row

### 5.3 — Filter bar

The filter/search bar at the top of Schedule should feel like a unified toolbar:
- Wrap all filter controls in a single `card` container with `flex items-center gap-3 flex-wrap`
- Inputs and selects should use the `.input` / `.select` base class (which now uses tokens)

### 5.4 — Commit
```bash
git add -A
git commit -m "phase 5: schedule page polished"
```

---

## PHASE 6: Remaining Pages — Systematic Token Migration

**Goal**: Apply token-based colors to every remaining page. This is repetitive but essential for consistency.

### Process for each page:

For each file in `src/pages/` (excluding Dashboard.tsx and Schedule.tsx which are done):
1. Open the file
2. Apply the same find-and-replace patterns from Phase 5.1
3. Update any page-specific card containers or sections to use `var(--bg-surface)`, `var(--bg-elevated)`, `var(--border-subtle)`
4. Update the page header to use the standard pattern from Phase 4.5
5. Test that the page renders in both light and dark mode
6. Commit after every 2-3 pages:

```bash
git add -A
git commit -m "phase 6: token migration for [PageName], [PageName]"
```

**Page list** (in suggested order — simplest first):
1. `Settings.tsx`
2. `Versions.tsx`
3. `Completed.tsx`
4. `Calendar.tsx`
5. `Import.tsx`
6. `Projects.tsx`
7. `Tools.tsx`
8. `Machines.tsx`
9. `Kanban.tsx`
10. `Analytics.tsx`
11. `CostAnalysis.tsx`
12. `TimeTracking.tsx`
13. `NonConformances.tsx`
14. `RevisionAlerts.tsx`
15. `MaterialTracking.tsx`
16. `TVDashboard.tsx`
17. `TVConfig.tsx`
18. `Login.tsx`
19. `knowledge/KnowledgeListPage.tsx`
20. `knowledge/KnowledgeArticlePage.tsx`
21. `knowledge/KnowledgeNewPage.tsx`
22. `knowledge/KnowledgeEditPage.tsx`

Also update these shared components:
- `components/WorkOrderDrawer.tsx`
- `components/MaterialTrackingContent.tsx`
- `components/ErrorBoundary.tsx`

---

## PHASE 7: Motion and Micro-interactions

**Goal**: Add the "smoothness" factor. This is what separates a functional app from a premium-feeling one.

### 7.1 — Page transitions

In `src/App.tsx`, wrap the route content with a framer-motion `AnimatePresence` and `motion.div`:

```tsx
import { AnimatePresence, motion } from 'framer-motion';

// Inside the Layout's Outlet area (Layout.tsx), wrap content:
// The Outlet itself can't be wrapped directly, so add the animation in each page component
```

**Simpler approach**: Add a fade-in to the `<main>` content area in Layout.tsx. Instead of wrapping every page, just add a CSS animation to the main area when the route changes:

In `index.css`, add:
```css
@keyframes pageEnter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.page-enter {
  animation: pageEnter 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
}
```

In Layout.tsx, add a key to the main content area based on location:
```tsx
const location = useLocation(); // already imported

<main key={location.pathname} className={cn('flex-1 p-6 lg:p-8 page-enter', ...)}>
```

This gives every page a subtle fade-up on navigation.

### 7.2 — Card hover states

The `.card-hover` and `.stat-card` classes already have transitions. Make them slightly more pronounced:

Add to the hover state:
```css
.stat-card:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
```

### 7.3 — Button press feedback

The `active:scale-[0.98]` already exists on buttons. Ensure the transition timing is smooth by adding `transition: all var(--transition-fast)` to all button base classes (already done in Phase 1 if you used the provided CSS).

### 7.4 — Sidebar nav animation

Add a subtle transition to the sidebar nav link active state bar. The `border-l-2` should animate its color:

```css
/* In the NavLink classes */
transition-all duration-200
```

This is already partially there (`transition-all duration-150`). Just ensure it's present.

### 7.5 — Toast styling

The Sonner toast in `App.tsx` already adapts to theme. Update its style to use CSS variables for consistency:

```tsx
toastOptions={{
  style: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
  },
}}
```

### 7.6 — Commit
```bash
git add -A
git commit -m "phase 7: motion and micro-interactions"
```

---

## PHASE 8: Dropdown and Popover Refinement

**Goal**: Make all dropdowns feel polished and consistent.

### 8.1 — Create a shared dropdown style

Rather than updating every hand-rolled dropdown individually, create a reusable CSS class:

In `index.css`:
```css
.dropdown-menu {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  animation: dropdownEnter 0.15s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
}
.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}
.dropdown-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.dropdown-item[data-active="true"] {
  background: var(--accent-muted);
  color: var(--accent);
}

@keyframes dropdownEnter {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

### 8.2 — Apply to all dropdowns

In every file that has hand-rolled dropdown menus (Dashboard.tsx, Schedule.tsx, etc.), replace the dropdown container classes with `dropdown-menu` and item classes with `dropdown-item`. For active items, add `data-active="true"`.

### 8.3 — Commit
```bash
git add -A
git commit -m "phase 8: unified dropdown styling"
```

---

## PHASE 9: Work Order Drawer Polish

**Goal**: The drawer is a high-use component that deserves extra attention.

### 9.1 — Overlay

The drawer uses Radix Dialog (good). Update the overlay styling:
- Overlay: `bg-[var(--bg-overlay)]` with `backdrop-blur-sm` (blur is fine here since it's a focused overlay)
- Add entrance animation: fade in over 200ms

### 9.2 — Drawer panel

- Background: `bg-[var(--bg-primary)]`
- Border: `border-l border-[var(--border-subtle)]`
- Shadow: `shadow-lg`
- Rounded corners on the left side: `rounded-l-2xl`
- Slide-in animation from the right (framer-motion or CSS)

### 9.3 — Form fields inside the drawer

All `<select>`, `<input>`, and `<textarea>` elements should use the `.input` / `.select` classes for consistency.

### 9.4 — Internal color updates

Apply the same token migration as other components:
- All `zinc-*` → CSS variable equivalents
- All `border-white/*` → `border-[var(--border-*)]`

### 9.5 — Commit
```bash
git add -A
git commit -m "phase 9: work order drawer polished"
```

---

## PHASE 10: Final Cleanup

### 10.1 — Remove dead CSS

After all pages are migrated, review `index.css` for any remaining `.light` overrides that are no longer needed. Delete them.

### 10.2 — Verify light mode comprehensively

Visit every page in light mode and check for:
- Text that's invisible (white on white)
- Borders that disappeared
- Backgrounds that look wrong
- Contrast issues

Fix any issues by ensuring the component uses CSS variable classes, not hardcoded zinc classes.

### 10.3 — Verify dark mode

Same check in dark mode.

### 10.4 — Scrollbar update

Update the scrollbar styles to use CSS variables:
```css
::-webkit-scrollbar-track {
  background: var(--bg-primary);
}
::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}
```

Delete the `.light ::-webkit-scrollbar-*` overrides — the variables handle it now.

### 10.5 — Final commit and merge
```bash
git add -A
git commit -m "phase 10: final cleanup and verification"
git checkout main
git merge ui-modernization
```

---

## Summary of Design Principles to Maintain

When making any styling decision, ask:

1. **Would Apple do this?** — Generous spacing, clear hierarchy, quiet confidence.
2. **Would UniFi do this?** — Clean data presentation, muted chrome, focus on content.
3. **Is this using a CSS variable?** — If you're typing a raw color like `#18181b` or `zinc-800`, stop and use a token instead.
4. **Does this work in both themes?** — If you need a `.light` override, the approach is wrong. Use variables.
5. **Is there motion?** — Every state change should have a transition. Hover, focus, active, enter, exit.

---

## Emergency Rollback

If the app is completely broken and you can't fix it:

```bash
git checkout main
git branch -D ui-modernization
```

This deletes all changes and returns to the original working state. You lose all progress but the app works again.

For partial rollback to a specific phase:
```bash
git log --oneline
# Find the commit hash for "backup: before phase X"
git checkout <hash> -- .
```
