import React from 'react';

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
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
          Something went wrong. Please reload. {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}
