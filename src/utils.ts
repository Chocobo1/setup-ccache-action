import * as Core from '@actions/core';
import * as Exec from '@actions/exec';
import * as FS from 'fs';
import * as OS from 'os';
import * as Path from 'path';
import * as Process from 'process';


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

export function getOverrideCacheKey(): string {
  return valueOr(Core.getInput('override_cache_key'), `setup-ccache-action_${Process.platform}`);
}

export function getOverrideCacheKeyFallback(): string {
  return valueOr(Core.getInput('override_cache_key_fallback'), `setup-ccache-action`);
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

function valueOr(value: string, fallback: string): string {
  return (value.length > 0) ? value : fallback;
}
