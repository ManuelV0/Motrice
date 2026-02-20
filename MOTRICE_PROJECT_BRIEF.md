# MOTRICE_PROJECT_BRIEF

## 1) Visione prodotto (5 righe)
Motrice e una piattaforma social-sport orientata a sessioni reali sul territorio, con focus su scoperta eventi, partecipazione e continuita.  
Il prodotto combina UX consumer (Explore/Map/Agenda) con workflow operativi per coach e partner convenzionati.  
La monetizzazione e ibrida: piani `Free`/`Premium`, salvadanaio motivazionale, voucher convenzioni e revenue-share su flussi specifici.  
L'architettura frontend usa sia API mock locali (localStorage-driven) sia API backend reali (soprattutto area coach/admin).  
L'obiettivo di business implicito e aumentare retention e affidabilita comportamentale (presenza, no-show, pagamenti/stake, engagement ricorrente).

---

## 2) Personas / ruoli: obiettivi e permessi

### 2.1 Utente (Atleta / Partecipante)
- Obiettivi:
  - Scoprire eventi rilevanti vicino a se (sport, orario, distanza, livello).
  - Confermare RSVP e gestire agenda personale.
  - Usare convenzioni (voucher QR) e capire stato salvadanaio/piano.
- Permessi/funzioni principali:
  - `Explore`, `Map`, `Agenda`, `Event detail`, `Notifications` (solo se entitlement attivo), `Pricing/Salvadanaio`, `Convenzioni`.
  - Chat gruppo evento abilitata solo con condizioni specifiche (`api.canAccessEventGroupChat` logic in `frontend/src/services/api.js`).
  - Coach chat riservata a `Premium` pagante (vedi `getSubscriptionWithEntitlements` in `frontend/src/services/subscriptionStore.js`).

### 2.2 Partner (Palestra / ASD / Associazione / Coach operatore)
- Obiettivi:
  - Candidarsi come partner convenzionato.
  - Gestire piano promo (Free/Premium), corsi promo, contratti, voucher.
  - Per coach: ricevere richieste piani, consegnare schede, gestire chat e agenda coach.
- Permessi/funzioni principali:
  - Partner convenzioni: onboarding/candidatura/contratto su `/convenzioni`, gestione avanzata su `partner-portal` (handoff via query param).
  - Coach: marketplace + dashboard + gestione piani/chat (`/coach`, `/dashboard/coach`, `/dashboard/plans`).
  - Upload documentale firma/contratti e materiali coach (dove previsto).

### 2.3 Admin
- Obiettivi:
  - Validare candidature coach e candidature convenzioni.
  - Gestire rifiuti/approvazioni con note, motivazioni, controllo documenti.
  - Eseguire verifiche voucher e auditing contratti.
- Permessi/funzioni principali:
  - Backend reale per admin coach: `backend/routes/adminRoutes.js` + `frontend/src/services/adminApi.js`.
  - Frontend mock per admin convenzioni: `frontend/src/pages/AdminConvenzioniApplicationsPage.jsx` + metodi `api.*Convention*` in `frontend/src/services/api.js`.

---

## 3) Moduli attuali dell'app (scopo, route, componenti, stato, dipendenze)

| Modulo | Scopo | Route/pagine | Componenti/funzioni principali | Stato gestito (esempi) | Dipendenze principali |
|---|---|---|---|---|---|
| Landing | Entrypoint marketing+operativo con live snapshot e tutorial prime | `/` (`LandingPage`) | `LandingPage`, `CTAButton`, `getTutorialState`, `getOperationalTrafficSnapshot` | `traffic`, `liveSessions`, `tutorialState` | `api.listEvents`, `tutorialMode`, `trafficOps` |
| Explore | Ricerca eventi con filtri, cartelle sport, booking gruppo | `/explore` | `ExplorePage`, `FilterBar`, `EventCard`, `LocationPermissionAlert` | `filters`, `events`, `folders`, `groupBookingEvent`, `savingIds` | `api.listEvents/saveEvent/unsaveEvent/joinEvent`, `useBilling`, `useUserLocation`, `queryFilters`, `safeStorage` |
| Map | Mappa eventi con marker, filtri rapidi, sheet eventi, tema mappa | `/map` | `MapPage`, `MapSearchBar`, `MapFilterChips`, `MapFloatingControls`, `MapFiltersDrawer` | `filters`, `selectedChip`, `viewportBounds`, `mapTheme`, `listOpen`, `events` | `maplibre-gl`, `api.listEvents`, `useUserLocation`, `queryFilters`, `localStorage` |
| Game Map | Focus mappa 3D/topografica evento | `/game` | `GameMapPage` | `focus`, `radiusKm`, `panelOpen`, `eventInfo` | `maplibre-gl`, `api.getEvent`, tile OpenTopoMap |
| Agenda | Vista personale eventi salvati/going + sblocco quota posizione | `/agenda` | `AgendaPage`, `LocationPermissionAlert` | `filters`, `groups`, `paywallOpen`, `coords` | `api.listAgenda/unsaveEvent`, `piggybank`, `useBilling`, `useUserLocation`, `queryFilters` |
| Event Detail | Scheda evento completa: RSVP, cancel, attendance, chat gruppo, map/route | `/events/:id` | `EventDetailPage`, `Modal`, `EventBadge` | `event`, `similarEvents`, `rsvpForm`, `groupChat*`, `paywallOpen` | `api.getEvent/listEvents/joinEvent/leaveEvent/confirmAttendance`, `useBilling`, `useUserLocation` |
| Create Event | Pubblicazione evento + route mapping/geocoding | `/create` | `CreateEventPage` | `form`, `errors`, `creationStats`, `routeResolving` | `api.createEvent/listSports/getEventCreationStats`, `useBilling`, `nominatim`, `OSRM` |
| Account | Profilo, piano, rewarded unlock, tema, tutorial state | `/account` | `AccountPage`, `RewardedVideoDemoModal` | `theme`, `profile/draft`, `subscription`, `tutorialState`, `videoModalOpen` | `useBilling`, `api.getLocalProfile/updateLocalProfile`, `tutorialMode`, `safeStorage` |
| Notifications | Centro notifiche e azioni read/clear | `/notifications` | `NotificationsPage`, `EmptyState` | `notifications`, `paywallOpen` | `api.listNotifications/markNotificationRead/markAll/clear` |
| Convenzioni (utente+partner) | Catalogo partner, filtri/mappa, candidatura partner, contratto, voucher | `/convenzioni` | `ConvenzioniPage`, `ConvenzioniContractPanel`, `Modal` | `partners`, `filters`, `joinDraft`, `applicationContext`, `voucherModalPartner` | `api.*Convention*`, `piggybank`, `authSession`, `react-leaflet` |
| Voucher Convenzione | Verifica voucher QR con timer/stato e mappa partner | `/convenzioni/voucher/:voucherId` | `ConvenzioneVoucherPage` | `voucher`, `loading`, `error`, `nowMs` | `api.getConventionVoucher`, `react-leaflet` |
| Pricing / Salvadanio | Stato wallet, reinvest, unlock deferred, FAQ pricing | `/pricing` | `PricingPage` | `wallet` | `piggybank`, `entitlements constants` |
| Coach Marketplace | Ricerca coach, richiesta piano, ranking coach | `/coach`, `/coach/:id`, `/become-coach` | `CoachPage`, `CoachProfilePage`, `BecomeCoachApplyPage` | `coaches`, `filters`, `selectedCoachId`, `requestForm` | `coachApi` (backend), `api.getAccountProfileByUserId/getCoachRatingSummary`, `useUserLocation` |
| Coach Dashboard | Gestione richieste coach, consegna/aggiornamento piani, chat booking | `/dashboard/coach` | `CoachDashboardPage` | `requests`, `planByRequestId`, `chatBookings`, `calendar*`, `manualEvents` | `coachApi`, `api.listCoachChatBookings`, `useBilling`, `safeStorage` |
| My Plans (cliente) | Ricezione schede coach, allegati, booking chat, rating | `/dashboard/plans` | `MyPlansPage` | `plans`, `chatSlotsByPlanId`, `chatBookingsByPlanId`, `ratingByPlanId` | `coachApi`, `api.bookCoachChat/listBookingChatMessages/sendBookingChatMessage/submitCoachRating` |
| Coach Plan/Check-in (locale) | Piano settimanale locale e check-in progressi | `/coach/plan`, `/coach/check-in` | `CoachPlanPage`, `CoachCheckInPage` | `plan`, `custom`, `stats`, `form` | `features/coach/services/coach.js`, `api.listEvents/listSports` |
| Admin Coach | Revisione candidature coach con preview certificati | `/admin/coach-applications` | `AdminCoachApplicationsPage` | `applications`, `reasons`, `drafts`, `certPreviews` | `adminApi` (backend), `useBlobPreview` |
| Admin Convenzioni | Revisione candidature partner, voucher ops, template contratti | `/admin/convenzioni-applications` | `AdminConvenzioniApplicationsPage` | `applications`, `vouchers`, `subscriptions`, `contractDraftById` | `api.*Convention*` (mock local) |
| Generatore accordi convenzioni | Produzione record accordo con hash SHA-256 | `/admin/convenzioni-generator` | `ConvenzioneAgreementGeneratorPage` | `form`, `records`, `isSaving` | `api.create/listConventionAgreementRecord`, `crypto.subtle` |
| Tutorial | Tutorial utente per ruolo/prospettiva/goal | `/tutorial` | `TutorialPage`, `SiteTourOverlay` | `tutorialState`, `guideActive`, `guideIndex` | `tutorialMode`, router |
| Admin Tutorial | Checklist admin guidata | `/admin/tutorial` | `AdminTutorialPage` | `state` (progress checklist) | `safeStorage` |

Route registry completo: `frontend/src/App.jsx`.

---

## 4) Flusso Convenzioni end-to-end (dettagliato)

### 4.1 Catalogo partner
- Pagina: `frontend/src/pages/ConvenzioniPage.jsx`.
- Fonti dati:
  - statiche: `partners` in `frontend/src/data/convenzioniData.js`.
  - dinamiche approvate: `api.listApprovedConventionPartners()` (`frontend/src/services/api.js`).
- Filtri/ricerca:
  - `cityFilter`, `coursePromoFilter`, `searchQuery`, `searchSort`.
  - risultati con scoring locale (`searchResults` memo).
- Output UX:
  - card partner con corsi standard + promo, stato promo (attiva/scaduta), CTA voucher/scheda.
  - mappa partner (`react-leaflet`).

### 4.2 Onboarding partner (candidatura)
- Form in `ConvenzioniPage` (`joinDraft` state) + submit `submitJoinRequest`.
- Endpoint mock: `api.submitConventionApplication(payload)`.
- Validazioni chiave (`frontend/src/services/api.js`):
  - login obbligatorio.
  - organization/contact/type/city obbligatori.
  - piano `free|premium`.
  - premium richiede `courses_count` > 0 e <= `CONVENTION_MAX_COURSES` (5).
  - blocco se candidatura pending gia esistente o abbonamento partner gia attivo.
- Risultato: inserimento in `store.conventionApplications` con stato iniziale `pending`.

### 4.3 Contratto / firma / upload
- Pannello: `frontend/src/components/ConvenzioniContractPanel.jsx`.
- Recupero contesto: `api.getMyConventionContractContext()`.
- Requisiti upload firmato (`api.submitSignedConventionContract`):
  - `terms_accepted=true`.
  - metodo firma tra `spid|qes|fea|other`.
  - provider SPID obbligatorio se `spid`.
  - file `data:` valido, max dimensione `8MB` circa (lunghezza data URL).
- Persistenza in application:
  - `contract_terms_accepted(_at)`, `signature_*`, `signed_contract_*`.

### 4.4 Approvazione admin partner
- UI admin convenzioni: `frontend/src/pages/AdminConvenzioniApplicationsPage.jsx`.
- Logica approvazione: `api.reviewConventionApplication(applicationId, { decision })`.
- Vincoli hardcoded prima di approvare:
  - provincia non disattivata (`isConventionProvinceDeactivated`).
  - template contratto esistente (`conventionContractTemplates`).
  - contratto accettato + firmato caricato dal partner.
- Effetti approvazione:
  - creazione/aggiornamento `partnerProfile` in `store.partnerProfiles`.
  - status attivo con `subscription_expires_at` a +365 giorni.
  - notifica utente (`convention_application_approved`).

### 4.5 Generazione voucher QR
- Trigger: `openVoucher(partner)` in `ConvenzioniPage` -> `api.issueConventionVoucher(partner)`.
- Regole:
  - solo utente autenticato.
  - promo partner non scaduta.
  - se esiste voucher attivo stesso partner/utente, riuso (non duplica).
- Parametri voucher:
  - validita: `CONVENTION_VOUCHER_VALIDITY_MINUTES = 90`.
  - costo: `CONVENTION_VOUCHER_COST_CENTS = 200` (2 EUR).
  - QR via servizio esterno `api.qrserver.com`.
  - URL voucher `/convenzioni/voucher/:id`.

### 4.6 Validita, riuso, verifica voucher
- Pagina voucher: `frontend/src/pages/ConvenzioneVoucherPage.jsx` + `api.getConventionVoucher(voucherId)`.
- Stati calcolati: `active`, `expired`, `redeemed` (`resolveVoucherStatus`).
- Timer live sul frontend per countdown.
- Riuso: se voucher attivo gia presente per partner/utente, `issueConventionVoucher` restituisce quello.

### 4.7 Riscatto / chiusura voucher
- Admin/manuale: `api.redeemConventionVoucher(input, payload)`.
- Verifiche:
  - voucher esistente.
  - non scaduto.
  - non gia riscattato.
- Effetti:
  - stato `redeemed`, `redeemed_at`, `redeemed_note`, `redeemed_source`.
  - notifica utente (`convention_voucher_redeemed`).
  - aggiunta user id in `revokedAuthUserIds` (forza logout alla prossima lettura sessione in `authSession`).

### 4.8 Revenue share / cashback
- Costanti:
  - `CONVENTION_PREMIUM_VOUCHER_SHARE_RATE = 0.3` (30%).
  - `CONVENTION_COURSE_CASHBACK_CENTS = 100`.
- In `issueConventionVoucher`:
  - su partner premium accredita voce `voucher_share` (30% del costo voucher) in earnings partner.
- In `redeemConventionVoucher`:
  - su partner premium accredita `course_cashback` da 100 cent.
- Storage earning:
  - campi su `partnerProfiles`: `earnings_voucher_share_cents`, `cashback_course_cents`, `earnings_total_cents`, `earnings_history`.

---

## 5) Sistema XP: presenza, calcolo, persistenza

### Stato reale nel codebase
- **Non esiste un sistema XP esplicito** (nessun campo `xp`, `experience`, `level_points` nei modelli principali).
- Esistono invece metriche vicine:
  - `reliability` utente (`localUser.attended/no_show/cancelled`) in `frontend/src/services/api.js` (`computeReliability`, `updateProfileReliability`).
  - `streak` e `completedSessions` coach check-in in `frontend/src/features/coach/services/coach.js` (`logCheckIn`, `getStats`).

### Dove agganciare XP in modo coerente
- Trigger naturali (punti di integrazione):
  - conferma presenza evento: `api.confirmAttendance`.
  - riscatto voucher: `api.redeemConventionVoucher`.
  - check-in coach: `logCheckIn`.
  - completamento step tutorial: `tutorialMode.completeCurrentStep`.
- Persistenza consigliata:
  - estendere `motrice_operational_store_v2` (`buildInitialStore`) con `xp_by_user` + `xp_history`.
- Sblocchi possibili:
  - badge, priorita visibilita eventi, coupon convenzioni, unlock funzionalita social.

---

## 6) Salvadanio / wallet

### Dove sta il saldo
- Servizio dedicato: `frontend/src/services/piggybank.js`.
- Storage key: `motrice_piggybank_v1`.
- Stato base:
  - `available_cents`
  - `reinvested_cents`
  - `entries` (stake per evento)
  - `history`
  - `rewarded_event_ids` (idempotenza reward partecipazione).

### Come si modifica
- Congelamento quota evento: `piggybank.freezeStake` (solo 500 o 1000 cent).
- Sblocco quota per presenza posizione: `piggybank.unlockByGathering`.
- Penale rinvio quota: `piggybank.deferUntilNextParticipation`.
- Sblocco differite: `piggybank.unlockDeferredOnParticipation`.
- Reward presenza: `piggybank.rewardParticipation` (default 200 cent).
- Movimento budget:
  - `investAvailableBalance`
  - `withdrawReinvestedBalance`
- Spesa voucher convenzione:
  - `spendForConventionVoucher` sottrae da `reinvested_cents`.

### Vincoli
- Stake consentiti solo 5/10 EUR.
- Un solo stake attivo per evento (`gia una quota congelata...`).
- Voucher convenzione a pagamento richiede saldo reinvestito sufficiente.
- Le azioni wallet sono locali al browser corrente (non backend shared).

---

## 7) API layer: servizi chiamati, mock/localStorage, backend reale

### 7.1 Layer mock locale (frontend)
- File: `frontend/src/services/api.js`.
- Persistenza: `motrice_operational_store_v2` in localStorage.
- Copre gran parte di:
  - eventi, RSVP, agenda, notifiche, chat evento/coach, convenzioni, voucher, profilo locale.
- Pattern:
  - `loadStore` / `saveStore` + `withDelay` per latenza simulata.

### 7.2 Layer backend reale
- Client HTTP: `frontend/src/services/backendClient.js` (`request(path, opts)`).
- Usato da:
  - `frontend/src/features/coach/services/coachApi.js`
  - `frontend/src/services/adminApi.js`
- Backend Express: `backend/server.js`.
  - route reali: `/api/coach`, `/api/admin`, `/api/events`, `/api/billing`, ecc.

### 7.3 Situazione ibrida attuale
- Convenzioni nel frontend usano **API mock locale**, non endpoint backend dedicati.
- Coach/Admin coach usano **backend reale**.
- Quindi il progetto e in transizione architetturale: coesistono due sorgenti dati.

---

## 8) Modello dati (shape implicite)

Di seguito shape operative dedotte dal codice.

### 8.1 Event (mock)
- Definizione base seed: `frontend/src/data/mockData.js` (`seededEvents`).
- Campi principali:
  - `id`, `title`, `city`, `sport_id`, `sport_name`, `level`, `event_datetime`
  - `location_name`, `lat`, `lng`, `max_participants`, `participants_count`, `popularity`
  - `description`, `organizer`, `participants_preview`, `route_info`, `creator_plan`, `featured_boost`
- Enrichment runtime (`enrichEvent`):
  - `distance_km`, `analytics`, `is_going`, `is_saved`, `user_rsvp`, `group_chat_unread_count`, `has_passed`.

### 8.2 User profile / account profile
- `localUser` (store): affidabilita e contatori presenza.
- `accountProfiles[userId]`:
  - `display_name`, `bio`, `avatar_url`, `chat_slots`.

### 8.3 Convention Application
- Creata in `api.submitConventionApplication`.
- Campi:
  - `id`, `organization`, `type`, `city`, `contact`, `message`
  - `submitted_by_user_id`, `partner_plan`, `courses_count`, `promo_limit`, `promo_rule_label`
  - `status`, `created_at`, `reviewed_at`, `admin_note`
  - campi contratto/firma/upload (`contract_terms_accepted`, `signature_*`, `signed_contract_*`).

### 8.4 Partner Profile (convenzioni)
- Gestito in `store.partnerProfiles`.
- Campi:
  - identita: `id`, `owner_user_id`, `application_id`, `organization`, `type`, `city`, `contact`
  - piano/subscription: `plan`, `status`, `subscription_started_at`, `subscription_expires_at`
  - profilo pubblico: tagline/description/address/phone/email/website, `offered_courses`, `profile_image_data_url`
  - economia: `earnings_voucher_gross_cents`, `earnings_voucher_share_cents`, `cashback_course_cents`, `earnings_total_cents`, `earnings_history`.

### 8.5 Convention Voucher
- Creato in `api.issueConventionVoucher`.
- Campi:
  - `id`, `user_id`, `created_at`, `expires_at`, `status`
  - `cost_cents`, `billing_mode`, `voucher_url`, `qr_url`
  - `partner` `{ id, name, city, kind, promo_expires_at, lat, lng }`
  - in riscatto: `redeemed_at`, `redeemed_by_user_id`, `redeemed_note`, `redeemed_source`.

### 8.6 Wallet
- In `piggybank`:
  - `available_cents`, `reinvested_cents`, `entries[]`, `history[]`, `rewarded_event_ids[]`.
- `entries` tipicamente: `{ id, event_id, event_title, amount_cents, status, created_at, updated_at }`.

### 8.7 XP
- **Non presente** come modello dati dedicato.

---

## 9) Feature flags / regole hardcoded e dove sono

1. Piani/entitlements hardcoded:
- `frontend/src/services/entitlements.js`
  - `free`, `free_only`, `premium`
  - limiti eventi, notifiche, filtri, agenda week/month, coach chat.

2. Rewarded unlock hardcoded:
- `frontend/src/services/entitlements.js`
  - `REWARDED_UNLOCK_MINUTES=45`, `REWARDED_VIDEOS_REQUIRED=3`, `REWARDED_DAILY_LIMIT=3`, `REWARDED_DAILY_UNLOCK_LIMIT=1`, `REWARDED_COOLDOWN_MINUTES=20`.
- usati in `subscriptionStore` e `AccountPage`.

3. Convenzioni hardcoded:
- `frontend/src/services/api.js`
  - `CONVENTION_VOUCHER_VALIDITY_MINUTES=90`
  - `CONVENTION_SUBSCRIPTION_DAYS=365`
  - `CONVENTION_VOUCHER_COST_CENTS=200`
  - `CONVENTION_PREMIUM_VOUCHER_SHARE_RATE=0.3`
  - `CONVENTION_COURSE_CASHBACK_CENTS=100`
  - `CONVENTION_MAX_COURSES=5`
  - `DEACTIVATED_CONVENTION_PROVINCES = new Set(['ascoli piceno'])`.

4. Auth provider map hardcoded:
- `frontend/src/services/authSession.js` (`providerUserMap`: google->1, facebook->2).

5. Coach chat sessione hardcoded:
- `frontend/src/services/api.js`: `CHAT_SESSION_MINUTES=45`.

6. Feature toggles env-driven:
- `AccountPage`: `VITE_REWARDED_REQUIRE_VIDEO`.
- `coachApi/adminApi/backendClient`: `VITE_API_BASE_URL`.
- `ConvenzioniPage`: `VITE_PARTNER_PORTAL_URL`.

---

## 10) Elenco file chiave per sezione

### Core app shell/navigation
- `frontend/src/App.jsx`
- `frontend/src/layout/AppShell.jsx`
- `frontend/src/components/Navbar.jsx`
- `frontend/src/components/BottomNav.jsx`
- `frontend/src/components/Footer.jsx`

### Event discovery & booking
- `frontend/src/pages/ExplorePage.jsx`
- `frontend/src/pages/MapPage.jsx`
- `frontend/src/pages/EventDetailPage.jsx`
- `frontend/src/pages/AgendaPage.jsx`
- `frontend/src/pages/CreateEventPage.jsx`
- `frontend/src/components/FilterBar.jsx`
- `frontend/src/components/EventCard.jsx`

### Account/billing/subscription
- `frontend/src/pages/AccountPage.jsx`
- `frontend/src/context/BillingContext.jsx`
- `frontend/src/services/subscriptionStore.js`
- `frontend/src/services/entitlements.js`
- `frontend/src/pages/PricingPage.jsx`
- `frontend/src/services/piggybank.js`

### Convenzioni
- `frontend/src/pages/ConvenzioniPage.jsx`
- `frontend/src/components/ConvenzioniContractPanel.jsx`
- `frontend/src/pages/ConvenzioneVoucherPage.jsx`
- `frontend/src/pages/AdminConvenzioniApplicationsPage.jsx`
- `frontend/src/pages/ConvenzioneAgreementGeneratorPage.jsx`
- `frontend/src/data/convenzioniData.js`
- `frontend/src/services/api.js` (metodi `*Convention*`)
- `partner-portal/src/services/partnerBridge.js`

### Coach
- `frontend/src/features/coach/pages/CoachPage.jsx`
- `frontend/src/features/coach/pages/CoachDashboardPage.jsx`
- `frontend/src/features/coach/pages/MyPlansPage.jsx`
- `frontend/src/features/coach/pages/BecomeCoachApplyPage.jsx`
- `frontend/src/features/coach/services/coachApi.js`
- `frontend/src/features/coach/services/coach.js`
- `frontend/src/services/adminApi.js`

### Tutorial
- `frontend/src/pages/TutorialPage.jsx`
- `frontend/src/pages/AdminTutorialPage.jsx`
- `frontend/src/components/SiteTourOverlay.jsx`
- `frontend/src/services/tutorialMode.js`

### API infrastructure
- `frontend/src/services/api.js` (mock/localStorage)
- `frontend/src/services/backendClient.js` (HTTP backend)
- `frontend/src/services/authSession.js`
- `frontend/src/hooks/useUserLocation.js`

### Backend (reale)
- `backend/server.js`
- `backend/routes/coachRoutes.js`
- `backend/routes/adminRoutes.js`
- `backend/routes/eventRoutes.js`
- `backend/routes/billingRoutes.js`
- `backend/sql/schema.sql`

---

## 11) TODO / bug noti dal codice (osservazioni concrete)

1. Architettura dati mista non uniforme (alto rischio inconsistenza)
- Convenzioni usa mock localStorage (`frontend/src/services/api.js`), coach/admin coach usa backend reale (`coachApi`, `adminApi`).
- Impatto: ambienti multiutente reali e sincronizzazione cross-device non garantiti per convenzioni.

2. Nessun backend dedicato convenzioni
- Nel backend non risultano route `convenzioni` equivalenti al flusso frontend.
- Impatto: processi partner/voucher restano locali al browser, non enterprise-ready.

3. Logout forzato post-riscatto voucher e logica non standard
- `api.redeemConventionVoucher` aggiunge utente in `revokedAuthUserIds`; `authSession.getAuthSession` forza logout alla lettura successiva.
- Impatto: UX sorprendente; coupling forte tra voucher redeem e session management.

4. Coordinate partner approvati spesso assenti
- `api.listApprovedConventionPartners` restituisce `lat/lng: null` per partner profile.
- Impatto: mappa convenzioni puo non rappresentare partner approvati (solo partner seed con coordinate).

5. Dipendenze esterne runtime senza fallback robusto
- Geocoding/routing in create event: Nominatim + OSRM (`CreateEventPage`).
- QR code: `api.qrserver.com` (`issueConventionVoucher`).
- Tile map esterne (MapLibre/Leaflet).
- Impatto: in assenza rete/CORS/ratelimit alcune funzioni degradano o falliscono.

6. Sistema XP assente
- Nessuna metrica XP strutturata, solo reliability/streak.
- Impatto: meccaniche gamification non formalizzate e non riusabili trasversalmente.

7. Login esplicitamente placeholder
- `LoginPage` indica flusso mock (`continueWithProvider`) senza OAuth reale.
- Impatto: identity/security non production-ready lato frontend.

8. Convenzioni provincia hardcoded
- Blocco Ascoli Piceno via set statico `DEACTIVATED_CONVENTION_PROVINCES`.
- Impatto: regola business non configurabile da backoffice/DB.

9. Persistenza locale pesante (data URL contratti/immagini)
- Upload contratti e immagini salvati nello storage locale mock.
- Impatto: rischio saturazione localStorage e fragilita browser-specific.

10. Gap di integrazione backend-eventi nel frontend principale
- Pagine core usano `frontend/src/services/api.js` mock invece di `backendClient`.
- Impatto: comportamento diverso tra modulo coach/admin e resto piattaforma.

---

## Nota conclusiva
Il codebase e ricco e funzionale lato UX/prototipazione operativa. Il principale nodo tecnico e la separazione incompleta tra "dominio mock locale" e "dominio backend reale". La priorita architetturale per scalare e convergere Convenzioni/Eventi/Agenda/Notifiche su API backend unificate mantenendo il contratto UI attuale.
