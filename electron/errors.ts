export const ErrorCodes = {
  STOCK_CODE_EXISTS: 'STOCK_CODE_EXISTS',
  DUPLICATE_CODE: 'DUPLICATE_CODE',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  NO_WORKSPACES: 'NO_WORKSPACES',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export class AppError extends Error {
  code: string;
  
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
}
