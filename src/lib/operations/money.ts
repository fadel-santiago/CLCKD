const CURRENCY_EXPONENTS = {
  AUD: 2,
  CAD: 2,
  CHF: 2,
  CNY: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  HUF: 2,
  INR: 2,
  JPY: 0,
  KRW: 0,
  NOK: 2,
  NZD: 2,
  PLN: 2,
  SEK: 2,
  USD: 2,
} as const;

export type SupportedCurrency = keyof typeof CURRENCY_EXPONENTS;

export const supportedCurrencies = Object.keys(
  CURRENCY_EXPONENTS,
) as SupportedCurrency[];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return value in CURRENCY_EXPONENTS;
}

export function currencyExponent(currency: string): number {
  const normalized = currency.toUpperCase();
  if (!isSupportedCurrency(normalized)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return CURRENCY_EXPONENTS[normalized];
}

export function parseMoneyInput(value: string, currency: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const exponent = currencyExponent(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (match === null) {
    throw new Error("Enter a valid positive amount.");
  }

  const fraction = match[2] ?? "";
  if (fraction.length > exponent) {
    throw new Error(
      `${currency.toUpperCase()} supports ${exponent} decimal place${exponent === 1 ? "" : "s"}.`,
    );
  }

  const multiplier = 10 ** exponent;
  const minor = Number(match[1]) * multiplier + Number(fraction.padEnd(exponent, "0"));
  if (!Number.isSafeInteger(minor) || minor > 1_000_000_000_000_000) {
    throw new Error("Amount is too large.");
  }
  return minor;
}

export function formatMoney(
  amountMinorUnits: number,
  currency: string,
  locale?: string,
): string {
  const exponent = currencyExponent(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountMinorUnits / 10 ** exponent);
}
