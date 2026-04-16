export type AppFeedbackType = 'success' | 'info' | 'warn' | 'error';

let lastFeedback: {type: AppFeedbackType; message: string; at: number} | null =
  null;

export function emitAppFeedback(type: AppFeedbackType, message?: string) {
  const normalized = String(message ?? '').trim();
  const now = Date.now();

  // Suppress only immediate duplicate echoes from stacked handlers.
  if (
    lastFeedback &&
    lastFeedback.type === type &&
    lastFeedback.message === normalized &&
    now - lastFeedback.at < 80
  ) {
    return;
  }

  lastFeedback = {type, message: normalized, at: now};

  window.dispatchEvent(
    new CustomEvent('app:feedback', {
      detail: normalized ? {type, message: normalized} : {type},
    }),
  );
}

export function toErrorText(error: unknown, fallback = 'Unexpected error') {
  if (error instanceof Error && error.message.trim()) return error.message;

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as {message?: unknown}).message === 'string' &&
    (error as {message: string}).message.trim()
  ) {
    return (error as {message: string}).message;
  }

  if (typeof error === 'string' && error.trim()) return error;

  return fallback;
}
