import * as Cache from '@actions/cache';
import * as Core from '@actions/core';
import * as Exec from '@actions/exec';
import * as Github from '@actions/github';
import * as Process from 'process';
import * as Utils from './utils';


const MAX_UPLOAD_RETRIES = 10;

async function removeStaleCache() {
  const cacheKey = Process.env[Utils.foundCacheKey];
  if (!cacheKey)
    return;

  await Core.group("Remove stale cache", async () => {
    const token = Core.getInput("api_token");
    const octokit = Github.getOctokit(token);

    const owner = Process.env.GITHUB_REPOSITORY_OWNER!;
    const repo = Process.env.GITHUB_REPOSITORY!.slice(owner.length + 1);
    const gitRef = Process.env.GITHUB_REF!;

    try {
      const result = (await octokit.request("DELETE /repos/{owner}/{repo}/actions/caches{?key,ref}", {
        owner: owner,
        repo: repo,
        key: cacheKey,
        ref: gitRef
      })).data;

      Core.info(`Number of stale caches found: ${result["total_count"]}`);

      const staleCacheKeys = [];
      for (const cache of result["actions_caches"])
        staleCacheKeys.push(cache["key"]);
      Core.info(`Removed stale caches: ${staleCacheKeys.join('\n')}`);
    }
    catch (error) {
      Core.info(`Error occurred when removing stale caches. Error: "${error}"`);
    }
  });
}

async function saveCache(): Promise<boolean> {
  return await Core.group("Store cache", async () => {
    Utils.removeCcacheConfig();

    const paths = [await Utils.getCachePath()];

    // the cache is immutable by design:
    // https://docs.microsoft.com/en-us/azure/devops/pipelines/release/caching?view=azure-devops#use-cache-task
    // github implementation also acknowledges it:
    // https://github.com/actions/cache/blob/6bbe742add91b3db4abf110e742a967ec789958f/src/save.ts#L39-L44
    for (let i = 0; i < MAX_UPLOAD_RETRIES; ++i) {
      try {
        const key = `${Utils.getOverrideCacheKey().value}_${Date.now()}`;
        Core.info(`Using \`key\`: "${key}", \`paths\`: "${paths}"`);

        await Cache.saveCache(paths, key);
        return true;
      }
      catch (error) {
        if (error instanceof Cache.ReserveCacheError)
          Core.info(`Upload error: "${error}". Error message: "${error.message}". Retry ${i + 1}...`);
        else if (error instanceof Error)
          Core.warning(`Upload error: "${error}". Error message: "${error.message}". Retry ${i + 1}...`);
        else
          throw error;
      }
    }
    return false;
  });
}

async function showStats() {
  const version = await Utils.getCcacheVersion();

  let command = `${await Utils.getCcacheBinaryPath()} --show-stats`;
  if (version[0] >= 4)
    command += " --verbose --verbose";
  await Exec.exec(Utils.platformExecWrap(command));
}

export default async function main(): Promise<void> {
  try {
    if (!Utils.isSupportedPlatform()) {
      Core.info("No operation...");
      return;
    }

    await showStats();

    let isSaveCacheSuccess = false;
    if (Core.getBooleanInput("store_cache"))
      isSaveCacheSuccess = await saveCache();
    else
      Core.info("Skip store cache...");

    if (Core.getBooleanInput("remove_stale_cache")) {
      if (isSaveCacheSuccess)
        await removeStaleCache();
    }
    else {
      Core.info("Skip remove stale cache...");
    }
  }
  catch (error) {
    if (error instanceof Error)
      Core.warning(error.message);
  }
}
main();
