import { memberProfileStore } from "./memberProfileStore.js";
import { loadAppConfig } from "./appConfigProvider.js";
import { supabaseMemberProfileStore } from "./supabaseMemberProfileStore.js";

let appConfigPromise;

function getAppConfig() {
  appConfigPromise ??= loadAppConfig();
  return appConfigPromise;
}

export const memberProfileRepository = {
  provider: "auto",

  async load() {
    const localProfile = memberProfileStore.load();
    const config = await getAppConfig();

    if (!supabaseMemberProfileStore.canUse(config)) {
      return localProfile;
    }

    try {
      return (await supabaseMemberProfileStore.load(config)) ?? localProfile;
    } catch (error) {
      console.warn("Using local member profile fallback.", error);
      return localProfile;
    }
  },

  async save(profile) {
    const localProfile = memberProfileStore.save(profile);
    const config = await getAppConfig();

    if (!supabaseMemberProfileStore.canUse(config)) {
      return localProfile;
    }

    try {
      return await supabaseMemberProfileStore.save(config, localProfile);
    } catch (error) {
      console.warn("Saved local member profile only.", error);
      return localProfile;
    }
  }
};
