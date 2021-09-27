import * as Cache from '@actions/cache';
import * as Core from '@actions/core';
import * as Exec from '@actions/exec';
import * as IO from '@actions/io';
import * as Process from 'process';
import * as Utils from './utils';


async function addSymlinksToPath() {
  await Core.group("Prepend ccache symlinks path to $PATH", async () => {
    const symlinks = Utils.getCcacheSymlinksPath();
    Core.info(`ccache symlinks path: "${symlinks}"`);

    Core.addPath(symlinks);
    Core.info(`PATH=${process.env.PATH}`);
  });
}

async function checkCcacheAvailability() {
  await Core.group("Check ccache availability", async () => {
    const notFoundError = new Error("Cannot find ccache on PATH");

    let ccachePath;
    try {
      ccachePath = await IO.which("ccache", true);
    }
    catch (error) {
      throw notFoundError;
    }
    if (ccachePath.length <= 0)
      throw notFoundError;

    Core.info(`Found ccache at: "${ccachePath}"`);
    await Exec.exec("ccache --version");
  });
}

async function configureCcache() {
  // need to regenerate the config file for each run

  await Core.group("Configure ccache", async () => {
    Utils.removeCcacheConfig();

    const settings = Core.getMultilineInput("ccache_options");
    for (const setting of settings) {
      const keyValue = setting.split("=", 2);
      if (keyValue.length == 2) {
        const [key, value] = keyValue;
        await Exec.exec(`ccache --set-config "${key.trim()}=${value.trim()}"`);
      }
    }

    // `--show-config` is not available on older ccache versions: ubuntu-18.04 have ccache 3.4.1
    await Exec.exec("ccache -p");
  });
}

async function installCcache() {
  await Core.group("Install ccache", async () => {
    switch (Process.platform) {
      case 'darwin':
        await Exec.exec("brew install ccache");
        break;

      case 'linux':
        await Exec.exec("sudo apt install -y ccache");
        break;

      default:
        break;
    }
  });
}

async function restoreCache(): Promise<boolean> {
  return await Core.group("Restore cache", async (): Promise<boolean> => {
    const paths = [await Utils.getCachePath()];
    const primaryKey = Utils.getOverrideCacheKey().value;
    const restoreKeys = Utils.getOverrideCacheKeyFallback();

    Core.info(`Retrieving cache with \`primaryKey\`: "${primaryKey}", \`restoreKeys\`: "${restoreKeys}", \`paths\`: "${paths}"`);
    const cachePath = await Cache.restoreCache(paths, primaryKey, restoreKeys);
    Core.info(cachePath ? `Cache found at: "${cachePath}"` : "Cache not found...");
    return (cachePath ? true : false);
  });
}

async function setOutputVariables() {
  const envVars = new Map([
    ["ccache_symlinks_path", Utils.getCcacheSymlinksPath()]
  ]);

  await Core.group("Create environment variables", async () => {
    for (const [key, value] of envVars) {
      Core.exportVariable(key, value);
      Core.info(`\${{ env.${key} }} = ${value}`);
    }
  });
}

async function updatePackgerIndex() {
  await Core.group("Update packager index", async () => {
    switch (Process.platform) {
      case 'darwin':
        await Exec.exec("brew update");
        break;

      case 'linux':
        await Exec.exec("sudo apt update");
        break;

      default:
        break;
    }
  });
}

export default async function main(): Promise<void> {
  try {
    if (!Utils.isSupportedPlatform()) {
      Core.warning(`setup-ccache-action only support "ubuntu" and "macos" platforms. No operation...`);
      return;
    }

    if (Core.getBooleanInput("update_packager_index"))
      await updatePackgerIndex();
    else
      Core.info("Skip update packager index...");

    if (Core.getBooleanInput("install_ccache"))
      await installCcache();
    else
      Core.info("Skip install ccache...");

    await checkCcacheAvailability();

    let cacheHit = false;
    if (Core.getBooleanInput("restore_cache"))
      cacheHit = await restoreCache();
    else
      Core.info("Skip restore cache...");

    await Core.group(`Set output variable: cache_hit="${cacheHit}"`, async () => {
      Core.setOutput("cache_hit", cacheHit.toString());
    });

    await configureCcache();

    await Core.group("Clear ccache statistics", async () => {
      await Exec.exec("ccache --zero-stats");
    });

    if (Core.getBooleanInput("prepend_symlinks_to_path"))
      await addSymlinksToPath();
    else
      Core.info("Skip prepend ccache symlinks path to $PATH...");

    await setOutputVariables();
  }
  catch (error) {
    if (error instanceof Error)
      Core.setFailed(error.message);
  }
}
main();
