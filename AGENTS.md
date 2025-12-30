# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Karakeep is a self-hostable bookmark-everything app with AI-powered tagging and summarization. It's a monorepo managed with Turborepo.

## Common Commands

```bash
# Development
pnpm web              # Start the web app (dev mode)
pnpm workers          # Start background workers

# Quality checks
pnpm typecheck        # Typecheck all packages
pnpm lint             # Lint all packages
pnpm lint:fix         # Fix linting issues
pnpm format           # Check formatting
pnpm format:fix       # Fix formatting
pnpm preflight        # Run typecheck, lint, and format

# Testing
pnpm test             # Run all tests
pnpm --filter @karakeep/trpc test  # Run tests for a specific package

# Database
pnpm db:generate --name description_of_schema_change  # Generate migration after schema changes
pnpm db:migrate       # Apply migrations
pnpm db:studio        # Open Drizzle Studio
```

## Architecture

### Applications (`apps/`)

- **web**: Main Next.js app (app router). Entry point for the web UI. Uses next-auth for authentication.
- **workers**: Background job processors. Each worker type handles a specific queue (crawling, AI inference, search indexing, etc.). See `apps/workers/index.ts` for the list of workers.
- **browser-extension**: Chrome/Firefox extension for quick bookmarking.
- **mobile**: Expo-based mobile app.
- **cli**: Command-line interface for the API.
- **mcp**: Model Context Protocol server.
- **landing**: Marketing landing page.

### Packages (`packages/`)

- **trpc**: **Core business logic lives here.** tRPC routers define all operations (bookmarks, lists, tags, etc.). Uses `authedProcedure` for authenticated routes and `adminProcedure` for admin-only routes.
- **api**: Hono-based REST API that wraps tRPC. Routes in `packages/api/routes/`. OpenAPI spec generated from this.
- **db**: Drizzle ORM schema and migrations. Single schema file at `packages/db/schema.ts`. Uses SQLite.
- **shared**: Configuration (`config.ts` parses all env vars), types, and utilities shared across packages.
- **shared-react**: React hooks and components shared between web and mobile.
- **shared-server**: Server-side utilities including the job queue system. Queues defined in `packages/shared-server/src/queues.ts`.

### Data Flow

1. **Web/API requests** → `packages/api` (Hono) → `packages/trpc` (business logic) → `packages/db` (Drizzle)
2. **Background jobs**: tRPC enqueues jobs → Workers poll queues → Workers process jobs (crawling, AI, search, etc.)

### Key Patterns

- **tRPC procedures**: Use `authedProcedure` for user-authenticated routes, `adminProcedure` for admin routes, `publicProcedure` for unauthenticated routes.
- **Configuration**: All env vars are parsed in `packages/shared/config.ts` with Zod validation.
- **Queues**: Job queues are defined in `packages/shared-server/src/queues.ts`. Workers consume from these queues.
- **UI Components**: shadcn/ui components in `apps/web/components/ui/`. Uses Tailwind CSS.

## Database Schema

The schema is in `packages/db/schema.ts`. Key tables:
- `bookmarks`: Core bookmark records with `type` (link, text, asset)
- `bookmarkLinks`: Link-specific data (URL, crawled content)
- `bookmarkTags`, `tagsOnBookmarks`: Tag system with many-to-many relationship
- `bookmarkLists`, `bookmarksInLists`: List organization
- `assets`: File storage metadata (images, PDFs, archives)

After modifying the schema, run `pnpm db:generate --name description` to create a migration.

## Workers

Background workers are defined in `apps/workers/workers/`. Each worker processes a specific queue:
- **crawlerWorker**: Fetches and parses link content
- **inferenceWorker**: AI tagging and summarization
- **searchWorker**: Meilisearch indexing
- **feedWorker**: RSS feed polling
- **videoWorker**: Video downloads via yt-dlp
- **webhookWorker**: Webhook delivery
- **ruleEngineWorker**: Automated rules processing
- **backupWorker**: User data backups
