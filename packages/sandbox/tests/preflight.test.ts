import { describe, it, expect } from 'vitest';
import { runPreflight, createSandboxWrapper, UnsandboxedExecutionBlockedError } from '../src/index.js';

describe('Platform Preflight & Factory (Phase 2.1)', () => {
  it('detects linux-ok when bwrap exists', () => {
    const res = runPreflight({
      platform: () => 'linux',
      commandExists: (cmd) => cmd === 'bwrap',
    });
    expect(res.status).toBe('linux-ok');
    expect(res.isSupported).toBe(true);
    const wrapper = createSandboxWrapper(res);
    expect(wrapper).toBeDefined();
  });

  it('detects macos-ok', () => {
    const res = runPreflight({
      platform: () => 'darwin',
      commandExists: () => true,
    });
    expect(res.status).toBe('macos-ok');
    expect(res.isSupported).toBe(true);
    const wrapper = createSandboxWrapper(res);
    expect(wrapper).toBeDefined();
  });

  it('detects windows-wsl2-ok when wsl exists', () => {
    const res = runPreflight({
      platform: () => 'win32',
      commandExists: (cmd) => cmd === 'wsl',
    });
    expect(res.status).toBe('windows-wsl2-ok');
    expect(res.isSupported).toBe(true);
    const wrapper = createSandboxWrapper(res);
    expect(wrapper).toBeDefined();
  });

  it('PROTECTED HARD BLOCK: Windows without WSL2 returns windows-blocked and throws on factory creation', () => {
    const res = runPreflight({
      platform: () => 'win32',
      commandExists: () => false,
    });
    expect(res.status).toBe('windows-blocked');
    expect(res.isSupported).toBe(false);
    expect(res.remediationText).toContain('wsl --install');

    // Factory throws UnsandboxedExecutionBlockedError
    expect(() => createSandboxWrapper(res)).toThrow(UnsandboxedExecutionBlockedError);
  });
});
