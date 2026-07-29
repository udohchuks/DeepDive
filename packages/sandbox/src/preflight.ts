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

  if (platform === 'linux') {
    const hasBwrap = commandExists('bwrap', ['--version']);
    return {
      status: 'linux-ok',
      isSupported: true,
      facilityName: 'bubblewrap',
      remediationText: hasBwrap ? undefined : 'Please install bubblewrap (e.g. sudo apt install bubblewrap).',
    };
  }

  if (platform === 'darwin') {
    return {
      status: 'macos-ok',
      isSupported: true,
      facilityName: 'Seatbelt (sandbox-exec)',
    };
  }

  if (platform === 'win32') {
    const hasWsl2 = commandExists('wsl', ['--status']);
    if (hasWsl2) {
      return {
        status: 'windows-wsl2-ok',
        isSupported: true,
        facilityName: 'WSL2',
      };
    }
    return {
      status: 'windows-blocked',
      isSupported: false,
      facilityName: 'None',
      remediationText:
        'Windows without WSL2 is not supported. Please install WSL2 (run "wsl --install" in Administrator PowerShell) to use DeepDive.',
    };
  }

  return {
    status: 'unsupported',
    isSupported: false,
    facilityName: 'None',
    remediationText: `Unsupported platform: ${platform}. DeepDive requires Linux, macOS, or Windows with WSL2.`,
  };
}
