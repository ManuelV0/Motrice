import { useMemo, useState } from 'react';
import { HelpCircle, Search } from 'lucide-react';
import Card from '../components/Card';
import { usePageMeta } from '../hooks/usePageMeta';
import styles from '../styles/pages/faq.module.css';

const FAQ_SECTIONS = [
  {
    title: 'Avvio rapido',
    items: [
      {
        q: 'Come inizio a usare Motrice?',
        a: 'Vai su Esplora, scegli sport e citta, apri una sessione e premi partecipa. Se non trovi nulla, crea la tua sessione dalla pagina Crea.'
      },
      {
        q: 'A cosa serve la posizione attiva?',
        a: 'Serve a mostrare sessioni e luoghi vicini a te. Se e disattivata puoi usare comunque il sito, ma i risultati possono essere meno pertinenti.'
      },
      {
        q: 'Come funziona Agenda?',
        a: 'Agenda raccoglie i tuoi eventi salvati e le sessioni a cui partecipi, con vista giorno/settimana/mese.'
      }
    ]
  },
  {
    title: 'Eventi e gruppi',
    items: [
      {
        q: 'Come prenoto una sessione di gruppo?',
        a: 'Apri una card evento in Esplora e usa Prenota gruppo. Scegli la quota (5 o 10 EUR) se non hai Premium.'
      },
      {
        q: 'Perche c e una quota nel gruppo?',
        a: 'La quota anti-ghosting viene congelata nel salvadanaio per ridurre le assenze e migliorare la qualita dei gruppi.'
      },
      {
        q: 'Posso annullare una prenotazione chat con coach?',
        a: 'Si, prima dell inizio della sessione. Dopo l inizio non e possibile annullare.'
      }
    ]
  },
  {
    title: 'Convenzioni',
    items: [
      {
        q: 'Come apro un buono convenzione?',
        a: 'Vai in Convenzioni, scegli partner e premi Apri buono con QR. Il buono ha timer (1 ora e 30 minuti).'
      },
      {
        q: 'Perche il buono non si apre?',
        a: 'Di solito per saldo reinvestito insufficiente nel salvadanaio o promo partner scaduta.'
      },
      {
        q: 'Differenza tra piano Free e Premium partner?',
        a: 'Free: 2 promo. Premium: fino a 7 promo per corso, con massimo 5 corsi.'
      }
    ]
  },
  {
    title: 'Portale aziende',
    items: [
      {
        q: 'Come completo la scheda associazione/palestra?',
        a: 'Nel Partner Portal compila info base, carica immagine, inserisci corsi offerti e salva. La scheda diventa visibile in Convenzioni.'
      },
      {
        q: 'Come creo promo corsi?',
        a: 'In Abbonamento convenzioni inserisci tipologia corso e prezzo scontato. Con Premium puoi creare fino a 7 promo per singolo corso.'
      },
      {
        q: 'Come vedo i guadagni cashback?',
        a: 'Nel blocco Saldo Convenzioni Cashback trovi totale, storico eventi e simulazione costo annuo netto.'
      }
    ]
  },
  {
    title: 'Account e accesso',
    items: [
      {
        q: 'Perche la mia sessione viene chiusa dopo un voucher?',
        a: 'Quando un partner riscatta il voucher, il sistema invalida la sessione utente associata per sicurezza.'
      },
      {
        q: 'Come cambio provider di login?',
        a: 'Vai su Login, fai logout e rientra con provider diverso.'
      },
      {
        q: 'Non ricevo notifiche, cosa controllo?',
        a: 'Verifica permessi browser, login attivo e piano con notifiche abilitate.'
      }
    ]
  }
];

function FaqPage() {
  const [query, setQuery] = useState('');
  const normalizedQuery = String(query || '').trim().toLowerCase();

  usePageMeta({
    title: 'FAQ Operativa | Motrice',
    description: 'Guida operativa completa su uso del sito, convenzioni, portale aziende, account e problemi comuni.'
  });

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return FAQ_SECTIONS;
    return FAQ_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const text = `${item.q} ${item.a}`.toLowerCase();
        return text.includes(normalizedQuery);
      })
    })).filter((section) => section.items.length > 0);
  }, [normalizedQuery]);

  const totalMatches = useMemo(
    () => filteredSections.reduce((sum, section) => sum + section.items.length, 0),
    [filteredSections]
  );

  return (
    <div className={styles.page}>
      <Card className={styles.hero}>
        <p className={styles.kicker}>
          <HelpCircle size={15} aria-hidden="true" /> FAQ Operativa
        </p>
        <h1>Dubbi, difficolta e soluzioni pratiche</h1>
        <p className="muted">
          Cerca rapidamente il problema e segui le indicazioni operative per usare Motrice senza blocchi.
        </p>
        <label className={styles.searchWrap}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 120))}
            placeholder="Cerca: buono, convenzioni, portale aziende, login, coach..."
            aria-label="Cerca nella FAQ"
          />
        </label>
        <p className={styles.resultCount}>
          {normalizedQuery ? `${totalMatches} risposte trovate` : 'Tutte le risposte operative disponibili'}
        </p>
      </Card>

      {filteredSections.length === 0 ? (
        <Card>
          <p className="muted">Nessuna risposta trovata. Prova con parole piu generiche.</p>
        </Card>
      ) : (
        filteredSections.map((section) => (
          <Card key={section.title} className={styles.section}>
            <h2>{section.title}</h2>
            <div className={styles.faqList}>
              {section.items.map((item) => (
                <details key={item.q} className={styles.item} open={Boolean(normalizedQuery)}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

export default FaqPage;
