import { describe, it, expect } from 'vitest';
import { runPreflight, createSandboxWrapper } from '../src/index.js';

describe('Sandbox Wrapper Integration (Phase 2.2)', () => {
  it('selects and initializes sandbox wrapper per platform', () => {
    const preflight = runPreflight({
      platform: () => process.platform,
      commandExists: () => true,
    });
    if (preflight.isSupported) {
      const wrapper = createSandboxWrapper(preflight);
      expect(wrapper).toBeDefined();
    } else {
      expect(preflight.status).toBe('windows-blocked');
    }
  });
});
