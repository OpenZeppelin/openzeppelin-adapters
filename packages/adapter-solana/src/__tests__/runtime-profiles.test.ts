import { describe, expect, it } from 'vitest';

import { UnsupportedProfileError } from '@openzeppelin/ui-types';

import { solanaDevnet } from '../networks';
import { createRuntime } from '../profiles/shared-state';

describe('createRuntime profile matrix', () => {
  it('throws UnsupportedProfileError for operator profile (no accessControl capability)', () => {
    expect(() => createRuntime('operator', solanaDevnet)).toThrow(UnsupportedProfileError);

    try {
      createRuntime('operator', solanaDevnet);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedProfileError);
      const profileError = error as UnsupportedProfileError;
      expect(profileError.missingCapabilities).toContain('accessControl');
    }
  });

  it('constructs declarative runtime', () => {
    const runtime = createRuntime('declarative', solanaDevnet);
    expect(runtime.addressing).toBeDefined();
    runtime.dispose();
  });
});
