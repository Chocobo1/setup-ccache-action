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

export async function getCachePath(): Promise<string> {
  const output = await Exec.getExecOutput("ccache --get-config cache_dir", [], { "silent": true });
  if (output.exitCode !== 0)
    Core.warning(`getCachePath() failed: "${output}"`);
  return output.stdout.trim();
}

export function getCcacheConfigPath(): string {
  switch (Process.platform) {
    case 'darwin':
      return Path.join(OS.homedir(), "Library/Preferences/ccache/ccache.conf");
    case 'linux':
      return Path.join(OS.homedir(), ".ccache", "ccache.conf");
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
    default:
      return "";
  }
}

export function getOverrideCacheKey(): IOverrideCacheKey {
  const key = Core.getInput('override_cache_key');
  return {
    isDefault: (key.length == 0),
    value: (key.length > 0) ? key : `setup-ccache-action_${Process.env.RUNNER_OS}_${Process.env.GITHUB_JOB}`
  };
}

export function getOverrideCacheKeyFallback(): string[] {
  const fallbackKey = Core.getMultilineInput('override_cache_key_fallback');
  if (fallbackKey.length > 0)
    return fallbackKey;

  const cacheKey = getOverrideCacheKey();
  if (!cacheKey.isDefault)
    return [cacheKey.value];

  return [
    `setup-ccache-action_${Process.env.RUNNER_OS}_${Process.env.GITHUB_JOB}`,
    `setup-ccache-action_${Process.env.RUNNER_OS}`,
    "setup-ccache-action"
  ];
}

export function isSupportedPlatform(): boolean {
  switch (Process.platform) {
    case 'darwin':
    case 'linux':
      return true;
    default:
      return false;
  }
}

export function removeCcacheConfig(): void {
  try {
    FS.unlinkSync(getCcacheConfigPath());
  }
  catch (error) {
    // silence it
  }
}
