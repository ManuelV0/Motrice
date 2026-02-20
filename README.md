# Motrice

Motrice e una piattaforma social sportiva orientata a sessioni reali sul territorio.
Monorepo React + Express con SQLite in sviluppo, UX operativa e monetizzazione semplificata su 2 piani: Free / Premium.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite (dev), struttura pronta per PostgreSQL
- Billing: provider abstraction (`dev` attivo, `stripe` scaffold)

## Piani
### Free
- RSVP eventi
- Creazione eventi fino a 3/mese
- Filtri base (sport, data)
- Reliability base

### Premium
- Eventi illimitati
- Filtri avanzati (distance, level, time-of-day)
- Agenda Week/Month
- Add to Calendar (ICS)
- Notifications center

## Entitlements (single source of truth)
`frontend/src/services/entitlements.js`
- `maxEventsPerMonth`
- `canUseAdvancedFilters`
- `canUseAgendaWeekMonth`
- `canExportICS`
- `canUseNotifications`

## Subscription state (dev)
`localStorage` con oggetto:
- `plan`: `free | premium`
- `status`: `active | inactive | trialing | past_due`
- `current_period_end`
- `provider: dev`

Gestione dev in `/account`:
- `Activate Premium (dev)`
- `Deactivate Premium`

## Billing backend scaffolding (Stripe-ready)
Route:
- `GET /api/billing/subscription`
- `POST /api/billing/create-checkout-session`
- `POST /api/billing/create-portal-session`
- `POST /api/billing/webhook`

Provider abstraction:
- `backend/services/billingProvider.js`
- `backend/services/providers/devProvider.js`
- `backend/services/providers/stripeProvider.js`

Se chiavi Stripe non sono configurate, viene usato automaticamente il provider `dev`.

## Environment
`backend/.env.example`:
- `PORT`, `JWT_SECRET`, `DB_PATH`, `CORS_ORIGIN`, `SEED_ON_BOOT`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PREMIUM`

## Local run
```bash
cp backend/.env.example backend/.env
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
