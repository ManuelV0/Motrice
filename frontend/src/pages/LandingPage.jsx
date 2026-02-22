import {
  BadgeCheck,
  CalendarClock,
  MapPin,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  Trophy,
  Users
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import LandingHero from '../components/landing/LandingHero';
import LandingSection from '../components/landing/LandingSection';
import LandingCTA from '../components/landing/LandingCTA';
import HeroCard from '../components/HeroCard';
import styles from '../styles/pages/landing.module.css';

const problemBullets = [
  'No-show frequenti e gruppi instabili.',
  'Organizzazione eventi frammentata tra chat e post.',
  'Promo locali poco trasparenti e difficili da usare.',
  'Nessuna validazione reale della presenza in palestra.'
];

const howItWorks = [
  {
    title: 'Trova evento',
    text: 'Filtra per sport, citta e orario. In pochi tap trovi il match giusto.',
    icon: MapPin,
    number: '01'
  },
  {
    title: 'Apri QR (90 min)',
    text: 'Generi un QR univoco a validita temporale per accesso controllato.',
    icon: CalendarClock,
    number: '02'
  },
  {
    title: 'Valida in palestra',
    text: 'Il partner verifica il QR e la presenza viene certificata.',
    icon: QrCode,
    number: '03'
  }
];

const userBenefits = [
  'XP e reputazione che crescono ad ogni presenza valida',
  'Convenzioni e vantaggi sbloccati con utilizzo reale',
  'Wallet motivazionale per presenza, continuita e obiettivi'
];

const partnerBenefits = [
  'Vetrina partner e visibilita locale senza dispersione',
  'Traffico certificato da QR e validazione in struttura',
  'Performance-based: metriche reali su redeem e frequenza'
];

const trustItems = [
  {
    title: 'QR univoco',
    text: 'Ogni voucher/sessione usa codici non riutilizzabili e associati al profilo.'
  },
  {
    title: 'Validita temporale',
    text: 'QR disponibile in finestra controllata per ridurre abusi e condivisioni improprie.'
  },
  {
    title: 'Sistema anti-abuso',
    text: 'Controlli su stato voucher, tempi e redeem per mantenere il sistema affidabile.'
  }
];

function LandingPage() {
  const navigate = useNavigate();

  usePageMeta({
    title: 'Motrice | Sport locale, QR e convenzioni intelligenti',
    description: 'Trova eventi vicino a te, valida con QR e accedi a convenzioni reali. Partner: porta traffico certificato in palestra.'
  });

  return (
    <div className={styles.page}>
      <LandingHero />

      <div className={styles.heroCards}>
        <HeroCard
          icon={Users}
          title="Esplora Eventi"
          subtitle="Sessioni sport vicino a te"
          badge="Live"
          onClick={() => navigate('/explore')}
          ariaLabel="Vai a Esplora eventi"
        />
        <HeroCard
          icon={QrCode}
          title="Check-in QR"
          subtitle="Valida in 90 secondi"
          badge="Nuovo"
          onClick={() => navigate('/explore')}
          ariaLabel="Scopri il check-in QR"
        />
        <HeroCard
          icon={Trophy}
          title="Reputazione"
          subtitle="Sali di livello"
          badge="XP"
          onClick={() => navigate('/pricing')}
          ariaLabel="Sistema reputazione"
        />
      </div>

      <LandingSection
        id="problema"
        kicker="Perche nasce Motrice"
        title="Lo sport locale oggi e ancora troppo caotico"
        description="Motrice nasce per trasformare caos e no-show in flussi chiari e verificabili."
      >
        <ul className={styles.problemList}>
          {problemBullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </LandingSection>

      <LandingSection
        id="come-funziona"
        kicker="Come funziona"
        title="3 passaggi. Zero frizione."
        description="Dal primo tap alla validazione in palestra: tutto lineare e immediato."
      >
        <div className={styles.stepsVisual}>
          <div className={styles.stepsImageWrap}>
            <img
              src="/images/landing-steps.png"
              alt="Flusso in 3 passaggi: trova, scansiona, valida"
              loading="lazy"
              width="640"
              height="360"
            />
          </div>
          <div className={styles.stepsGrid}>
            {howItWorks.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className={styles.stepCard}>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <span className={styles.stepIcon}><Icon size={18} aria-hidden="true" /></span>
                  <div className={styles.stepCopy}>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </LandingSection>

      <LandingSection
        id="reputazione"
        kicker="Sistema reputazione"
        title="Ogni presenza conta"
        description="Utenti e partner costruiscono reputazione con interazioni reali e validate."
      >
        <div className={styles.reputationVisual}>
          <div className={styles.reputationImageWrap}>
            <img
              src="/images/landing-reputation.png"
              alt="Sistema badge e trofei"
              loading="lazy"
              width="480"
              height="360"
            />
          </div>
          <div className={styles.reputationCards}>
            <article className={styles.reputationCard}>
              <h3><Trophy size={16} aria-hidden="true" /> Badge utente</h3>
              <p>La costanza nelle presenze migliora livello e affidabilita nel tempo.</p>
            </article>
            <article className={styles.reputationCard}>
              <h3><Store size={16} aria-hidden="true" /> Badge partner</h3>
              <p>Qualita di validazione e performance operative migliorano la visibilita.</p>
            </article>
          </div>
        </div>
        <div className={styles.badgeScale} aria-label="Progressione badge da rame a diamante">
          <span>Rame</span>
          <span>Bronzo</span>
          <span>Argento</span>
          <span>Oro</span>
          <span className={styles.badgeDiamond}>Diamante</span>
        </div>
      </LandingSection>

      <LandingSection
        id="vantaggi"
        kicker="Doppio target"
        title="Valore concreto per utenti e partner"
      >
        <div className={styles.benefitGrid}>
          <article className={styles.benefitCol}>
            <h3><Sparkles size={16} aria-hidden="true" /> Per utenti</h3>
            <ul>
              {userBenefits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className={styles.benefitCol}>
            <h3><BadgeCheck size={16} aria-hidden="true" /> Per partner</h3>
            <ul>
              {partnerBenefits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </LandingSection>

      <LandingSection
        id="fiducia"
        kicker="Fiducia e sicurezza"
        title="Un sistema progettato per essere credibile"
      >
        <div className={styles.trustGrid}>
          {trustItems.map((item) => (
            <article key={item.title} className={styles.trustCard}>
              <h3><ShieldCheck size={16} aria-hidden="true" /> {item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </LandingSection>

      <LandingCTA />
    </div>
  );
}

export default LandingPage;
