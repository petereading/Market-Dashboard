import { memberProfileStore } from "./memberProfileStore.js";

export const memberProfileRepository = {
  provider: "local-storage",

  async load() {
    return memberProfileStore.load();
  },

  async save(profile) {
    return memberProfileStore.save(profile);
  }
};
