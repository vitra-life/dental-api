import { grantsBeyond } from './delegation.js';

describe('grantsBeyond', () => {
  const caller = new Set(['appointment.view', 'appointment.create']);

  it('allows what the caller holds', () => {
    expect(grantsBeyond(caller, ['appointment.view'])).toEqual([]);
  });

  it('lists what the caller does not hold', () => {
    expect(
      grantsBeyond(caller, ['appointment.create', 'workspace.update']),
    ).toEqual(['workspace.update']);
  });
});
