import { Component } from 'react';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error?.message || 'Something went wrong';
    return (
      <div className="gModalBack">
        <div className="gModal" style={{ maxWidth: 520 }}>
          <div className="gModalHd">
            <div style={{ fontWeight: 900 }}>Something went wrong</div>
            <button className="gBtn ghost" onClick={() => this.setState({ error: null })}>
              Close
            </button>
          </div>
          <div className="gModalBd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{msg}</div>
            <button className="gBtn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

