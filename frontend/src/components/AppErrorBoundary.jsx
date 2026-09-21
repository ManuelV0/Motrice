import React from 'react';
import ErrorFallback from './ErrorFallback';
import { captureMonitoringException } from '../services/errorMonitoring';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('UI error boundary caught:', error);
    captureMonitoringException(error, {
      tags: { error_boundary: 'app' },
      contexts: {
        react: {
          componentStack: errorInfo?.componentStack || 'non disponibile',
        },
      },
    });
    this.setState({ errorMessage: error?.message || 'Errore sconosciuto' });
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  handleReset() {
    this.setState({ hasError: false, errorMessage: '' });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          message="La pagina non puo essere mostrata correttamente."
          debugMessage={this.state.errorMessage}
          onRetry={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
