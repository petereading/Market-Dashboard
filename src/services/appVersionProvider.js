const fallbackVersion = {
  buildId: "local",
  commit: "local",
  label: "local"
};

const versionUrls = ["/version.json", "/public/version.json"];

export async function loadAppVersion() {
  if (typeof fetch !== "function") {
    return fallbackVersion;
  }

  for (const versionUrl of versionUrls) {
    try {
      const response = await fetch(versionUrl, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      const version = await response.json();
      return {
        buildId: version.buildId ?? version.commit ?? fallbackVersion.buildId,
        commit: version.commit ?? fallbackVersion.commit,
        label: version.label ?? version.commit?.slice?.(0, 7) ?? fallbackVersion.label
      };
    } catch {
      continue;
    }
  }

  return fallbackVersion;
}
