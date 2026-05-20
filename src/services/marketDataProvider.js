import { mockSnapshots } from "../data/mockSnapshots.js";

const latestSnapshotUrls = ["/data/latest.json", "/public/data/latest.json"];

function isSnapshotPayload(value) {
  return Array.isArray(value?.snapshots) && value.snapshots.length > 0;
}

function loadSnapshotJson(url) {
  if (typeof fetch === "function") {
    return fetch(url, { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        throw new Error(`Snapshot fetch failed: ${response.status}`);
      }
      return response.json();
    });
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const separator = url.includes("?") ? "&" : "?";
    request.open("GET", `${url}${separator}cache=${Date.now()}`);
    request.responseType = "json";
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Snapshot request failed: ${request.status}`));
        return;
      }

      resolve(request.response ?? JSON.parse(request.responseText));
    };
    request.onerror = () => reject(new Error("Snapshot request failed"));
    request.send();
  });
}

export class StaticJsonMarketDataProvider {
  async load() {
    try {
      for (const latestSnapshotUrl of latestSnapshotUrls) {
        let payload;
        try {
          payload = await loadSnapshotJson(latestSnapshotUrl);
        } catch {
          continue;
        }

        if (isSnapshotPayload(payload)) {
          return {
            snapshots: payload.snapshots,
            meta: {
              generatedAt: payload.generatedAt ?? "unknown",
              source: payload.source ?? "unknown",
              indicatorEngine: payload.indicatorEngine ?? "unknown"
            }
          };
        }
      }

      throw new Error("No valid snapshot payload found");
    } catch (error) {
      console.warn("Using mock market snapshots.", error);
      return {
        snapshots: mockSnapshots,
        meta: null
      };
    }
  }

  async listSnapshots() {
    const payload = await this.load();
    return payload.snapshots;
  }

  async getSnapshot(symbol) {
    const snapshots = await this.listSnapshots();
    return snapshots.find((snapshot) => snapshot.definition.symbol === symbol);
  }
}

export const marketDataProvider = new StaticJsonMarketDataProvider();