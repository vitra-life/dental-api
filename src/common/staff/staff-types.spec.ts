import type { Db } from '../../core/prisma/db.js';
import { staffTypesOf } from './staff-types.js';

/** Just the two delegates staffTypesOf reads. */
function fakeDb(
  links: { membership_id: string; staff_type_id: string }[],
  types: { id: string; code: string }[],
) {
  const calls = { links: 0, types: 0 };
  const db = {
    membershipStaffType: {
      findMany: async () => {
        calls.links++;
        return links;
      },
    },
    staffType: {
      findMany: async () => {
        calls.types++;
        return types;
      },
    },
  } as unknown as Db;
  return { db, calls };
}

describe('staffTypesOf', () => {
  it('groups codes by membership', async () => {
    const { db } = fakeDb(
      [
        { membership_id: 'm1', staff_type_id: 't-doc' },
        { membership_id: 'm2', staff_type_id: 't-sec' },
        { membership_id: 'm1', staff_type_id: 't-sec' },
      ],
      [
        { id: 't-doc', code: 'doctor' },
        { id: 't-sec', code: 'secretary' },
      ],
    );
    const result = await staffTypesOf(db, ['m1', 'm2', 'm3']);
    expect(result.get('m1')).toEqual(['doctor', 'secretary']);
    expect(result.get('m2')).toEqual(['secretary']);
    expect(result.has('m3')).toBe(false);
  });

  it('skips links to unknown staff types', async () => {
    const { db } = fakeDb([{ membership_id: 'm1', staff_type_id: 'gone' }], []);
    expect((await staffTypesOf(db, ['m1'])).has('m1')).toBe(false);
  });

  it('makes no query for no memberships', async () => {
    const { db, calls } = fakeDb([], []);
    expect((await staffTypesOf(db, [])).size).toBe(0);
    expect(calls).toEqual({ links: 0, types: 0 });
  });
});
