# Supabase beta

La migration crea il backend condiviso iniziale di Motrice:

- profili collegati a `auth.users`
- sport ed eventi
- partecipazioni con controllo atomico della capienza
- eventi salvati
- chat evento
- notifiche
- schede di allenamento personali sincronizzate per utente
- bucket pubblico `avatars` con scrittura limitata alla cartella dell'utente
- RLS su tutte le tabelle esposte
- Realtime per eventi, partecipanti, messaggi e notifiche

## Applicazione

Con Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref PROJECT_REF
npx supabase db push
```

In alternativa, il contenuto della migration puo essere eseguito una volta nel
SQL Editor della dashboard.

Il frontend deve ricevere soltanto `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY`. Non usare mai una secret key o `service_role`
nel browser o nell'APK.

## Callback autenticazione Android

Google OAuth e la conferma email usano lo stesso callback nativo:

```text
com.motrice.app://login-callback
```

In `Supabase > Authentication > URL Configuration > Redirect URLs` questo URL
deve essere presente. In questo modo il link di conferma ricevuto via email
riapre Motrice e completa automaticamente la sessione nell'app Android.

## Accesso Google

L'app usa Supabase Auth con OAuth PKCE. Per attivare `Continua con Google`:

1. In Google Cloud crea un client OAuth di tipo **Applicazione web**.
2. Inserisci come URI di reindirizzamento autorizzato il callback mostrato in
   `Supabase > Authentication > Sign In / Providers > Google`.
3. Copia Client ID e Client Secret nel provider Google di Supabase e abilitalo.
4. Verifica che in `Supabase > Authentication > URL Configuration > Redirect URLs` sia presente:

```text
com.motrice.app://login-callback
```

Per il frontend web aggiungi anche gli URL pubblici che terminano con `/login`
e, durante lo sviluppo, `http://localhost:5000/login`.

Il Client Secret rimane soltanto tra Google Cloud e Supabase: non deve essere
inserito nel repository, nel frontend o nell'APK.

## Partecipazione protetta agli eventi

La migration `20260729120000_event_participation_flow.sql` aggiunge il flusso
server-side della beta:

- deposito deciso dall'organizzatore e bloccato nel wallet beta;
- QR personale e non riutilizzabile per evento e partecipante;
- check-in al 60% con registrazione di orario, organizzatore e posizione;
- campioni di presenza geolocalizzati per partecipante e organizzatore;
- cashback al 100%, restituzione deposito e accredito PX al tempo minimo;
- questionario finale con bonus PX;
- chiusura evento con esiti validati e no-show.

Saldo, cashback e PX vengono aggiornati esclusivamente da funzioni RPC
`security definer`; il client non può scrivere direttamente le tabelle
operative.

## Schede personali

La migration `20260821210000_personal_workout_plans.sql` aggiunge la tabella
`personal_workout_plans`. Ogni utente autenticato può leggere e modificare
soltanto le proprie schede tramite policy RLS. Il frontend mantiene anche una
copia locale, importa automaticamente le schede già presenti sul dispositivo e
riallinea salvataggi o eliminazioni rimasti in attesa quando torna la rete.
