import { useMemo, useState } from 'react';
import {
  BellRing,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  CircleHelp,
  Dumbbell,
  HelpCircle,
  Mail,
  MapPinned,
  Search,
  Sparkles,
  TriangleAlert
} from 'lucide-react';
import Card from '../components/Card';
import { usePageMeta } from '../hooks/usePageMeta';
import styles from '../styles/pages/faq.module.css';

const SUPPORT_EMAIL = 'manuel.voll69+motrice@gmail.com';

const FAQ_SECTIONS = [
  {
    id: 'problemi-frequenti',
    title: 'Problemi più frequenti',
    icon: TriangleAlert,
    items: [
      {
        q: 'L’app non si apre o si chiude improvvisamente. Cosa faccio?',
        a: 'Chiudi completamente Motrice e riaprila. Controlla dal Play Store di avere l’ultima versione e riavvia il telefono. Se il problema continua, non cancellare i dati dell’app: invia una segnalazione indicando modello del telefono, versione Android, schermata e azione eseguita prima del blocco.'
      },
      {
        q: 'La mappa non viene visualizzata. Cosa controllo?',
        a: 'Verifica la connessione, attendi qualche secondo e premi Riprova. Se la base cartografica resta vuota, chiudi e riapri Motrice. Se gli altri contenuti funzionano ma la mappa no, invia una segnalazione indicando modello del telefono e stile mappa selezionato.'
      },
      {
        q: 'Non ricevo le notifiche. Cosa controllo?',
        a: 'Apri Impostazioni di Motrice e controlla le preferenze delle notifiche. Poi verifica in Impostazioni Android > App > Motrice > Notifiche che il permesso sia attivo. Le notifiche della beta non dipendono da un piano Premium.'
      }
    ]
  },
  {
    id: 'posizione-checkin',
    title: 'Posizione, mappa e check-in',
    icon: MapPinned,
    items: [
      {
        q: 'Come autorizzo correttamente la posizione?',
        a: 'Su Android apri Impostazioni > App > Motrice > Autorizzazioni > Posizione. Seleziona Consenti solo mentre usi l’app e attiva Posizione precisa. Torna sulla mappa e premi Centra posizione. Su telefoni meno recenti può essere necessario attivare anche la precisione elevata nelle impostazioni di localizzazione.'
      },
      {
        q: 'Perché Motrice mostra una posizione sbagliata?',
        a: 'All’aperto attendi alcuni secondi con il GPS attivo, poi premi nuovamente Centra posizione. Il cerchio azzurro indica la precisione: più è piccolo, più il punto è affidabile. Se il telefono continua a mostrare una zona errata, disattiva e riattiva la posizione prima di riprovare.'
      },
      {
        q: 'Perché il QR code o il GPS non completano il check-in?',
        a: 'Devi essere un partecipante confermato, trovarti nella finestra di check-in e avere la posizione precisa attiva. Il check-in apre 30 minuti prima dell’orario e resta disponibile durante la tolleranza prevista dall’evento. Se un metodo non riesce, controlla i permessi e prova l’altro metodo disponibile.'
      },
      {
        q: 'Quando inizia realmente la barra dell’allenamento?',
        a: 'La durata non viene consumata automaticamente all’orario pubblicato. La barra parte dal primo check-in verificato della sessione, così un arrivo entro la tolleranza non fa perdere minuti di allenamento.'
      }
    ]
  },
  {
    id: 'eventi-partecipazione',
    title: 'Eventi e partecipazione',
    icon: CalendarDays,
    items: [
      {
        q: 'Come partecipo a un evento?',
        a: 'Apri un evento dalla Mappa, controlla luogo, orario, requisiti e deposito, quindi premi Richiedi di partecipare. Negli eventi con approvazione dovrai attendere la decisione dell’organizzatore; negli altri la conferma può essere immediata.'
      },
      {
        q: 'Perché la mia richiesta risulta in attesa?',
        a: 'L’organizzatore non l’ha ancora accettata o rifiutata. Durante l’attesa il credito necessario viene riservato, ma torna disponibile se la richiesta viene rifiutata o annullata secondo le regole dell’evento.'
      },
      {
        q: 'Dove trovo gli eventi creati o prenotati?',
        a: 'Apri I miei eventi. Qui trovi gli appuntamenti da svolgere, le sessioni di oggi e quelli conclusi. Le azioni mostrate cambiano in base al tuo ruolo di organizzatore o partecipante e allo stato dell’evento.'
      },
      {
        q: 'Posso modificare o annullare un evento?',
        a: 'Se sei l’organizzatore apri I miei eventi e usa Modifica evento. Le modifiche disponibili dipendono dal tempo rimanente e tutelano i partecipanti già confermati. L’eliminazione segue regole più restrittive quando l’evento è vicino o ha già iscritti.'
      }
    ]
  },
  {
    id: 'credito-caparra',
    title: 'Credito e caparra',
    icon: CircleDollarSign,
    items: [
      {
        q: 'Perché una parte del credito risulta già impegnata?',
        a: 'Ogni evento di gruppo confermato o richiesta in attesa può riservare 10 € virtuali. Il credito resta nel tuo wallet ma non può essere usato contemporaneamente per un altro evento. Gli eventi personali non richiedono deposito.'
      },
      {
        q: 'Quando torna disponibile il deposito?',
        a: 'Dopo una presenza valida il deposito entra nella finestra di tutela di 48 ore, utile per eventuali verifiche o contestazioni. Se non emergono problemi, viene nuovamente reso disponibile nel wallet.'
      },
      {
        q: 'Cosa succede in caso di no-show?',
        a: 'Motrice usa i check-in verificati per distinguere presenti e assenti. Il deposito della persona assente viene gestito secondo le regole mostrate nell’evento; in caso di errore puoi aprire una contestazione durante la finestra prevista.'
      }
    ]
  },
  {
    id: 'account-notifiche',
    title: 'Account e notifiche',
    icon: BellRing,
    items: [
      {
        q: 'Come modifico le informazioni del profilo?',
        a: 'Apri Profilo e seleziona Modifica profilo. Puoi aggiornare foto e informazioni personali; statistiche, affidabilità, XP e dati verificati non sono modificabili manualmente.'
      },
      {
        q: 'Dove gestisco notifiche, posizione e preferenze?',
        a: 'Apri il menu laterale e vai in Impostazioni. Da lì puoi controllare notifiche, posizione, stile della mappa, suoni e vibrazione dell’allenamento live e autorizzazioni del telefono.'
      },
      {
        q: 'Cosa devo indicare quando segnalo un problema?',
        a: 'Scrivi il modello del telefono, la versione Android, la versione di Motrice e l’orario del problema. Aggiungi la schermata in cui è successo, cosa hai premuto e, se possibile, uno screenshot. Non inviare password, codici di accesso o dati della carta.'
      }
    ]
  },
  {
    id: 'allenamenti-schede',
    title: 'Allenamenti e schede',
    icon: Dumbbell,
    items: [
      {
        q: 'Dove creo e modifico una scheda personale?',
        a: 'Apri Profilo, entra in Schede personali e seleziona Crea nuova scheda. Puoi aggiungere esercizi, serie, ripetizioni, RIR e recupero, quindi salvare la scheda per usarla negli allenamenti.'
      },
      {
        q: 'Come funziona la scheda durante l’allenamento?',
        a: 'La modalità live mostra esercizio corrente, serie completate, timer di sessione e recupero. Tieni premuto su un valore modificabile per adattarlo durante la sessione senza rischiare tocchi accidentali.'
      },
      {
        q: 'Dove vedo i miei progressi?',
        a: 'Apri Profilo e vai in Progressi esercizi. Puoi confrontare gli allenamenti registrati e controllare l’andamento dei singoli esercizi nel tempo.'
      }
    ]
  },
  {
    id: 'funzioni-arrivo',
    title: 'Funzioni in arrivo',
    icon: Sparkles,
    items: [
      {
        q: 'Perché Coach e Premi e convenzioni sono bloccati?',
        a: 'Sono funzioni ancora in preparazione e non fanno parte dei test principali di questa beta. Il lucchetto evita di entrare in flussi non ancora definitivi; verranno attivate con un aggiornamento quando saranno pronti.'
      }
    ]
  }
];

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function FaqPage() {
  const [query, setQuery] = useState('');
  const [openItem, setOpenItem] = useState('');
  const normalizedQuery = normalizeSearchText(query);

  usePageMeta({
    title: 'FAQ Operativa | Motrice',
    description: 'Soluzioni rapide per posizione, check-in, eventi, credito, notifiche e allenamenti su Motrice.'
  });

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return FAQ_SECTIONS;
    return FAQ_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => (
        normalizeSearchText(`${item.q} ${item.a}`).includes(normalizedQuery)
      ))
    })).filter((section) => section.items.length > 0);
  }, [normalizedQuery]);

  const totalMatches = useMemo(
    () => filteredSections.reduce((sum, section) => sum + section.items.length, 0),
    [filteredSections]
  );

  const reportHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Segnalazione beta Motrice')}&body=${encodeURIComponent(
    'Descrivi il problema:\n\nSchermata:\nAzione eseguita:\nModello telefono:\nVersione Android:\nVersione Motrice:\nOrario del problema:\n'
  )}`;

  return (
    <div className={styles.page}>
      <Card className={styles.hero}>
        <p className={styles.kicker}>
          <HelpCircle size={15} aria-hidden="true" /> FAQ operativa
        </p>
        <h1>Dubbi, difficoltà e soluzioni pratiche</h1>
        <p className={styles.intro}>
          Cerca il problema e segui i controlli consigliati per riprendere subito a usare Motrice.
        </p>
        <label className={styles.searchWrap}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 120))}
            placeholder="Cerca un problema…"
            aria-label="Cerca nella FAQ"
          />
        </label>
        {normalizedQuery ? (
          <p className={styles.resultCount} aria-live="polite">
            {totalMatches === 1 ? '1 risposta trovata' : `${totalMatches} risposte trovate`}
          </p>
        ) : null}
      </Card>

      {!normalizedQuery ? (
        <nav className={styles.categoryRail} aria-label="Categorie della guida">
          {FAQ_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <a key={section.id} href={`#${section.id}`}>
                <Icon size={15} aria-hidden="true" />
                <span>{section.title}</span>
              </a>
            );
          })}
        </nav>
      ) : null}

      {filteredSections.length === 0 ? (
        <Card className={styles.emptyState}>
          <CircleHelp size={24} aria-hidden="true" />
          <div>
            <strong>Nessuna risposta trovata</strong>
            <p>Prova con parole più generiche oppure segnala direttamente il problema.</p>
          </div>
        </Card>
      ) : (
        <div className={styles.sections}>
          {filteredSections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.id} id={section.id} className={styles.section}>
                <h2><Icon size={19} aria-hidden="true" /> {section.title}</h2>
                <div className={styles.faqList}>
                  {section.items.map((item) => {
                    const isOpen = openItem === item.q;
                    return (
                      <details key={item.q} className={styles.item} open={isOpen}>
                        <summary
                          onClick={(event) => {
                            event.preventDefault();
                            setOpenItem(isOpen ? '' : item.q);
                          }}
                        >
                          <span>{item.q}</span>
                          <ChevronDown size={18} aria-hidden="true" />
                        </summary>
                        <p>{item.a}</p>
                      </details>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className={styles.supportCard}>
        <span className={styles.supportIcon}><Mail size={20} aria-hidden="true" /></span>
        <div>
          <strong>Non hai risolto?</strong>
          <p>Invia una segnalazione completa per aiutarci a individuare il problema.</p>
        </div>
        <a href={reportHref}>Segnala</a>
      </Card>
    </div>
  );
}

export default FaqPage;
