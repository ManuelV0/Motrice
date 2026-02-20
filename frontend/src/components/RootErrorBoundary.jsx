import React from 'react';

const RECOVERABLE_KEYS = [
  'motrice_operational_store_v2',
  'motrice_subscription_v2',
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
    console.error('Root error boundary caught:', error);
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
      <main style={{ padding: '24px', maxWidth: '720px', margin: '0 auto' }}>
        <h1>Errore caricamento pagina</h1>
        <p>
          L app ha rilevato un errore in avvio (possibili dati locali non validi o data corrotta).
        </p>
        {this.state.errorMessage ? <p><small>Dettaglio: {this.state.errorMessage}</small></p> : null}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
          <button type="button" onClick={this.handleReload}>
            Ricarica pagina
          </button>
          <button type="button" onClick={this.handleResetLocalData}>
            Ripristina dati locali e ricarica
          </button>
        </div>
      </main>
    );
  }
}

export default RootErrorBoundary;
