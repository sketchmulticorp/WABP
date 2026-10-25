import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface PhoneNormalizationResult {
  readonly e164: string;
}

/**
 * Normalizes a user-supplied phone number through the same country-aware policy in
 * synchronous Contact APIs and asynchronous import workers.
 */
export function normalizePhoneNumber(
  value: string,
  defaultCountry: CountryCode | undefined,
): PhoneNormalizationResult | null {
  const input = value.trim();
  if (input.length === 0 || input.length > 64) return null;

  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (!parsed?.isValid()) return null;
  return { e164: parsed.number };
}

export function toCountryCode(value: string | null | undefined): CountryCode | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === undefined) return undefined;
  return /^[A-Z]{2}$/u.test(normalized) ? (normalized as CountryCode) : undefined;
}
