export class AppError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorCodes = {
  STOCK_CODE_EXISTS: 'STOCK_CODE_EXISTS',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  NO_WORKSPACES: 'NO_WORKSPACES',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;