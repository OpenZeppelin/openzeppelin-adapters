import { describe, expect, it } from 'vitest';

import { UnsupportedProfileError } from '@openzeppelin/ui-types';

import { midnightTestnet } from '../networks/testnet';
import { createRuntime } from '../profiles/shared-state';

describe('createRuntime profile matrix', () => {
  it('throws UnsupportedProfileError for operator profile (no accessControl capability)', () => {
    expect(() => createRuntime('operator', midnightTestnet)).toThrow(UnsupportedProfileError);

    try {
      createRuntime('operator', midnightTestnet);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedProfileError);
      const profileError = error as UnsupportedProfileError;
      expect(profileError.missingCapabilities).toContain('accessControl');
    }
  });

  it('constructs declarative runtime', () => {
    const runtime = createRuntime('declarative', midnightTestnet);
    expect(runtime.addressing).toBeDefined();
    runtime.dispose();
  });
});
