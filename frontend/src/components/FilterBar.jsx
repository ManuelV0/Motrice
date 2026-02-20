import Card from './Card';
import Button from './Button';
import styles from '../styles/components/filterBar.module.css';
import inputStyles from '../styles/components/input.module.css';

function FilterBar({ filters, sports, onChange, onSubmit, advancedLocked = false, onRequestUpgrade }) {
  function handleAdvancedChange(key, value) {
    if (advancedLocked) {
      if (onRequestUpgrade) onRequestUpgrade();
      return;
    }
    onChange(key, value);
  }

  return (
    <Card as="form" className={styles.form} onSubmit={onSubmit} aria-label="Filtra eventi">
      <div className={styles.grid}>
        <label className={inputStyles.group}>
          <span className={inputStyles.label}>Ricerca</span>
          <input
            value={filters.q || ''}
            onChange={(event) => onChange('q', event.target.value)}
            placeholder="Sport, citta, titolo"
          />
        </label>

        <label className={inputStyles.group}>
          <span className={inputStyles.label}>Sport</span>
          <select value={filters.sport} onChange={(event) => onChange('sport', event.target.value)}>
            <option value="all">Tutti</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.name}
              </option>
            ))}
          </select>
        </label>

        <label className={inputStyles.group}>
          <span className={inputStyles.label}>Periodo</span>
          <select value={filters.dateRange} onChange={(event) => onChange('dateRange', event.target.value)}>
            <option value="all">Qualsiasi</option>
            <option value="today">Oggi</option>
            <option value="week">Questa settimana</option>
            <option value="month">Questo mese</option>
          </select>
        </label>

        <label className={inputStyles.group}>
          <span className={inputStyles.label}>Distanza</span>
          <select
            value={filters.distance}
            onChange={(event) => handleAdvancedChange('distance', event.target.value)}
            disabled={advancedLocked}
          >
            <option value="all">Qualsiasi</option>
            <option value="5">Entro 5 km</option>
            <option value="15">Entro 15 km</option>
            <option value="30">Entro 30 km</option>
          </select>
        </label>

        <label className={inputStyles.group}>
          <span className={inputStyles.label}>Livello</span>
          <select
            value={filters.level}
            onChange={(event) => handleAdvancedChange('level', event.target.value)}
            disabled={advancedLocked}
          >
            <option value="all">Tutti</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>

        <label className={inputStyles.group}>
          <span className={inputStyles.label}>Fascia oraria</span>
          <select
            value={filters.timeOfDay}
            onChange={(event) => handleAdvancedChange('timeOfDay', event.target.value)}
            disabled={advancedLocked}
          >
            <option value="all">Tutte</option>
            <option value="morning">Mattina</option>
            <option value="afternoon">Pomeriggio</option>
            <option value="evening">Sera</option>
          </select>
        </label>

        <label className={inputStyles.group}>
          <span className={inputStyles.label}>Ordina per</span>
          <select value={filters.sortBy} onChange={(event) => onChange('sortBy', event.target.value)}>
            <option value="soonest">Piu vicini nel tempo</option>
            <option value="closest">Piu vicini a te</option>
            <option value="popular">Piu popolari</option>
          </select>
        </label>
      </div>

      {advancedLocked && <p className={`muted ${styles.locked}`}>Filtri avanzati disponibili con Premium.</p>}

      <Button type="submit">Applica</Button>
    </Card>
  );
}

export default FilterBar;
