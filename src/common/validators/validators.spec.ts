import { plainToInstance } from 'class-transformer';
import { IsOptional, validateSync } from 'class-validator';
import { IsBloodType } from './blood-type.js';
import { IsDateTimeWithZone, IsPastDate, todayInIran } from './dates.js';
import { IsIranianMobile } from './iranian-mobile.js';
import { isValidNationalId, IsNationalId } from './national-id.js';
import { toLatinDigits } from './transforms.js';

class Sample {
  @IsOptional()
  @IsIranianMobile()
  phone?: string | null;

  @IsOptional()
  @IsNationalId()
  national_id?: string | null;

  @IsOptional()
  @IsBloodType()
  blood_type?: string;

  @IsOptional()
  @IsPastDate()
  birth_date?: string;

  @IsOptional()
  @IsDateTimeWithZone()
  start_time?: string;
}

/** The transformed object and the names of the fields that failed. */
function check(plain: Partial<Record<keyof Sample, unknown>>) {
  const instance = plainToInstance(Sample, plain);
  const failed = validateSync(instance).map((e) => e.property);
  return { instance, failed };
}

describe('toLatinDigits', () => {
  it('converts Persian and Arabic digits only', () => {
    expect(toLatinDigits('۰۹۱۲ ٣٤٥ abc')).toBe('0912 345 abc');
  });
});

describe('IsIranianMobile', () => {
  it('accepts 09 and nine digits, also in Persian digits', () => {
    expect(check({ phone: '09121234567' }).failed).toEqual([]);
    const { instance, failed } = check({ phone: ' ۰۹۱۲۱۲۳۴۵۶۷ ' });
    expect(failed).toEqual([]);
    expect(instance.phone).toBe('09121234567');
  });

  it.each(['9121234567', '0912123456', '+989121234567', '0812345678x'])(
    'rejects %s',
    (phone) => {
      expect(check({ phone }).failed).toEqual(['phone']);
    },
  );

  it('turns an empty optional value into null', () => {
    const { instance, failed } = check({ phone: '' });
    expect(failed).toEqual([]);
    expect(instance.phone).toBeNull();
  });
});

describe('isValidNationalId', () => {
  it.each(['0012345679', '0123456789', '1234567891'])('accepts %s', (id) => {
    expect(isValidNationalId(id)).toBe(true);
  });

  it.each(['0012345678', '1111111111', '123456789', '12345678901'])(
    'rejects %s',
    (id) => {
      expect(isValidNationalId(id)).toBe(false);
    },
  );

  it('accepts Persian digits through the decorator', () => {
    expect(check({ national_id: '۰۰۱۲۳۴۵۶۷۹' }).failed).toEqual([]);
  });
});

describe('IsBloodType', () => {
  it('accepts the eight groups only', () => {
    expect(check({ blood_type: 'AB-' }).failed).toEqual([]);
    expect(check({ blood_type: 'C+' }).failed).toEqual(['blood_type']);
  });
});

describe('IsPastDate', () => {
  it('accepts a past YYYY-MM-DD date and today', () => {
    expect(check({ birth_date: '1985-04-12' }).failed).toEqual([]);
    expect(check({ birth_date: todayInIran() }).failed).toEqual([]);
  });

  it.each(['2999-01-01', '1985-02-30', '1985-4-12', '1985-04-12T00:00:00Z'])(
    'rejects %s',
    (birth_date) => {
      expect(check({ birth_date }).failed).toEqual(['birth_date']);
    },
  );
});

describe('todayInIran', () => {
  it('is already the next day in Tehran late in the UTC evening', () => {
    expect(todayInIran(new Date('2026-10-14T21:00:00Z'))).toBe('2026-10-15');
  });
});

describe('IsDateTimeWithZone', () => {
  it.each(['2026-10-14T09:30:00Z', '2026-10-14T13:00:00+03:30'])(
    'accepts %s',
    (start_time) => {
      expect(check({ start_time }).failed).toEqual([]);
    },
  );

  it.each(['2026-10-14T09:30:00', '2026-10-14', '2026-10-14 09:30:00Z'])(
    'rejects %s',
    (start_time) => {
      expect(check({ start_time }).failed).toEqual(['start_time']);
    },
  );
});
