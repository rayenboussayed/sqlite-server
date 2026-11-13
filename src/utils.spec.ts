import { z } from 'zod';
import { createArraySchema, sha512 } from './utils.js';

describe('createArraySchema', () => {
  const schema = createArraySchema(z.object({ key: z.string() }));

  it('wraps a single value in an array', () => {
    expect(schema.parse({ key: 'a' })).toEqual([{ key: 'a' }]);
  });

  it('passes an array through unchanged', () => {
    expect(schema.parse([{ key: 'a' }, { key: 'b' }])).toEqual([
      { key: 'a' },
      { key: 'b' },
    ]);
  });

  it('rejects values matching neither branch', () => {
    expect(() => schema.parse(42)).toThrow();
  });
});

describe('sha512', () => {
  it('produces a 64-byte digest', () => {
    expect(sha512('payload')).toHaveLength(64);
    expect(sha512(Buffer.from('payload'))).toEqual(sha512('payload'));
  });
});
