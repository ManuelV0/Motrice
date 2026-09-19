# Notifiche push Motrice

La funzione `send-push-notification` riceve gli `INSERT` della tabella `public.notifications` e invia il messaggio ai dispositivi Android registrati tramite Firebase Cloud Messaging.

Configurazione richiesta nel progetto Supabase:

1. Distribuire la funzione `send-push-notification`.
2. Impostare i secret `PUSH_WEBHOOK_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`.
3. Creare un Database Webhook sulla tabella `public.notifications`, evento `INSERT`, diretto a `https://<project-ref>.supabase.co/functions/v1/send-push-notification`.
4. Inviare nel webhook l’header `x-motrice-push-secret` con lo stesso valore di `PUSH_WEBHOOK_SECRET`.
5. Inserire il file Firebase Android `google-services.json` in `mobile/android/app/` prima della build destinata ai tester.

Le notifiche locali di promemoria (24 ore, 2 ore, apertura check-in e chiusura check-in) non dipendono dal webhook e vengono pianificate direttamente dal telefono.
