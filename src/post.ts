import * as Cache from '@actions/cache';
import * as Core from '@actions/core';
import * as Exec from '@actions/exec';
import * as Github from '@actions/github';
import * as Path from 'path';
import * as Process from 'process';
import * as Utils from './utils.js';


const MAX_UPLOAD_RETRIES = 10;
let storedCacheKey = "";

async function removeStaleCache() {
  if (storedCacheKey.length <= 0)
    return;

  await Core.group("Remove stale caches", async () => {
    const token = Core.getInput("api_token");
    const octokit = Github.getOctokit(token);

    const contextRepo = Github.context.repo;
    const owner = contextRepo['owner'];
    const repo = contextRepo['repo'];
    const gitRef = Github.context.ref;

    let cacheList = [];
    try {
      const cacheKeyPrefix = storedCacheKey.slice(0, storedCacheKey.lastIndexOf('_'));
      const result = (await octokit.request("GET /repos/{owner}/{repo}/actions/caches{?per_page,page,ref,key,sort,direction}", {
        owner: owner,
        repo: repo,
        ref: gitRef,
        key: cacheKeyPrefix,
        sort: "created_at",
        direction: "asc"
      })).data;

      cacheList = result["actions_caches"];
    }
    catch (error) {
      Core.info(`Error occurred when listing cache entries. Error: "${error}"`);
      return;
    }

    const getTimestamp = (str: string): number => parseInt(str.slice(str.lastIndexOf('_') + 1), 10);
    const storedCacheTimestamp = getTimestamp(storedCacheKey);
    // TODO: remove type definition for `cache`. Possibly https://github.com/octokit/types.ts hasn't updated yet
    cacheList = cacheList.filter((cache: Record<string, any>) => {
      const cacheTimestamp = getTimestamp(cache["key"]);
      return (cacheTimestamp < storedCacheTimestamp);
    });

    Core.info(`Number of stale caches found: ${cacheList.length}`);

    const removedKeys = [];
    for (const cache of cacheList) {
      const key = cache["key"];

      try {
        // This will fail for Pull Requests, due to: https://github.com/actions/first-interaction/issues/10
        const result = (await octokit.request("DELETE /repos/{owner}/{repo}/actions/caches{?key,ref}", {
          owner: owner,
          repo: repo,
          key: key,
          ref: gitRef
        })).data;

        for (const entry of result["actions_caches"])
          removedKeys.push(entry["key"]);
      }
      catch (error) {
        Core.info(`Error occurred when removing stale cache. Key: "${key}". Error: "${error}"`);
      }
    }

    if (removedKeys.length > 0)
      Core.info(`Removed stale caches:\n${removedKeys.join('\n')}`);
  });
}

async function saveCache(): Promise<boolean> {
  return await Core.group("Store cache", async () => {
    Utils.removeCcacheConfig();

    const paths = [Path.normalize(await Utils.getCachePath())];

    // the cache is immutable by design:
    // https://docs.microsoft.com/en-us/azure/devops/pipelines/release/caching?view=azure-devops#use-cache-task
    // github implementation also acknowledges it:
    // https://github.com/actions/cache/blob/6bbe742add91b3db4abf110e742a967ec789958f/src/save.ts#L39-L44
    for (let i = 0; i < MAX_UPLOAD_RETRIES; ++i) {
      try {
        const key = `${Utils.getOverrideCacheKey().value}_${Date.now()}`;
        Core.info(`Using \`key\`: "${key}", \`paths\`: "${paths}"`);

        await Cache.saveCache(paths, key);
        storedCacheKey = key;
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
      Core.info("Skip remove stale caches...");
    }
  }
  catch (error) {
    if (error instanceof Error)
      Core.warning(error.message);
  }

  // Workaround. This explicit `exit()` call isn't necessary. For unknown reason in node20, without it it will
  // hang process up to 2 mins without any activity
  Process.exit(0);
}
main();
