import Button from '../Button';
import styles from '../../styles/components/exploreFiltersToolbar.module.css';

function ExploreFiltersToolbar({
  filters,
  cityFilter,
  onCityFilterChange,
  cities,
  sports,
  onlyOpenSpots,
  onOnlyOpenSpotsChange,
  onFiltersChange,
  resultCount,
  onReset,
  onToggleAdvanced,
  advancedOpen
}) {
  return (
    <section className={styles.toolbar} aria-label="Filtri esplora">
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Ricerca</span>
          <input
            value={filters.q || ''}
            onChange={(event) => onFiltersChange('q', event.target.value)}
            placeholder="Sport, citta, titolo"
            aria-label="Cerca eventi"
          />
        </label>

        <label className={styles.field}>
          <span>Sport</span>
          <select value={filters.sport} onChange={(event) => onFiltersChange('sport', event.target.value)} aria-label="Filtro sport">
            <option value="all">Tutti</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Citta</span>
          <select value={cityFilter} onChange={(event) => onCityFilterChange(event.target.value)} aria-label="Filtro citta">
            <option value="all">Tutte</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Ordina per</span>
          <select value={filters.sortBy} onChange={(event) => onFiltersChange('sortBy', event.target.value)} aria-label="Ordina risultati">
            <option value="soonest">Piu vicini nel tempo</option>
            <option value="closest">Piu vicini a te</option>
            <option value="popular">Piu popolari</option>
          </select>
        </label>
      </div>

      <div className={styles.metaRow}>
        <label className={styles.toggle} htmlFor="explore-open-spots-only">
          <input
            id="explore-open-spots-only"
            type="checkbox"
            checked={onlyOpenSpots}
            onChange={(event) => onOnlyOpenSpotsChange(event.target.checked)}
          />
          <span>Solo posti disponibili</span>
        </label>
        <p className={styles.count} role="status" aria-live="polite">
          {resultCount} sessioni trovate
        </p>
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onReset}>
          Reset filtri
        </Button>
        <Button type="button" variant="secondary" onClick={onToggleAdvanced}>
          {advancedOpen ? 'Nascondi filtri avanzati' : 'Apri filtri avanzati'}
        </Button>
      </div>
    </section>
  );
}

export default ExploreFiltersToolbar;
