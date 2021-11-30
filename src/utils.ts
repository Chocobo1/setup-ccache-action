import * as Core from '@actions/core';
import * as Exec from '@actions/exec';
import * as FS from 'fs';
import * as OS from 'os';
import * as Path from 'path';
import * as Process from 'process';


interface IOverrideCacheKey {
  isDefault: boolean,
  value: string
}

function getDefaultCacheKeys(): string[] {
  const env = Process.env;
  const keys = [
    "setup-ccache-action",
    env.GITHUB_WORKFLOW!,
    env.GITHUB_JOB!,
    env.ImageOS!
  ];

  // let PR have its own cache series
  if (env.GITHUB_HEAD_REF!.length > 0)
    keys.push(`${env.GITHUB_ACTOR}-${env.GITHUB_HEAD_REF}`);

  return keys;
}

export async function getCachePath(): Promise<string> {
  const execOptions = {
    "ignoreReturnCode": true,
    "silent": true
  };

  const getOutput = await Exec.getExecOutput(platformExecWrap("ccache --get-config cache_dir"), [], execOptions);
  if (getOutput.exitCode === 0)
    return getOutput.stdout.trim();

  // parse the output manually since `--get-config` is not available on older ccache versions: ubuntu-18.04 have ccache 3.4.1
  const configOutput = await Exec.getExecOutput(platformExecWrap("ccache -p"), [], execOptions);
  return configOutput.stdout.match(/(?<=cache_dir = ).+/)![0].trim();
}

export async function getCcacheConfigPath(): Promise<string> {
  switch (Process.platform) {
    case 'darwin':
      return Path.join(OS.homedir(), "Library/Preferences/ccache/ccache.conf");
    case 'linux':
      return Path.join(OS.homedir(), ".ccache", "ccache.conf");
    case 'win32':
      switch (Core.getInput("windows_compile_environment")) {
        case 'msys2':
          return Path.join(await getCachePath(), "ccache.conf");
        default:
          return "";
      }
    default:
      return "";
  }
}

export function getCcacheSymlinksPath(): string {
  switch (Process.platform) {
    case 'darwin':
      return "/usr/local/opt/ccache/libexec";
    case 'linux':
      return "/usr/lib/ccache";
    case 'win32':
      switch (Core.getInput("windows_compile_environment")) {
        case 'msys2':
          return `${Process.env.MSYSTEM_PREFIX}/lib/ccache/bin`;
        default:
          return "";
      }
    default:
      return "";
  }
}

export async function getCcacheVersion(): Promise<number[]> {
  const execOptions = {
    "silent": true
  };

  const versionOutput = await Exec.getExecOutput(platformExecWrap("ccache --version"), [], execOptions);
  if (versionOutput.exitCode !== 0)
    return [];

  const match = versionOutput.stdout.match(/version (.*)/);
  if (!match || (match.length < 2))
    return [];

  const versionString = match[1];
  return versionString.split('.').map(parseInt);
}

export async function getMsysInstallationPath(): Promise<string> {
  const execOptions = {
    "silent": true
  };

  const pwdOutput = await Exec.getExecOutput(platformExecWrap("cd ~ && pwd -W"), [], execOptions);
  if (pwdOutput.exitCode !== 0)
    return "";

  const basePath = Path.normalize(pwdOutput.stdout.trim() + "/../..");
  return basePath;
}

export function getOverrideCacheKey(): IOverrideCacheKey {
  const key = Core.getInput('override_cache_key');
  return {
    isDefault: (key.length == 0),
    value: (key.length > 0) ? key : getDefaultCacheKeys().join('_')
  };
}

export function getOverrideCacheKeyFallback(): string[] {
  const fallbackKey = Core.getMultilineInput('override_cache_key_fallback');
  if (fallbackKey.length > 0)
    return fallbackKey;

  const cacheKey = getOverrideCacheKey();
  if (!cacheKey.isDefault)
    return [cacheKey.value];

  return getDefaultCacheKeys().reduceRight((acc, _, index, array) => {
    acc.push(array.slice(0, (index + 1)).join('_'));
    return acc;
  }, [] as string[]);
}

export function isSupportedPlatform(): boolean {
  switch (Process.platform) {
    case 'darwin':
    case 'linux':
      return true;

    case 'win32':
      switch (Core.getInput("windows_compile_environment")) {
        case 'msys2':
          return true;
        default:
          return false;
      }

    default:
      return false;
  }
}

export function msysPackagePrefix(): string {
  switch (Process.env.MSYSTEM) {
    case 'CLANG32':
      return "mingw-w64-clang-i686-";
    case 'CLANG64':
      return "mingw-w64-clang-x86_64-";
    case 'MINGW32':
      return "mingw-w64-i686-";
    case 'MINGW64':
      return "mingw-w64-x86_64-";
    case 'MSYS':
    default:
      return "";
    case 'UCRT64':
      return "mingw-w64-ucrt-x86_64-";
  }
}

export function platformExecWrap(command: string): string {
  switch (Process.platform) {
    case 'darwin':
    case 'linux':
      return command;

    case 'win32':
      switch (Core.getInput("windows_compile_environment")) {
        case 'msys2':
          return `msys2 -c "${command.replace(/"/g, '\\"')}"`;

        default:
          return "";
      }

    default:
      return "";
  }
}

export async function removeCcacheConfig(): Promise<void> {
  try {
    FS.unlinkSync(await getCcacheConfigPath());
  }
  catch (error) {
    // silence it
  }
}

export function sudoCommandWrap(command: string): string {
  return ((Process.getuid() !== 0) ? "sudo " : "") + command;
}
