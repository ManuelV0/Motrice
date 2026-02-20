import React from 'react';
import ErrorFallback from './ErrorFallback';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('UI error boundary caught:', error);
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
