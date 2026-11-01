import type { PermissionScope } from '../../generated/prisma/enums.js';
import { grantsBeyond, normaliseScope } from './delegation.js';
import { mergeGrants } from './effective-permissions.js';

const caller = new Map<string, PermissionScope>([
  ['appointments', 'clinic'],
  ['appointments.list.view', 'assigned'],
  ['clients.record.create', 'clinic'],
]);

describe('grantsBeyond', () => {
  it('allows what the caller holds, at the same or a narrower scope', () => {
    expect(
      grantsBeyond(caller, [
        { code: 'appointments.list.view', scope: 'assigned' },
        { code: 'appointments.list.view', scope: 'own' },
        { code: 'appointments', scope: 'clinic' },
      ]),
    ).toEqual([]);
  });

  it('refuses a wider scope or an item the caller lacks', () => {
    expect(
      grantsBeyond(caller, [
        { code: 'appointments.list.view', scope: 'clinic' },
        { code: 'settings.roles.manage', scope: 'clinic' },
      ]).map((g) => g.code),
    ).toEqual(['appointments.list.view', 'settings.roles.manage']);
  });

  it('ignores scope for items that do not touch data', () => {
    expect(
      grantsBeyond(caller, [
        { code: 'clients.record.create', scope: 'clinic' },
      ]),
    ).toEqual([]);
  });
});

describe('normaliseScope', () => {
  it('keeps the scope of data items and sets clinic for the rest', () => {
    expect(
      normaliseScope({ code: 'appointments.list.view', scope: 'own' }).scope,
    ).toBe('own');
    expect(normaliseScope({ code: 'appointments', scope: 'own' }).scope).toBe(
      'clinic',
    );
  });
});

describe('mergeGrants', () => {
  it('keeps the widest scope when roles overlap', () => {
    const merged = mergeGrants([
      { code: 'appointments', scope: 'clinic' },
      { code: 'appointments.list.view', scope: 'own' },
      { code: 'appointments.list.view', scope: 'clinic' },
      { code: 'appointments.list.view', scope: 'assigned' },
    ]);
    expect(merged.get('appointments.list.view')).toBe('clinic');
  });

  it('drops items whose page is not granted', () => {
    const merged = mergeGrants([
      { code: 'appointments.booking.create', scope: 'clinic' },
      { code: 'prescriptions.create', scope: 'own' },
    ]);
    expect(merged.has('appointments.booking.create')).toBe(false);
    // A root item that is not under a page needs nothing else.
    expect(merged.get('prescriptions.create')).toBe('own');
  });
});
