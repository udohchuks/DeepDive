import { PreflightResult } from './preflight.js';
import { SandboxWrapper } from './types.js';
import { LinuxBubblewrapWrapper } from './linux_bubblewrap.js';
import { MacosSeatbeltWrapper } from './macos_seatbelt.js';
import { WindowsWsl2Wrapper } from './windows_wsl2.js';

export class UnsandboxedExecutionBlockedError extends Error {
  constructor(public preflight: PreflightResult) {
    super(
      `Unsandboxed execution is blocked! Sandbox facility unavailable: ${preflight.status}. ${
        preflight.remediationText ?? ''
      }`,
    );
    this.name = 'UnsandboxedExecutionBlockedError';
  }
}

export function createSandboxWrapper(preflight: PreflightResult): SandboxWrapper {
  if (!preflight.isSupported) {
    throw new UnsandboxedExecutionBlockedError(preflight);
  }

  switch (preflight.status) {
    case 'linux-ok':
      return new LinuxBubblewrapWrapper();
    case 'macos-ok':
      return new MacosSeatbeltWrapper();
    case 'windows-wsl2-ok':
      return new WindowsWsl2Wrapper();
    default:
      throw new UnsandboxedExecutionBlockedError(preflight);
  }
}
