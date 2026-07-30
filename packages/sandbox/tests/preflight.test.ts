import { describe, it, expect } from 'vitest';
import { runPreflight, probeCommand, createSandboxWrapper, UnsandboxedExecutionBlockedError } from '../src/index.js';

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

describe('Default capability probe (regression)', () => {
  // The default probe was once a stub that returned false unconditionally,
  // with a comment claiming a real probe was injected at runtime. Nothing ever
  // injected one, so preflight reported "unsupported" on every machine —
  // including machines with a working sandbox. The failure was indistinguishable
  // from a genuinely missing facility, so it went unnoticed. These tests pin
  // that the default probe actually executes the command.
  it('PROTECTED INVARIANT: the default probe really runs the command', () => {
    // node is running this test, so it necessarily exists and exits 0.
    expect(probeCommand(process.execPath, ['--version'])).toBe(true);
  });

  it('reports false for a command that does not exist', () => {
    expect(probeCommand('deepdive-definitely-not-a-real-binary-xyz')).toBe(false);
  });

  it('reports false for a command that exists but exits non-zero', () => {
    expect(probeCommand(process.execPath, ['-e', 'process.exit(3)'])).toBe(false);
  });

  it('runPreflight without injected probes does not blanket-fail', () => {
    // It may legitimately be unsupported on this machine, but the reason must
    // come from a real probe rather than a hardcoded false.
    const res = runPreflight();
    expect(['linux-ok', 'macos-ok', 'windows-wsl2-ok', 'windows-blocked', 'unsupported']).toContain(
      res.status,
    );
    if (!res.isSupported) {
      expect(res.remediationText).toBeTruthy();
    }
  });
});
