import {Component} from 'react';
import type {ErrorInfo, PropsWithChildren} from 'react';
import TitleBar from './TitleBar';

type State = {hasError: boolean; message?: string};

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as {message?: unknown}).message === 'string'
  ) {
    return (error as {message: string}).message;
  }
  return String(error ?? 'Unexpected error');
}

export default class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = {hasError: false};
  static getDerivedStateFromError(err: unknown): State {
    return {hasError: true, message: toErrorMessage(err)};
  }
  componentDidCatch(err: unknown, info: ErrorInfo) {
    console.error('Renderer error boundary', err, info);

    // Let title bar show boundary errors after fallback tree mounts.
    window.setTimeout(() => {
      const message = toErrorMessage(err);
      window.dispatchEvent(
        new CustomEvent('app:feedback', {
          detail: {type: 'error', message},
        }),
      );
    }, 0);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col bg-neutral-50">
          <TitleBar />
          <div className="m-6 rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
            Something went wrong. Please reload.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
