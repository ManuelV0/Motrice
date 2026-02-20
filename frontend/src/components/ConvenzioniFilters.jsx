import styles from '../styles/components/convenzioniFilters.module.css';

function ConvenzioniFilters({
  searchQuery,
  onSearchChange,
  cityFilter,
  onCityChange,
  tagFilter,
  onTagChange,
  activeOnly,
  onActiveOnlyChange,
  cityOptions,
  tagOptions,
  resultCount
}) {
  return (
    <section className={styles.wrap} aria-label="Filtri convenzioni">
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Ricerca</span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Sport, citta, partner"
            aria-label="Cerca convenzioni"
          />
        </label>

        <label className={styles.field}>
          <span>Citta</span>
          <select value={cityFilter} onChange={(event) => onCityChange(event.target.value)} aria-label="Filtro citta">
            <option value="all">Tutte</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Sport/Tag</span>
          <select value={tagFilter} onChange={(event) => onTagChange(event.target.value)} aria-label="Filtro sport o tag">
            <option value="all">Tutti</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.toggle} htmlFor="convenzioni-active-only">
          <input
            id="convenzioni-active-only"
            type="checkbox"
            checked={activeOnly}
            onChange={(event) => onActiveOnlyChange(event.target.checked)}
          />
          <span>Solo promo attive</span>
        </label>
      </div>

      <p className={styles.count} role="status" aria-live="polite">
        {resultCount} convenzioni trovate
      </p>
    </section>
  );
}

export default ConvenzioniFilters;
