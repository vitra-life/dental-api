import { overlaps } from './appointment-overlap.js';

const at = (time: string) => new Date(`2026-11-02T${time}:00Z`);

describe('overlaps', () => {
  it('is true when one appointment starts inside the other', () => {
    expect(overlaps(at('09:00'), 45, at('09:30'), 30)).toBe(true);
    expect(overlaps(at('09:30'), 30, at('09:00'), 45)).toBe(true);
  });

  it('is true when one contains the other', () => {
    expect(overlaps(at('09:00'), 120, at('09:30'), 20)).toBe(true);
  });

  it('is false when one ends exactly as the other starts', () => {
    expect(overlaps(at('09:00'), 30, at('09:30'), 30)).toBe(false);
  });

  it('is false for separate times', () => {
    expect(overlaps(at('09:00'), 30, at('11:00'), 30)).toBe(false);
  });
});
