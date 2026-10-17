import { isISO8601, ValidateBy } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ZONE = /T.+(Z|[+-]\d{2}:?\d{2})$/;

export function todayInIran(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(
    now,
  );
}

/** A real calendar date, `YYYY-MM-DD`, that is not later than today in Iran. */
export const IsPastDate = () =>
  ValidateBy({
    name: 'isPastDate',
    validator: {
      validate: (value) =>
        typeof value === 'string' &&
        DATE_ONLY.test(value) &&
        isISO8601(value, { strict: true }) &&
        value <= todayInIran(),
      defaultMessage: () =>
        '$property must be a date in YYYY-MM-DD form, not in the future',
    },
  });

/**
 * An ISO 8601 date and time with an explicit offset, e.g.
 * `2026-10-14T09:30:00Z` or `2026-10-14T13:00:00+03:30`.
 */
export const IsDateTimeWithZone = () =>
  ValidateBy({
    name: 'isDateTimeWithZone',
    validator: {
      validate: (value) =>
        typeof value === 'string' &&
        HAS_ZONE.test(value) &&
        isISO8601(value, { strict: true, strictSeparator: true }),
      defaultMessage: () =>
        '$property must be an ISO 8601 date-time with a time zone, e.g. 2026-10-14T09:30:00Z',
    },
  });

export const formatDateOnly = (date: Date) => date.toISOString().slice(0, 10);

export const parseDateOnly = (value: string) => new Date(`${value}T00:00:00Z`);
