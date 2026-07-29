import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  runPreflight,
  createSandboxWrapper,
  LinuxBubblewrapWrapper,
  MacosSeatbeltWrapper,
  WindowsWsl2Wrapper,
  UnsandboxedExecutionBlockedError,
  buildBubblewrapArgs,
  buildSeatbeltProfile,
  buildWsl2Args,
  toWslPath,
  MountPolicy,
  SandboxExecutionOptions,
} from '../src/index.js';

const emptyPolicy: MountPolicy = { readOnlyPaths: [], readWritePaths: [], blockedPaths: [] };

function opts(policy: MountPolicy, over: Partial<SandboxExecutionOptions> = {}): SandboxExecutionOptions {
  return { cwd: '/work', command: 'echo', args: ['hi'], mountPolicy: policy, ...over };
}

describe('Sandbox wrapper selection (Phase 2.2)', () => {
  it('selects the wrapper matching the host platform', () => {
    const preflight = runPreflight({ platform: () => process.platform, commandExists: () => true });
    if (preflight.isSupported) {
      expect(createSandboxWrapper(preflight)).toBeDefined();
    } else {
      expect(preflight.isSupported).toBe(false);
    }
  });

  it('maps each supported status to its wrapper class', () => {
    const mk = (status: 'linux-ok' | 'macos-ok' | 'windows-wsl2-ok') => ({
      status,
      isSupported: true,
      facilityName: 'x',
    });
    expect(createSandboxWrapper(mk('linux-ok'))).toBeInstanceOf(LinuxBubblewrapWrapper);
    expect(createSandboxWrapper(mk('macos-ok'))).toBeInstanceOf(MacosSeatbeltWrapper);
    expect(createSandboxWrapper(mk('windows-wsl2-ok'))).toBeInstanceOf(WindowsWsl2Wrapper);
  });

  it('PROTECTED INVARIANT: no unsandboxed fallback exists for any unsupported host', () => {
    for (const status of ['windows-blocked', 'unsupported'] as const) {
      expect(() =>
        createSandboxWrapper({ status, isSupported: false, facilityName: 'None', remediationText: 'x' }),
      ).toThrow(UnsandboxedExecutionBlockedError);
    }
  });

  it('PROTECTED INVARIANT: preflight fails closed when the sandbox facility is missing', () => {
    const linuxNoBwrap = runPreflight({ platform: () => 'linux', commandExists: () => false });
    expect(linuxNoBwrap.isSupported).toBe(false);
    expect(linuxNoBwrap.remediationText).toMatch(/bubblewrap/i);

    const macNoSeatbelt = runPreflight({ platform: () => 'darwin', commandExists: () => false });
    expect(macNoSeatbelt.isSupported).toBe(false);

    const winNoWsl = runPreflight({ platform: () => 'win32', commandExists: () => false });
    expect(winNoWsl.status).toBe('windows-blocked');
    expect(winNoWsl.isSupported).toBe(false);

    // …and succeeds only when the facility is actually present.
    expect(runPreflight({ platform: () => 'linux', commandExists: () => true }).isSupported).toBe(true);
    expect(runPreflight({ platform: () => 'darwin', commandExists: () => true }).isSupported).toBe(true);
    expect(runPreflight({ platform: () => 'win32', commandExists: () => true }).isSupported).toBe(true);
  });
});

describe('Bubblewrap argument construction', () => {
  it('PROTECTED INVARIANT: an empty mount policy binds nothing', () => {
    const args = buildBubblewrapArgs(opts(emptyPolicy));
    expect(args).toContain('--unshare-all');
    expect(args).toContain('--die-with-parent');
    expect(args).not.toContain('--bind');
    expect(args).not.toContain('--ro-bind');
  });

  it('binds read-only paths read-only and writable paths writable', () => {
    const args = buildBubblewrapArgs(
      opts({ readOnlyPaths: ['/repo'], readWritePaths: ['/work/scaffold'], blockedPaths: [] }),
    );
    expect(args.join(' ')).toContain('--ro-bind /repo /repo');
    expect(args.join(' ')).toContain('--bind /work/scaffold /work/scaffold');
  });

  it('PROTECTED INVARIANT: a blocked path is masked and overrides an overlapping bind', () => {
    const args = buildBubblewrapArgs(
      opts({ readOnlyPaths: [], readWritePaths: ['/work'], blockedPaths: ['/work/.git'] }),
    );
    const bindIdx = args.indexOf('--bind');
    const tmpfsIdx = args.indexOf('--tmpfs');
    expect(tmpfsIdx).toBeGreaterThan(bindIdx);
    expect(args[tmpfsIdx + 1]).toBe('/work/.git');
  });

  it('terminates options before the command so arguments cannot be reinterpreted', () => {
    const args = buildBubblewrapArgs(opts(emptyPolicy, { command: 'sh', args: ['-c', 'echo hi'] }));
    const sep = args.indexOf('--');
    expect(sep).toBeGreaterThan(-1);
    expect(args[sep + 1]).toBe('sh');
  });
});

describe('WSL2 path translation and policy enforcement', () => {
  it('translates Windows drive paths to their WSL2 mount points', () => {
    expect(toWslPath('C:\\Users\\me\\work')).toBe('/mnt/c/Users/me/work');
    expect(toWslPath('D:/data/repo')).toBe('/mnt/d/data/repo');
    expect(toWslPath('C:\\')).toBe('/mnt/c');
    expect(toWslPath('C:\\work\\')).toBe('/mnt/c/work');
  });

  it('passes POSIX paths through unchanged', () => {
    expect(toWslPath('/home/student/work')).toBe('/home/student/work');
  });

  it('PROTECTED INVARIANT: rejects paths it cannot translate rather than guessing', () => {
    expect(() => toWslPath('\\\\server\\share')).toThrow(/UNC/);
    expect(() => toWslPath('relative/path')).toThrow(/Cannot translate/);
  });

  it('PROTECTED INVARIANT: the mount policy is enforced by bubblewrap inside the VM', () => {
    const args = buildWsl2Args(
      opts(
        { readOnlyPaths: ['C:\\repo'], readWritePaths: ['C:\\work\\scaffold'], blockedPaths: ['C:\\work\\.git'] },
        { cwd: 'C:\\work' },
      ),
    );

    // wsl.exe delegates to bwrap, not straight to the command.
    expect(args.slice(0, 2)).toEqual(['--exec', 'bwrap']);
    expect(args).toContain('--unshare-all');

    const joined = args.join(' ');
    expect(joined).toContain('--ro-bind /mnt/c/repo /mnt/c/repo');
    expect(joined).toContain('--bind /mnt/c/work/scaffold /mnt/c/work/scaffold');
    expect(joined).toContain('--tmpfs /mnt/c/work/.git');
    expect(joined).toContain('--chdir /mnt/c/work');
  });

  it('PROTECTED INVARIANT: an empty policy grants no filesystem access on Windows either', () => {
    const args = buildWsl2Args(opts(emptyPolicy, { cwd: 'C:\\work' }));
    expect(args).not.toContain('--bind');
    expect(args).not.toContain('--ro-bind');
  });

  it('PROTECTED INVARIANT: an untranslatable path fails the run instead of executing unsandboxed', async () => {
    const result = await new WindowsWsl2Wrapper().execute(
      opts({ readOnlyPaths: ['\\\\server\\share'], readWritePaths: [], blockedPaths: [] }, { cwd: 'C:\\work' }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/UNC/);
  });

  it('PROTECTED INVARIANT: preflight blocks Windows when bubblewrap is missing inside WSL2', () => {
    const noBwrap = runPreflight({
      platform: () => 'win32',
      commandExists: (_cmd, args) => !(args ?? []).includes('bwrap'),
    });
    expect(noBwrap.status).toBe('windows-blocked');
    expect(noBwrap.isSupported).toBe(false);
    expect(noBwrap.remediationText).toMatch(/bubblewrap/i);

    const ready = runPreflight({ platform: () => 'win32', commandExists: () => true });
    expect(ready.status).toBe('windows-wsl2-ok');
    expect(ready.facilityName).toBe('WSL2 + bubblewrap');
  });
});

describe('Seatbelt profile construction', () => {
  it('PROTECTED INVARIANT: the profile denies by default and denies network', () => {
    const profile = buildSeatbeltProfile(emptyPolicy);
    expect(profile).toContain('(deny default)');
    expect(profile).toContain('(deny network*)');
    expect(profile).not.toContain('(allow default)');
  });

  it('grants write only to explicitly writable paths', () => {
    const profile = buildSeatbeltProfile({
      readOnlyPaths: ['/repo'],
      readWritePaths: ['/work/scaffold'],
      blockedPaths: [],
    });
    expect(profile).toContain('(allow file-read* (subpath "/repo"))');
    expect(profile).toContain('(allow file-read* file-write* (subpath "/work/scaffold"))');
    expect(profile).not.toContain('file-write* (subpath "/repo")');
  });

  it('PROTECTED INVARIANT: a blocked path is denied after any overlapping grant', () => {
    const profile = buildSeatbeltProfile({
      readOnlyPaths: [],
      readWritePaths: ['/work'],
      blockedPaths: ['/work/.git'],
    });
    expect(profile.indexOf('(deny file-read* file-write* (subpath "/work/.git"))')).toBeGreaterThan(
      profile.indexOf('(allow file-read* file-write* (subpath "/work"))'),
    );
  });

  it('escapes quotes and backslashes in paths', () => {
    const profile = buildSeatbeltProfile({ readOnlyPaths: ['/a"b\\c'], readWritePaths: [], blockedPaths: [] });
    expect(profile).toContain('(subpath "/a\\"b\\\\c")');
  });
});

/**
 * Real out-of-boundary execution (build.md 2.2 definition of done).
 *
 * Runs only where the host actually provides the sandbox facility. On an
 * unsupported host it reports explicitly rather than passing quietly, so the
 * gap stays visible in the run output instead of hiding inside a green suite.
 */
describe('Real sandboxed execution', () => {
  const preflight = runPreflight({
    platform: () => process.platform,
    commandExists: () => process.platform === 'linux',
  });
  const canRunReal = process.platform === 'linux' && preflight.isSupported;

  let workDir: string;
  let outsideFile: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'deepdive-sbx-'));
    outsideFile = join(await mkdtemp(join(tmpdir(), 'deepdive-out-')), 'secret.txt');
    await writeFile(outsideFile, 'classified\n');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it.runIf(canRunReal)('blocks a write outside the sandbox boundary', async () => {
    const wrapper = new LinuxBubblewrapWrapper();
    const result = await wrapper.execute({
      cwd: workDir,
      command: '/bin/sh',
      args: ['-c', `echo pwned > ${outsideFile}`],
      mountPolicy: { readOnlyPaths: ['/bin', '/usr', '/lib', '/lib64'], readWritePaths: [workDir], blockedPaths: [] },
    });

    expect(result.exitCode).not.toBe(0);
    expect(readFileSync(outsideFile, 'utf8')).toBe('classified\n');
  });

  it.runIf(canRunReal)('permits a write inside the sandbox boundary', async () => {
    const wrapper = new LinuxBubblewrapWrapper();
    const target = join(workDir, 'allowed.txt');
    const result = await wrapper.execute({
      cwd: workDir,
      command: '/bin/sh',
      args: ['-c', `echo ok > ${target}`],
      mountPolicy: { readOnlyPaths: ['/bin', '/usr', '/lib', '/lib64'], readWritePaths: [workDir], blockedPaths: [] },
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(target)).toBe(true);
  });

  it('reports when real sandbox execution could not be exercised on this host', () => {
    if (!canRunReal) {
      console.warn(
        `[sandbox] Real out-of-boundary execution NOT verified on platform "${process.platform}". ` +
          'build.md 2.2 requires this on Linux with bubblewrap; CI covers it.',
      );
    }
    expect(typeof canRunReal).toBe('boolean');
  });
});
