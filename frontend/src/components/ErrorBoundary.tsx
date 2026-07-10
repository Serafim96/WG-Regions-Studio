import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function GraphErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="graph-error">
      <h3>{t('error.graphTitle')}</h3>
      <p>{error.message}</p>
      <button type="button" onClick={onRetry}>
        {t('error.retry')}
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Graph render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <GraphErrorFallback
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
