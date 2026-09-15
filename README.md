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

## Android

Il wrapper Android usa Capacitor e incorpora la build Vite del frontend.
Sono richiesti Node.js 22 e Java 21. L'application ID Android e
`com.motrice.app`.

```bash
npm install
npm run cap:sync
npm run android:apk
```

L'APK debug viene creato in:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Il workflow GitHub Actions `Android release gate` controlla ogni pull request e
push verso `main`, ma usa la chiave di caricamento soltanto quando la release
viene avviata manualmente. Prima di creare l'AAB verifica test, dipendenze,
versione, configurazione production, firma e impronta del certificato:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Prima di una nuova pubblicazione:

1. incrementa `releaseVersionCode` e `releaseVersionName` in
   `mobile/android/app/build.gradle`;
2. aggiorna `lastPublishedVersionCode` in `mobile/release-policy.json` con la
   versione gia presente su Google Play;
3. avvia manualmente il workflow e digita la stessa `releaseVersionName` come
   conferma;
4. carica in Play Console soltanto l'AAB accompagnato dal checksum generato.

Per un controllo locale che non usa la chiave:

```bash
npm run release:check
```

La build locale firmata usa le quattro proprieta `RELEASE_*` da
`~/.gradle/gradle.properties` o da `.env.release.local`; entrambi devono restare
fuori da Git. Il comando `npm run release:android` si ferma se trova modifiche
non salvate, una versione gia pubblicata, una chiave errata o un segreto nel
bundle web.

## Supabase beta

Il frontend usa soltanto la publishable key, protetta dalle policy RLS del
database. Copia la configurazione locale:

```bash
cp frontend/.env.example frontend/.env.local
```

Poi inserisci `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Non
inserire mai `sb_secret_...` o `service_role` nel frontend o nei secret della
build Android. Lo schema iniziale e in `supabase/migrations/`.

Per compilare l'APK su GitHub, crea le stesse due chiavi come repository
variables (Settings > Secrets and variables > Actions > Variables). Sono valori
pubblici del client; la sicurezza dei dati e affidata alle policy RLS.
