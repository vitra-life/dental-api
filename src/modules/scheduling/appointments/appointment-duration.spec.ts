import {
  APPOINTMENT_DURATIONS,
  defaultDuration,
} from './appointment-duration.js';

describe('defaultDuration', () => {
  it.each(APPOINTMENT_DURATIONS)(
    'keeps a service duration of %i minutes',
    (minutes) => {
      expect(defaultDuration(minutes)).toBe(minutes);
    },
  );

  it.each([5, 25, 40, 75, 480])(
    'falls back to 30 minutes for %i',
    (minutes) => {
      expect(defaultDuration(minutes)).toBe(30);
    },
  );
});
