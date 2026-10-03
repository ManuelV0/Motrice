# Collaudo interno eventi Motrice — 8 settembre 2026

## Ambiente

- Applicazione web locale in modalità QA, senza collegamento al progetto Supabase reale.
- Due identità demo isolate: `Marco Organizzatore` e `Sara Partecipante`.
- Denaro esclusivamente virtuale; nessun pagamento o dato di produzione modificato.
- Browser mobile-first e cambio account durante lo stesso scenario per simulare due dispositivi.

## Scenari eseguiti

### 1. Evento pubblico aperto a tutti

- Creato `Running QA aperto`, 9 settembre 2026 alle 18:00, durata 90 minuti, massimo 8 persone.
- Punto di incontro geocodificato: Piazza del Popolo 46, Ascoli Piceno.
- Sara ha aperto l'evento dalla mappa e si è iscritta direttamente.
- Confermati feedback di invio, chiusura della modale, stato `Partecipazione confermata` e chat evento.
- Marco vede Sara nel pannello organizzatore (`1/8 partecipanti registrati`).
- Marco ha cancellato l'evento indicando il motivo e un messaggio.
- Confermati: stato annullato per Sara, quota rimborsata e rimozione dell'evento dalla mappa.

Esito: **superato**.

### 2. Evento pubblico con approvazione

- Creato `Palestra QA richiesta`, 12 settembre 2026 alle 19:00, durata 60 minuti, massimo 4 persone.
- Punto di incontro: Via degli Iris 9, Ascoli Piceno.
- Sara ha inviato la richiesta di partecipazione.
- Marco ha ricevuto la richiesta e l'ha approvata.
- Confermati: richiesta rimossa dalla coda, Sara presente tra gli iscritti (`1/4`) e deposito virtuale vincolato solo dopo l'approvazione.

Esito: **superato**.

### 3. Evento privato tramite link

- Creato `Padel QA privato`, 9 settembre 2026 alle 20:00, durata 60 minuti, massimo 2 persone.
- Punto di incontro: Piazza Arringo 31, Ascoli Piceno.
- Prima dell'invito l'evento non era elencato pubblicamente per Sara.
- Il dettaglio era raggiungibile tramite link diretto.
- Esaurite le due prove gratuite, il sistema ha richiesto il credito virtuale previsto.
- Dopo una ricarica virtuale da 10 euro, Sara ha completato l'iscrizione e l'evento è risultato pieno (`2/2`).

Esito: **superato**, con una criticità UX descritta sotto.

## Verifiche tecniche

- Test automatici: **28/28 superati**.
- Build web di produzione: **completata con successo**.
- Separazione account per RSVP, deposito e rimborso: verificata.
- Chat evento: generata per le partecipazioni attive e accessibile a organizzatore e partecipante.
- Evento annullato: non più visibile nella mappa pubblica.

## Problemi trovati e corretti

1. L'approvazione da parte dell'organizzatore bloccava la quota sul wallet sbagliato.
2. Gli RSVP locali erano salvati soltanto per evento e potevano sovrapporsi cambiando account.
3. L'organizzatore poteva vedere `0 partecipanti` mentre il partecipante risultava confermato.
4. Gli eventi creati potevano conservare l'identificativo generico `me`, rendendo ambigua la proprietà dopo il cambio account.
5. Le chat evento locali non venivano sempre ricostruite dalle partecipazioni reali.
6. Il rimborso di una cancellazione organizzatore non era esplicitamente indirizzato al wallet del partecipante.

## Criticità residue

1. **Ritorno dal wallet durante la creazione:** se il credito è insufficiente, il passaggio al wallet non conserva ancora la bozza del nuovo evento. L'utente deve ricompilarla.
2. **Chat di un evento annullato:** la conversazione resta consultabile senza un'etichetta chiara `Evento annullato`. Va deciso se renderla archivio in sola lettura o nasconderla.
3. **Test fisici necessari:** fotocamera QR, precisione GPS, permessi Android e monitoraggio a schermo spento devono essere collaudati con due telefoni reali.
4. **Backend reale non incluso nel test:** policy RLS Supabase, email, notifiche push e integrazione Stripe richiedono uno staging separato.
5. **Fallback locale multi-partecipante:** lo stato live dell'allenamento è ancora centrato sull'evento; prima di simulare più partecipanti contemporanei nello stesso browser va reso account-specifico.
6. **Prestazioni:** la build segnala chunk JavaScript oltre 500 kB, soprattutto MapLibre. Non blocca il funzionamento, ma può rallentare il primo avvio su telefoni economici.

## Valutazione

I flussi base di creazione, ricerca, partecipazione diretta, richiesta/approvazione, evento privato, quota virtuale, chat e cancellazione sono coerenti e utilizzabili nella demo interna. Prima di considerare il ciclo evento pronto per un test pubblico, sono prioritari il salvataggio della bozza durante la ricarica e il collaudo QR/GPS su due dispositivi reali.
