import { mockSnapshots } from "../data/mockSnapshots.js";

const latestSnapshotUrls = ["/data/latest.json", "/public/data/latest.json"];

function isSnapshotPayload(value) {
  return Array.isArray(value?.snapshots) && value.snapshots.length > 0;
}

export class StaticJsonMarketDataProvider {
  async load() {
    try {
      for (const latestSnapshotUrl of latestSnapshotUrls) {
        const response = await fetch(latestSnapshotUrl, { cache: "no-store" });
        if (!response.ok) {
          continue;
        }

        const payload = await response.json();
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