# Online Voting System

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![tRPC](https://img.shields.io/badge/tRPC-11-2596BE?logo=trpc&logoColor=white)

A modern, full-stack web application for running secure online elections — from candidate nominations and voter registration to live results and post-election reporting.

Admins can create and manage elections, register candidates, and monitor turnout in real time, while voters can browse active elections, cast votes securely, and track results — all from a responsive dashboard.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Future Improvements](#future-improvements)

## Features

- **Role-based dashboards** — separate experiences for Admins and Voters
- **Election management** — create, schedule, and manage the full lifecycle of elections
- **Candidate management** — add candidates with photos, bios, and manifestos (via Cloudinary uploads)
- **Secure voting flow** — one vote per voter per election, enforced server-side
- **Live results & analytics** — real-time vote tallies and result charts
- **User management** — admin tools for managing, suspending, and reviewing voter accounts
- **Authentication** — email/password auth with email verification and password reset (via Better Auth)
- **Notifications** — in-app notifications for election and account activity
- **Audit & activity logs** — track key actions for accountability
- **Responsive UI** — built with Tailwind CSS and accessible, themeable components

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4, Base UI, Lucide Icons |
| API Layer | [tRPC](https://trpc.io) + TanStack Query |
| Database | [Neon Postgres](https://neon.tech) (serverless) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Auth | [Better Auth](https://better-auth.com) |
| File Uploads | [Cloudinary](https://cloudinary.com) |
| Email | Nodemailer via Gmail SMTP |
| Forms & Validation | React Hook Form + Zod |
| Charts | Recharts |
| Package Manager | pnpm |

## Installation

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io)
- A [Neon](https://neon.tech) Postgres database
- A [Cloudinary](https://cloudinary.com) account
- A Gmail account with an [App Password](https://myaccount.google.com/apppasswords) enabled

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/karimsaabir9/Online-Voting-System.git
cd Online-Voting-System

# 2. Install dependencies
pnpm install

# 3. Set up environment variables (see below)
cp .env.example .env.local

# 4. Push the database schema
pnpm db:push

# 5. Seed the first admin account
pnpm db:seed

# 6. Start the development server
pnpm dev
```

## Environment Variables

Create a `.env.local` file in the project root (see `.env.example` for reference):

```bash
# Neon Postgres (pooled connection string, from the Neon dashboard)
DATABASE_URL=

# Better Auth (generate a random 32+ char secret, e.g. `openssl rand -base64 32`)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000

# Gmail SMTP (transactional email — verification, password reset)
# GMAIL_APP_PASSWORD is a 16-character App Password generated at
# https://myaccount.google.com/apppasswords (requires 2-Step Verification enabled)
GMAIL_USER=
GMAIL_APP_PASSWORD=

# Cloudinary (candidate photo / election banner uploads)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Seed script — creates the first Admin account
ADMIN_SEED_EMAIL=
ADMIN_SEED_PASSWORD=
```

## Running Locally

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

To use the app end-to-end locally, run `pnpm db:push` to sync the schema and `pnpm db:seed` to create your first admin login before starting the dev server.

## Project Structure

```
src/
├── app/                  # Next.js App Router routes
│   ├── (auth)/           # Login, register, password reset, email verification
│   ├── admin/            # Admin dashboard, elections, users
│   ├── voter/            # Voter dashboard, elections, votes, notifications
│   ├── settings/         # Account/profile settings
│   ├── suspended/        # Suspended-account screen
│   └── api/              # API routes (tRPC, auth, admin endpoints)
├── components/           # Shared UI components (ui/, shared/)
├── features/             # Feature modules (auth, elections, candidates,
│                         #   voting, results, notifications, users, dashboard, landing)
├── server/
│   ├── api/routers/      # tRPC routers (elections, candidates, voting, users, ...)
│   ├── auth/             # Better Auth configuration
│   └── db/               # Drizzle schema, relations, and seed script
├── lib/                  # Shared utilities (tRPC client, helpers)
├── providers/            # React context providers
└── schemas/              # Zod validation schemas
```

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the development server |
| `pnpm build` | Build the app for production |
| `pnpm start` | Start the production server |
| `pnpm db:generate` | Generate Drizzle migration files from the schema |
| `pnpm db:push` | Push the current schema to the database |
| `pnpm db:studio` | Open Drizzle Studio to browse/edit data |
| `pnpm db:seed` | Seed the database with the initial admin account |

## Future Improvements

- Multi-factor authentication for voters and admins
- Blockchain-backed vote verification for enhanced auditability
- Bulk candidate/voter import via CSV
- Downloadable PDF/CSV election reports
- Multi-language (i18n) support
- Automated end-to-end test suite
- Public API for third-party election monitoring
