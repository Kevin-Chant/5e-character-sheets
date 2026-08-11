import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  // Changing this key (e.g. a different character opened) clears a caught
  // error and retries rendering.
  resetKey?: unknown;
  fallback: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Contains render-time crashes (e.g. the formula engine throwing on a
// malformed character).
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Caught render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, () =>
        this.setState({ error: null }),
      );
    }
    return this.props.children;
  }
}
