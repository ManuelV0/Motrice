import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import Button from '../Button';
import styles from '../../styles/components/exploreFiltersToolbar.module.css';

const DATE_LABELS = { today: 'Oggi', week: 'Questa settimana', month: 'Questo mese' };
const DISTANCE_LABELS = { 5: 'Entro 5 km', 15: 'Entro 15 km', 30: 'Entro 30 km' };
const LEVEL_LABELS = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzato' };
const TIME_LABELS = { morning: 'Mattina', afternoon: 'Pomeriggio', evening: 'Sera' };
const SORT_LABELS = { closest: 'Più vicini', popular: 'Più popolari' };

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
  advancedOpen,
  open,
  onToggle,
  onCollapse
}) {
  const selectedSport = sports.find((sport) => String(sport.id) === String(filters.sport));
  const activeLabels = [
    String(filters.q || '').trim() ? `“${String(filters.q).trim()}”` : '',
    filters.sport !== 'all' ? selectedSport?.name || 'Sport' : '',
    cityFilter !== 'all' ? cityFilter : '',
    DATE_LABELS[filters.dateRange] || '',
    DISTANCE_LABELS[filters.distance] || '',
    LEVEL_LABELS[filters.level] || '',
    TIME_LABELS[filters.timeOfDay] || '',
    SORT_LABELS[filters.sortBy] || '',
    onlyOpenSpots ? 'Posti disponibili' : ''
  ].filter(Boolean);
  const visibleLabels = activeLabels.slice(0, 3);
  const remainingLabels = Math.max(0, activeLabels.length - visibleLabels.length);

  return (
    <section className={styles.toolbar} aria-label="Filtri esplora">
      <div className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon} aria-hidden="true"><SlidersHorizontal size={19} /></span>
          <span className={styles.headingCopy}>
            <strong>Filtra gli eventi</strong>
            <small>{resultCount} sessioni trovate</small>
          </span>
          {activeLabels.length ? <span className={styles.activeCount}>{activeLabels.length}</span> : null}
        </div>

        <button
          type="button"
          className={styles.collapseButton}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="explore-filter-options"
        >
          <span>{open ? 'Riduci' : 'Filtri'}</span>
          <ChevronDown size={19} className={open ? styles.chevronOpen : ''} aria-hidden="true" />
        </button>
      </div>

      <label className={`${styles.field} ${styles.searchField}`}>
        <span>Ricerca</span>
        <input
          value={filters.q || ''}
          onChange={(event) => onFiltersChange('q', event.target.value)}
          placeholder="Sport, città, titolo"
          aria-label="Cerca eventi"
        />
      </label>

      {!open ? (
        <div className={styles.collapsedSummary} aria-label="Riepilogo filtri attivi">
          {visibleLabels.length ? (
            <>
              {visibleLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
              {remainingLabels ? <span>+{remainingLabels}</span> : null}
            </>
          ) : (
            <small>Nessun filtro attivo · mostra tutti gli eventi</small>
          )}
        </div>
      ) : null}

      <div
        id="explore-filter-options"
        className={`${styles.collapsible} ${open ? '' : styles.collapsibleClosed}`}
        aria-hidden={!open}
      >
        <div className={styles.collapsibleInner}>
          <div className={styles.grid}>
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
              <span>Città</span>
              <select value={cityFilter} onChange={(event) => onCityFilterChange(event.target.value)} aria-label="Filtro città">
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
                <option value="soonest">Più vicini nel tempo</option>
                <option value="closest">Più vicini a te</option>
                <option value="popular">Più popolari</option>
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
          </div>

          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={onReset}>
              Reset
            </Button>
            <Button type="button" variant="secondary" onClick={onToggleAdvanced}>
              {advancedOpen ? 'Nascondi avanzati' : 'Filtri avanzati'}
            </Button>
            <Button type="button" onClick={onCollapse}>
              Fatto
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ExploreFiltersToolbar;
