export const MONEY_SCALE = 100;

export function majorToMinor(value: string | number): number {
  const text = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    throw new Error("Invalid monetary value.");
  }

  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [wholeText, fractionText = ""] = unsigned.split(".");
  const whole = Number(wholeText);
  const padded = `${fractionText}000`;
  const cents = Number(padded.slice(0, 2));
  const roundDigit = Number(padded[2]);
  const minor = whole * MONEY_SCALE + cents + (roundDigit >= 5 ? 1 : 0);

  if (!Number.isSafeInteger(minor)) {
    throw new Error("Monetary value is outside the supported range.");
  }
  return negative ? -minor : minor;
}

export function minorToMajor(minor: number): number {
  if (!Number.isFinite(minor) || Math.abs(minor) > Number.MAX_SAFE_INTEGER) {
    throw new Error("Minor-unit monetary value must be a finite safe number.");
  }
  return minor / MONEY_SCALE;
}

export function formatMinor(minor: number, locale = "en-PK"): string {
  return minorToMajor(minor).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  });
}
