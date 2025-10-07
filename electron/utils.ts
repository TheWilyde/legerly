export function normalizeCode(code: string | null | undefined): string {
  return String(code ?? '').trim().toUpperCase();
}