# Developer Setup Guide

> Quick setup guide for developers working on DrMigrate Azure Sync

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | 20.x LTS or higher | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 8.x or higher | `npm install -g pnpm` |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

### Verify Installation

```bash
node --version    # Should be v20.x.x or higher
pnpm --version    # Should be 8.x.x or higher
git --version     # Any recent version
```

---

## Quick Start (One Command)

After cloning the repository, run:

```bash
pnpm setup
```

This single command will:
1. ✅ Install all dependencies
2. ✅ Generate the Prisma client
3. ✅ Create the SQLite database with all tables
4. ✅ Copy environment example files (if not already present)
5. ✅ Seed built-in scripts (for Lift & Cleanse module)

Then start the development servers:

```bash
pnpm dev
```

---

## Manual Setup (Step by Step)

If you prefer to run each step manually:

### 1. Clone the Repository

```bash
git clone <repository-url>
cd drmigrate-azsync
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up Environment Files

**API Environment** (`apps/api/.env`):

```bash
# Windows
copy apps\api\env.example.txt apps\api\.env

# macOS/Linux
cp apps/api/env.example.txt apps/api/.env
```

**Web Environment** (`apps/web/.env.local`):

```bash
# Windows
copy apps\web\env.example.txt apps\web\.env.local

# macOS/Linux
cp apps/web/env.example.txt apps/web/.env.local
```

### 4. Generate Prisma Client

```bash
cd apps/api
npx prisma generate
```

### 5. Create Database

```bash
npx prisma db push
```

This creates the SQLite database file at `apps/api/data/drmigrate.db`.

### 6. Start Development Servers

```bash
# From root directory
cd ../..
pnpm dev
```

---

## Development URLs

Once running, access the application at:

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Next.js web application |
| **API** | http://localhost:4000 | Fastify backend server |
| **API Docs** | http://localhost:4000/docs | Swagger UI documentation |
| **Health Check** | http://localhost:4000/api/v1/health | API health endpoint |

---

## Available Scripts

Run these from the **root directory**:

| Command | Description |
|---------|-------------|
| `pnpm setup` | One-time setup for new developers |
| `pnpm dev` | Start all development servers |
| `pnpm build` | Build all packages for production |
| `pnpm lint` | Run linting across all packages |
| `pnpm type-check` | Run TypeScript type checking |
| `pnpm clean` | Clean all build artifacts and node_modules |
| `pnpm format` | Format code with Prettier |

### API-Specific Scripts

Run these from `apps/api`:

| Command | Description |
|---------|-------------|
| `npx prisma generate` | Regenerate Prisma client |
| `npx prisma db push` | Push schema changes to database |
| `npx prisma studio` | Open Prisma Studio (database GUI) |
| `npx prisma migrate dev` | Create a migration (for production) |

---

## Project Structure

```
drmigrate-azsync/
├── apps/
│   ├── api/                    # Fastify backend
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Database schema
│   │   ├── src/
│   │   │   ├── index.ts        # Server entry point
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic
│   │   │   └── lib/            # Shared utilities
│   │   └── data/               # SQLite database (gitignored)
│   │
│   └── web/                    # Next.js frontend
│       └── src/
│           ├── app/            # Next.js App Router pages
│           ├── components/     # React components
│           └── lib/            # Utilities and API client
│
├── packages/
│   └── shared-types/           # TypeScript types shared across apps
│
├── docs/                       # Documentation
└── turbo.json                  # Turborepo configuration
```

---

## Environment Configuration

### API Environment Variables (`apps/api/.env`)

```env
# Database (REQUIRED)
DATABASE_URL=file:./data/drmigrate.db

# Server (optional - these are defaults)
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Web Environment Variables (`apps/web/.env.local`)

```env
# API URL (include /api/v1)
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

> **Important:** Azure credentials (tenant ID, client ID, subscription, etc.) are **NOT** configured in environment files. Configure them through the **Settings** page in the application UI at http://localhost:3000/settings

---

## Troubleshooting

### DATABASE_URL Not Found

**Error:**
```
Error: Environment variable not found: DATABASE_URL.
```

**Solution:** Create the `.env` file in `apps/api/`:

```bash
# Windows
copy apps\api\env.example.txt apps\api\.env

# macOS/Linux
cp apps/api/env.example.txt apps/api/.env
```

Or run `pnpm setup:env` to auto-create environment files.

### Prisma Client Not Generated

**Error:**
```
Error: @prisma/client did not initialize yet. Please run "prisma generate"
```

**Solution:**
```bash
cd apps/api
npx prisma generate
npx prisma db push
```

### Port Already in Use

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Windows - find and kill the process
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :3000
kill -9 <PID>
```

### Database Reset

If you need to reset the database:

```bash
cd apps/api

# Delete the database file
rm data/drmigrate.db    # macOS/Linux
del data\drmigrate.db   # Windows

# Recreate it
npx prisma db push
```

### Fresh Start

For a completely fresh environment:

```bash
pnpm clean
pnpm setup
pnpm dev
```

---

## Azure Setup (Optional)

To connect to Azure Migrate, you'll need:

1. **Azure Subscription** with Azure Migrate project
2. **App Registration** in Azure AD with permissions:
   - `Azure Service Management / user_impersonation`
   - `Microsoft Graph / User.Read`
3. **Recovery Services Vault** (for replication features)

Configure these in the application **Settings** page or via environment variables.

---

## Local Assets (Fonts, Images, Icons)

This application is designed for **air-gapped environments** with zero external network requests. All assets are stored locally.

### Asset Directory Structure

```
apps/web/public/assets/
├── fonts/          # Local font files (.woff2)
│   ├── Inter-Regular.woff2
│   ├── Inter-Medium.woff2
│   ├── Inter-SemiBold.woff2
│   └── Inter-Bold.woff2
├── images/         # Logos, favicons, illustrations
│   └── logo-dark.svg
├── icons/          # Custom SVG icons (optional)
└── README.md       # Detailed asset documentation
```

### Adding a New Font

1. Download the font in `.woff2` format (best for web)
2. Place files in `apps/web/public/assets/fonts/`
3. Update `apps/web/src/app/layout.tsx`:

```tsx
import localFont from 'next/font/local';

const myFont = localFont({
  src: [
    { path: '../../public/assets/fonts/MyFont-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/assets/fonts/MyFont-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-my-font',
  display: 'swap',
});
```

4. Apply the font variable in your Tailwind config or CSS

### Adding a New Logo/Image

1. Place the image in `apps/web/public/assets/images/`
2. Reference it using the public path:

```tsx
import Image from 'next/image';

// In your component
<Image 
  src="/assets/images/my-logo.svg" 
  alt="My Logo" 
  width={130} 
  height={32} 
/>
```

Or in CSS:

```css
.my-class {
  background-image: url('/assets/images/my-image.png');
}
```

### Using Icons

**Primary method:** Use `lucide-react` (bundled via npm, no external requests):

```tsx
import { Server, Database, Settings } from 'lucide-react';

<Server className="h-5 w-5 text-primary" />
```

Browse available icons at [lucide.dev/icons](https://lucide.dev/icons)

**Custom icons:** For icons not available in lucide-react:

1. Add SVG file to `apps/web/public/assets/icons/`
2. Reference via Image component or create a React component

### Verifying No External Requests

After adding assets, verify the app makes no external requests:

1. Build: `pnpm build`
2. Start: `pnpm start`
3. Open browser DevTools → Network tab
4. Refresh and confirm no requests to external domains

> See `apps/web/public/assets/README.md` for complete documentation

---

## Getting Help

- Check the [Architecture Documentation](./ARCHITECTURE_CURRENT.md)
- Review the [API Documentation](http://localhost:4000/docs) (when running)
- Check existing [GitHub Issues](<repository-issues-url>)

---

*Last updated: January 2026*
