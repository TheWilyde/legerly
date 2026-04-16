import React from 'react';
import TitleBar from './TitleBar';

type State = {hasError: boolean; message?: string};
export default class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  state: State = {hasError: false};
  static getDerivedStateFromError(err: any): State {
    return {hasError: true, message: String(err?.message ?? err)};
  }
  componentDidCatch(err: any, info: any) {
    console.error('Renderer error boundary', err, info);

    // Let title bar show boundary errors after fallback tree mounts.
    window.setTimeout(() => {
      const message = String(err?.message ?? err ?? 'Unexpected error');
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
