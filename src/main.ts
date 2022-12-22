import * as Cache from '@actions/cache';
import * as Core from '@actions/core';
import * as Exec from '@actions/exec';
import * as Process from 'process';
import * as Utils from './utils';


async function addSymlinksToPath() {
  const windowsCompileEnvironment = Core.getInput("windows_compile_environment");

  if ((Process.platform === 'win32') && (windowsCompileEnvironment === 'msvc'))
  {
    // `choco` installer already put it on %PATH%
    return;
  }

  await Core.group("Prepend ccache symlinks path to $PATH", async () => {
    switch (Process.platform) {
      case 'darwin':
      case 'linux': {
        const symlinks = await Utils.getCcacheSymlinksPath();
        Core.info(`ccache symlinks path: "${symlinks}"`);
        Core.addPath(symlinks);
        Core.info(`PATH=${Process.env.PATH}`);
        break;
      }
      case 'win32':
        switch (windowsCompileEnvironment) {
          case 'msys2': {
            const symlinks = await Utils.getCcacheSymlinksPath();
            Core.info(`ccache symlinks path (msys): "${symlinks}"`);

            // adjust system PATH
            Core.addPath((await Utils.getMsysInstallationPath()) + symlinks);

            // adjust PATH within msys
            const execOptions = {
              "silent": true
            };
            await Exec.exec(Utils.platformExecWrap(`echo "export PATH=${symlinks}:\\$PATH" >> ~/.bash_profile`), [], execOptions);
            const pathOutput = await Exec.getExecOutput(Utils.platformExecWrap("echo PATH=$PATH"), [], execOptions);
            Core.info(`(msys) ${pathOutput.stdout.trim()}`);
            break;
          }
        }
        break;

      default:
        break;
    }
  });
}

async function checkCcacheAvailability() {
  const ccachePath = await Utils.getCcacheBinaryPath();
  if (ccachePath.length <= 0)
    throw Error("Cannot find ccache on PATH");

  Core.info(`Found ccache at: "${ccachePath}"`);
  await Exec.exec(Utils.platformExecWrap(`${ccachePath} --version`));
}

async function configureCcache() {
  // need to regenerate the config file for each run
  await Utils.removeCcacheConfig();

  const ccachePath = await Utils.getCcacheBinaryPath();
  const settings = Core.getMultilineInput("ccache_options");
  for (const setting of settings) {
    const keyValue = setting.split("=", 2);
    if (keyValue.length == 2) {
      const [key, value] = keyValue;
      await Exec.exec(Utils.platformExecWrap(`${ccachePath} --set-config "${key.trim()}=${value.trim()}"`));
    }
  }

  // `--show-config` is not available on older ccache versions: ubuntu-18.04 have ccache 3.4.1
  await Exec.exec(Utils.platformExecWrap(`${ccachePath} -p`));
}

async function installCcache() {
  await Core.group("Install ccache", async () => {
    switch (Process.platform) {
      case 'darwin': {
        const execOptions = {
          "env": {
            "HOMEBREW_NO_INSTALL_CLEANUP": "1",
            "HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK": "1"
          }
        };
        await Exec.exec("brew install ccache", undefined, execOptions);
      }
      break;

      case 'linux':
        await Exec.exec(Utils.sudoCommandWrap("apt install -y ccache"));
        break;

      case 'win32':
        switch (Core.getInput("windows_compile_environment")) {
          case 'msvc':
            await Exec.exec("choco install ccache -y");
            break;
          case 'msys2':
            await Exec.exec(Utils.platformExecWrap(`pacman --sync --noconfirm ${Utils.msysPackagePrefix()}ccache`));
            break;
        }
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
    try {
      const cacheKey = await Cache.restoreCache(paths, primaryKey, restoreKeys);
      if (cacheKey) {
        Core.info(`Cache found at: "${cacheKey}"`);
        Core.exportVariable(Utils.foundCacheKey, cacheKey);
      }
      else {
        Core.info("Cache not found...");
      }
      return cacheKey ? true : false;
    }
    catch (error) {
      if (error instanceof Error)
        Core.warning(`Error occurred in \`Cache.restoreCache()\`. Error message: "${error.message}"`);
      else
        throw error;
    }
    return false;
  });
}

async function setOutputVariables() {
  const envVars = new Map([
    ["ccache_symlinks_path", await Utils.getCcacheSymlinksPath()]
  ]);

  for (const [key, value] of envVars) {
    Core.exportVariable(key, value);
    Core.info(`\${{ env.${key} }} = ${value}`);
  }
}

async function updatePackgerIndex() {
  const windowsCompileEnvironment = Core.getInput("windows_compile_environment");

  if ((Process.platform === 'win32') && (windowsCompileEnvironment === 'msvc'))
  {
    // `choco` installer doesn't need this
    return;
  }

  await Core.group("Update packager index", async () => {
    switch (Process.platform) {
      case 'darwin':
        await Exec.exec("brew update");
        break;

      case 'linux':
        await Exec.exec(Utils.sudoCommandWrap("apt update"));
        break;

      case 'win32':
        switch (windowsCompileEnvironment) {
          case 'msys2':
            await Exec.exec(Utils.platformExecWrap(`pacman --sync --refresh`));
            break;
        }
        break;

      default:
        break;
    }
  });
}

export default async function main(): Promise<void> {
  // hide annoying nodejs deprecation warnings
  Process.removeAllListeners('warning');

  try {
    if (!Utils.isSupportedPlatform()) {
      if (Process.platform === "win32") {
        const env = Core.getInput("windows_compile_environment");
        Core.warning(`"windows_compile_environment=${env}" is not supported. No operation...`);
      }
      else {
        Core.warning(`setup-ccache-action only support the following platforms: ["macos", "ubuntu", "windows"]. No operation...`);
      }
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

    await Core.group("Check ccache availability", async () => {
      await checkCcacheAvailability();
    });

    let cacheHit = false;
    if (Core.getBooleanInput("restore_cache"))
      cacheHit = await restoreCache();
    else
      Core.info("Skip restore cache...");

    await Core.group(`Set output variable: cache_hit="${cacheHit}"`, async () => {
      Core.setOutput("cache_hit", cacheHit.toString());
    });

    await Core.group("Configure ccache", async () => {
      await configureCcache();
    });

    await Core.group("Clear ccache statistics", async () => {
      await Exec.exec(Utils.platformExecWrap("ccache --zero-stats"));
    });

    if (Core.getBooleanInput("prepend_symlinks_to_path"))
        await addSymlinksToPath();
    else
      Core.info("Skip prepend ccache symlinks path to $PATH...");

    await Core.group("Create environment variables", async () => {
      await setOutputVariables();
    });
  }
  catch (error) {
    if (error instanceof Error)
      Core.setFailed(error.message);
  }
}
main();
