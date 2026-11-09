import { BadRequestException } from '@nestjs/common';
import { ParseIdPipe } from './parse-id.pipe.js';

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();
  const meta = { type: 'param', data: 'membershipId' } as const;

  it('passes a v7 UUID through', () => {
    const id = '019a3b2c-1d2e-7f30-8a41-b2c3d4e5f607';
    expect(pipe.transform(id, meta)).toBe(id);
  });

  it('rejects anything else with a 400 naming the parameter', () => {
    try {
      pipe.transform('42', meta);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        message: 'Validation failed',
        details: [
          { field: 'membershipId', errors: ['membershipId must be a UUID'] },
        ],
      });
    }
  });
});
