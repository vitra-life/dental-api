import { orderedCodes } from './grants.js';

describe('orderedCodes', () => {
  // As codesOf returns it: catalogue order, removed items absent.
  const codeOf = new Map([
    ['p1', 'client.view'],
    ['p2', 'client.create'],
    ['p3', 'appointment.view'],
  ]);

  it('puts codes in catalogue order, whatever order the grants came in', () => {
    expect(orderedCodes(['p3', 'p1', 'p2'], codeOf)).toEqual([
      'client.view',
      'client.create',
      'appointment.view',
    ]);
  });

  it('skips grants of items no longer in the catalogue', () => {
    expect(orderedCodes(['gone', 'p2'], codeOf)).toEqual(['client.create']);
  });

  it('is empty for no grants', () => {
    expect(orderedCodes([], codeOf)).toEqual([]);
  });
});
