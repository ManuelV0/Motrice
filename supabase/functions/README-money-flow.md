# Motrice money flow (Stripe Test)

Le funzioni sono sicure per il repository: il database mantiene
`deposits_enabled=false` e `withdrawals_enabled=false` finché un amministratore
non completa il collaudo.

Segreti richiesti nelle Supabase Edge Functions:

- `STRIPE_SECRET_KEY` (`sk_test_...`)
- `STRIPE_MONEY_WEBHOOK_SECRET` (`whsec_...`)

Il webhook Stripe deve puntare a `stripe-money-webhook` ed essere configurato
almeno per `payment_intent.succeeded`. La funzione webhook va distribuita con
verifica JWT disattivata perché valida la firma Stripe sul corpo grezzo.

Sequenza di attivazione beta:

1. applicare la migrazione `20260907173000_canonical_money_flow.sql`;
2. distribuire le due Edge Functions;
3. configurare i segreti test;
4. eseguire test di pagamento, retry webhook, contestazione e fallimento payout;
5. impostare `deposits_enabled=true`; mantenere i prelievi disattivati finché
   Stripe Connect e la procedura amministrativa non sono collaudati.

Una contestazione accettata resta intenzionalmente congelata: un operatore deve
verificare le prove e registrare manualmente la rettifica prima di riaprire o
chiudere il regolamento. Una contestazione respinta riattiva invece il rilascio
automatico già previsto.

Non usare chiavi live con questa configurazione beta.
