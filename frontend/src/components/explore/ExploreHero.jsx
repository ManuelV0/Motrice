import { useEffect, useRef, useState } from 'react';
import Button from '../Button';
import styles from '../../styles/components/exploreHero.module.css';

const HERO_SLIDES = [
  {
    kicker: 'Esplora',
    title: 'Trova sessioni sportive vicino a te',
    description: 'Scopri attivita reali nella tua zona, con orari chiari e disponibilita aggiornata in tempo reale.'
  },
  {
    kicker: 'Organizza',
    title: 'Filtra per sport, livello e fascia oraria',
    description: 'Usa i filtri per trovare rapidamente sessioni compatibili con i tuoi obiettivi e il tuo ritmo.'
  },
  {
    kicker: 'Parti adesso',
    title: 'Prenota e allenati con costanza',
    description: 'Scegli una sessione oggi, entra nel gruppo e trasforma ogni allenamento in un passo concreto avanti.'
  }
];

function ExploreHero({ onPrimaryAction, onSecondaryAction }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const timerRef = useRef(null);
  const touchStartXRef = useRef(0);

  function startAutoplay() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 10000);
  }

  useEffect(() => {
    startAutoplay();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  function goPrev() {
    setActiveSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
    startAutoplay();
  }

  function goNext() {
    setActiveSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    startAutoplay();
  }

  function onTouchStart(event) {
    touchStartXRef.current = Number(event.touches?.[0]?.clientX || 0);
  }

  function onTouchEnd(event) {
    const endX = Number(event.changedTouches?.[0]?.clientX || 0);
    const delta = endX - touchStartXRef.current;
    if (Math.abs(delta) < 40) return;
    if (delta > 0) goPrev();
    else goNext();
  }

  const currentSlide = HERO_SLIDES[activeSlide];

  return (
    <section className={styles.hero} aria-labelledby="explore-hero-title" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <button type="button" className={`${styles.navArrow} ${styles.navArrowLeft}`} onClick={goPrev} aria-label="Slide precedente">
        <span aria-hidden="true">&#8249;</span>
      </button>
      <button type="button" className={`${styles.navArrow} ${styles.navArrowRight}`} onClick={goNext} aria-label="Slide successiva">
        <span aria-hidden="true">&#8250;</span>
      </button>
      <div className={styles.content}>
        <p className={styles.kicker}>{currentSlide.kicker}</p>
        <h1 id="explore-hero-title">{currentSlide.title}</h1>
        <p className={styles.description}>
          {currentSlide.description}
        </p>
      </div>
      <div className={styles.pagination} aria-label="Selezione slide hero">
        {HERO_SLIDES.map((slide, index) => (
          <button
            key={slide.title}
            type="button"
            className={`${styles.dot} ${index === activeSlide ? styles.dotActive : ''}`}
            onClick={() => setActiveSlide(index)}
            aria-label={`Vai alla slide ${index + 1}`}
            aria-pressed={index === activeSlide}
            onPointerDown={startAutoplay}
          />
        ))}
      </div>
      <div className={styles.actions}>
        <Button type="button" onClick={onPrimaryAction}>
          Trova sessioni vicino a me
        </Button>
        <Button type="button" variant="secondary" onClick={onSecondaryAction}>
          Come funziona
        </Button>
      </div>
    </section>
  );
}

export default ExploreHero;
