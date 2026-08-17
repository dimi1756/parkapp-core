import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';

// Branded fallback -- a functional component so it can use the useLanguage
// hook, rendered from inside the class boundary's render() below (hooks work
// fine in a component instantiated via JSX, just not in a class's own
// methods). Mirrors AuthGate's loading-screen branding so a crash doesn't
// look like a different, broken app.
const ErrorFallback = ({ onReload }: { onReload: () => void }) => {
  const { t } = useLanguage();
  return (
    <div className="h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
      <img src="/parkapp-logo.png" alt="ParkApp" className="h-14 w-auto object-contain opacity-90" />
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <h1 className="text-lg font-bold">{t('error.boundaryTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('error.boundaryDesc')}</p>
      </div>
      <Button onClick={onReload}>{t('error.reload')}</Button>
    </div>
  );
};

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Top-level safety net: without this, any uncaught render-time exception
 * anywhere in the tree blanks the whole app to a white screen with no
 * feedback. React error boundaries must be class components -- there is no
 * hook equivalent (as of React 18/19).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Always logged in full -- this is the one place that sees the actual
    // stack/component trace for a render crash, not just a caught-and-toasted
    // async error.
    console.error('[ErrorBoundary] uncaught render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}
