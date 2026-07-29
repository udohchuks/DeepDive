export type PreflightStatus =
  | 'linux-ok'
  | 'macos-ok'
  | 'windows-wsl2-ok'
  | 'windows-blocked'
  | 'unsupported';

export interface PreflightResult {
  status: PreflightStatus;
  isSupported: boolean;
  facilityName: string;
  remediationText?: string;
}

export interface SystemProbes {
  platform: () => string; // 'linux' | 'darwin' | 'win32'
  commandExists: (cmd: string, args?: string[]) => boolean;
}

export function runPreflight(probes?: SystemProbes): PreflightResult {
  const platform = probes?.platform() ?? process.platform;
  const commandExists =
    probes?.commandExists ??
    ((_cmd: string) => {
      return false; // Production probe override passed at runtime
    });

  // Every platform must fail closed: a missing sandbox facility is unsupported,
  // never "supported with a remediation note". There is no unsandboxed fallback.
  if (platform === 'linux') {
    const hasBwrap = commandExists('bwrap', ['--version']);
    if (hasBwrap) {
      return {
        status: 'linux-ok',
        isSupported: true,
        facilityName: 'bubblewrap',
      };
    }
    return {
      status: 'unsupported',
      isSupported: false,
      facilityName: 'None',
      remediationText:
        'bubblewrap is required on Linux but was not found. Install it (e.g. sudo apt install bubblewrap) and retry.',
    };
  }

  if (platform === 'darwin') {
    const hasSeatbelt = commandExists('sandbox-exec', ['-n', 'no-network', '/usr/bin/true']);
    if (hasSeatbelt) {
      return {
        status: 'macos-ok',
        isSupported: true,
        facilityName: 'Seatbelt (sandbox-exec)',
      };
    }
    return {
      status: 'unsupported',
      isSupported: false,
      facilityName: 'None',
      remediationText:
        'sandbox-exec (Seatbelt) is required on macOS but was not found or is not executable.',
    };
  }

  if (platform === 'win32') {
    const hasWsl2 = commandExists('wsl', ['--status']);
    if (!hasWsl2) {
      return {
        status: 'windows-blocked',
        isSupported: false,
        facilityName: 'None',
        remediationText:
          'Windows without WSL2 is not supported. Install WSL2 (run "wsl --install" in an Administrator PowerShell) to use DeepDive.',
      };
    }

    // WSL2 alone is a VM boundary, not a path-level policy. The mount policy is
    // enforced by bubblewrap inside the VM, so bwrap must exist there too.
    const hasBwrapInWsl = commandExists('wsl', ['--exec', 'bwrap', '--version']);
    if (!hasBwrapInWsl) {
      return {
        status: 'windows-blocked',
        isSupported: false,
        facilityName: 'None',
        remediationText:
          'WSL2 is installed but bubblewrap is missing inside it. Run "wsl --exec sudo apt-get install -y bubblewrap" to enable sandboxing.',
      };
    }

    return {
      status: 'windows-wsl2-ok',
      isSupported: true,
      facilityName: 'WSL2 + bubblewrap',
    };
  }

  return {
    status: 'unsupported',
    isSupported: false,
    facilityName: 'None',
    remediationText: `Unsupported platform: ${platform}. DeepDive requires Linux, macOS, or Windows with WSL2.`,
  };
}
