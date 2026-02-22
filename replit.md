# Motrice Platform

## Overview
Motrice is a social-sport platform focused on real territory sessions, event discovery, participation, and continuity. It combines consumer UX (Explore/Map/Agenda) with operational workflows for coaches and partnered venues.

## Current State
- Frontend: React 18 + Vite, served on port 5000
- Backend: Express.js on port 4000, using Node.js built-in SQLite (node:sqlite, requires Node.js 22+)
- Node.js version: v22.22.0
- Monorepo with npm workspaces: backend, frontend, partner-portal

## Project Architecture
- `frontend/` - React SPA with Vite, uses mock localStorage API + real backend API for coach/admin
- `backend/` - Express REST API with SQLite database, handles coach, admin, events, billing
- `partner-portal/` - Separate partner management portal
- `MOTRICE_PROJECT_BRIEF.md` - Detailed project specification

### Key Architecture Notes
- Hybrid data layer: Convenzioni uses mock localStorage, coach/admin uses real backend
- Frontend proxies `/api` requests to backend on port 4000 via Vite config
- Auth is placeholder/mock (no real OAuth)
- Italian language UI

## Environment Variables
- JWT_SECRET, DB_PATH, CORS_ORIGIN, PORT=4000
- SEED_ON_BOOT=true, ALLOW_DEV_AUTH_HEADER=true
- STRIPE_ENABLED=false, CLAMAV_ENABLED=false

## Workflow
- Single workflow "Start application" runs both backend (nodemon) and frontend (vite) via concurrently

## Recent Changes
- 2026-02-22: Fixed Node.js version compatibility - upgraded to v22 for node:sqlite support
