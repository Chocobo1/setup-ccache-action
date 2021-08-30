import * as Cache from '@actions/cache';
import * as Core from '@actions/core';
import * as Exec from '@actions/exec';
import * as Utils from './utils';


const MAX_UPLOAD_RETRIES = 10;

async function saveCache() {
  await Core.group("Store cache", async () => {
    Utils.removeCcacheConfig();

    const paths = [await Utils.getCachePath()];

    // the cache is immutable by design:
    // https://docs.microsoft.com/en-us/azure/devops/pipelines/release/caching?view=azure-devops#use-cache-task
    // github implementation also acknowledges it:
    // https://github.com/actions/cache/blob/6bbe742add91b3db4abf110e742a967ec789958f/src/save.ts#L39-L44
    for (let i = 0; i < MAX_UPLOAD_RETRIES; ++i) {
      try {
        const key = Utils.getOverrideCacheKey();
        Core.info(`Using \`key\`: "${key}", \`paths\`: "${paths}"`);

        await Cache.saveCache(paths, key);
        return;
      }
      catch (error) {
        if (error instanceof Cache.ReserveCacheError)
          Core.info(`Upload error: "${error}". Retry ${i + 1}...`);
        else
          throw error;
      }
    }
  });
}

export default async function main(): Promise<void> {
  try {
    if (!Utils.isSupportedPlatform()) {
      // don't print warning message
      return;
    }

    await Exec.exec("ccache --show-stats");

    if (Core.getBooleanInput("store_cache"))
      await saveCache();
    else
      Core.info("Skip store cache...");
  }
  catch (error) {
    Core.setFailed(error.message);
  }
}
main();
