import { mockSnapshots } from "../data/mockSnapshots.js";

const latestSnapshotUrl = "/data/latest.json";

function isSnapshotPayload(value) {
  return Array.isArray(value?.snapshots) && value.snapshots.length > 0;
}

export class StaticJsonMarketDataProvider {
  async load() {
    try {
      const response = await fetch(latestSnapshotUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Snapshot fetch failed: ${response.status}`);
      }

      const payload = await response.json();
      if (!isSnapshotPayload(payload)) {
        throw new Error("Snapshot payload is empty or invalid");
      }

      return {
        snapshots: payload.snapshots,
        meta: {
          generatedAt: payload.generatedAt ?? "unknown",
          source: payload.source ?? "unknown",
          indicatorEngine: payload.indicatorEngine ?? "unknown"
        }
      };
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
