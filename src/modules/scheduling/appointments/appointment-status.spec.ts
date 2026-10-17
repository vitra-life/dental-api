import { canChangeStatus, isEditable } from './appointment-status.js';

describe('canChangeStatus', () => {
  it.each([
    ['pending', 'confirmed'],
    ['pending', 'completed'],
    ['pending', 'cancelled'],
    ['pending', 'no_show'],
    ['confirmed', 'completed'],
    ['confirmed', 'cancelled'],
    ['confirmed', 'no_show'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canChangeStatus(from, to)).toBe(true);
  });

  it.each([
    ['confirmed', 'pending'],
    ['completed', 'cancelled'],
    ['cancelled', 'pending'],
    ['no_show', 'completed'],
  ] as const)('refuses %s → %s', (from, to) => {
    expect(canChangeStatus(from, to)).toBe(false);
  });
});

describe('isEditable', () => {
  it('is true only before the appointment is settled', () => {
    expect(isEditable('pending')).toBe(true);
    expect(isEditable('confirmed')).toBe(true);
    expect(isEditable('completed')).toBe(false);
    expect(isEditable('cancelled')).toBe(false);
    expect(isEditable('no_show')).toBe(false);
  });
});
