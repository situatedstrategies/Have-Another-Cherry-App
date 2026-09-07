import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

// One bad expense should cost you one card, not the whole dashboard.
//
// React unmounts the nearest subtree when a render throws, and with no
// boundary anywhere the nearest subtree was the entire page: the ledger, the
// chart, the balances and the rhythm card all vanished together because one of
// them met a value it did not expect. That failure is indistinguishable from
// "the app is broken" to the person looking at it.
//
// Wrapping each module separately keeps the rest of the page working and says
// which piece failed, which is also the difference between a bug report that
// can be acted on and "the modules are gone".

interface Props {
  /** Shown in the fallback and logged, so a report names the failing module. */
  label: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class ModuleBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept to console rather than sent anywhere: a stack trace can carry
    // expense titles and amounts through variable names and props, and this
    // app does not send those off the device.
    console.error(`[${this.props.label}] failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="bg-white border border-natural-border rounded-2xl p-5 text-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-natural-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-natural-text">
              {this.props.label} could not be shown
            </p>
            <p className="text-natural-muted mt-1 leading-relaxed">
              The rest of this page is fine, and nothing has been changed or lost.
              Reloading usually clears it.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-3 inline-flex items-center gap-1.5 text-natural-primary font-semibold hover:underline"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
