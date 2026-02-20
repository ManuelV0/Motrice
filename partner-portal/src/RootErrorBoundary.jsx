import React from 'react';

const RECOVERABLE_KEYS = [
  'motrice_operational_store_v2',
  'motrice_auth_session_v1'
];

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
    this.handleReload = this.handleReload.bind(this);
    this.handleResetLocalData = this.handleResetLocalData.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Errore sconosciuto' };
  }

  componentDidCatch(error) {
    console.error('Partner root error boundary caught:', error);
  }

  handleReload() {
    window.location.reload();
  }

  handleResetLocalData() {
    try {
      RECOVERABLE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Ignore storage cleanup failures and still reload.
    }
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="pageShell">
        <section className="card heroCard stack">
          <p className="eyebrow">Partner Portal</p>
          <h1>Errore caricamento</h1>
          <p className="muted">
            Il portale ha rilevato un errore in avvio (possibili dati locali non validi o scadenza corrotta).
          </p>
          {this.state.errorMessage ? <p className="muted">Dettaglio: {this.state.errorMessage}</p> : null}
          <div className="row">
            <button className="btn btn-secondary" onClick={this.handleReload}>Ricarica</button>
            <button className="btn" onClick={this.handleResetLocalData}>Ripristina dati locali</button>
          </div>
        </section>
      </main>
    );
  }
}

export default RootErrorBoundary;
