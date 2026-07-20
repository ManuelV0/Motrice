# Supabase beta

La migration crea il backend condiviso iniziale di Motrice:

- profili collegati a `auth.users`
- sport ed eventi
- partecipazioni con controllo atomico della capienza
- eventi salvati
- chat evento
- notifiche
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
