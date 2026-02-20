import Button from '../Button';
import styles from '../../styles/components/accountSectionToolbar.module.css';

function AccountSectionToolbar({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  onlyAvailable,
  onOnlyAvailableChange,
  resultCount,
  onReset
}) {
  return (
    <section className={styles.toolbar} aria-label="Filtri sezione account">
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Ricerca</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Cerca: profilo, piano, XP..."
            aria-label="Cerca sezioni account"
          />
        </label>

        <label className={styles.field}>
          <span>Categoria</span>
          <select value={category} onChange={(event) => onCategoryChange(event.target.value)} aria-label="Filtro categoria account">
            <option value="all">Tutte</option>
            <option value="profilo">Profilo</option>
            <option value="growth">Crescita</option>
            <option value="billing">Piano</option>
            <option value="utility">Utility</option>
          </select>
        </label>

        <label className={styles.toggle} htmlFor="account-only-available">
          <input
            id="account-only-available"
            type="checkbox"
            checked={onlyAvailable}
            onChange={(event) => onOnlyAvailableChange(event.target.checked)}
          />
          <span>Solo azioni disponibili ora</span>
        </label>
      </div>

      <div className={styles.footer}>
        <p className={styles.count} role="status" aria-live="polite">
          {resultCount} sezioni visibili
        </p>
        <Button type="button" variant="ghost" onClick={onReset}>
          Reset filtri
        </Button>
      </div>
    </section>
  );
}

export default AccountSectionToolbar;
