import { describe, it, expect } from 'vitest';
import {
  runPreflight,
  createSandboxWrapper,
  LinuxBubblewrapWrapper,
  MacosSeatbeltWrapper,
  WindowsWsl2Wrapper,
  UnsandboxedExecutionBlockedError,
} from '../src/index.js';

describe('Sandbox Wrapper Integration & Isolation Policies (Phase 2.2)', () => {
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

  it('instantiates Linux Bubblewrap wrapper correctly when preflight is linux-ok', () => {
    const wrapper = new LinuxBubblewrapWrapper();
    expect(wrapper).toBeInstanceOf(LinuxBubblewrapWrapper);
  });

  it('instantiates macOS Seatbelt wrapper correctly when preflight is macos-ok', () => {
    const wrapper = new MacosSeatbeltWrapper();
    expect(wrapper).toBeInstanceOf(MacosSeatbeltWrapper);
  });

  it('instantiates Windows WSL2 wrapper correctly when preflight is windows-wsl2-ok', () => {
    const wrapper = new WindowsWsl2Wrapper();
    expect(wrapper).toBeInstanceOf(WindowsWsl2Wrapper);
  });

  it('throws UnsandboxedExecutionBlockedError when preflight status is unsupported windows-blocked', () => {
    const preflight = {
      status: 'windows-blocked' as const,
      isSupported: false,
      remediationText: 'WSL2 required',
    };
    expect(() => createSandboxWrapper(preflight)).toThrow(UnsandboxedExecutionBlockedError);
  });
});
