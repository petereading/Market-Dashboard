import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWeeklyReport } from "../src/domain/weeklyReport.js";
import { mockSnapshots } from "../src/data/mockSnapshots.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultInput = resolve(root, "public/data/latest.json");
const defaultOutput = resolve(root, "public/reports/latest-weekly-report.json");

function parseArgs(argv) {
  const args = {
    input: defaultInput,
    output: defaultOutput,
    tier: "free",
    includeSymbolDetails: false,
    symbols: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = resolve(root, argv[index + 1]);
      index += 1;
    } else if (arg === "--output") {
      args.output = resolve(root, argv[index + 1]);
      index += 1;
    } else if (arg === "--tier") {
      args.tier = argv[index + 1] === "paid" ? "paid" : "free";
      index += 1;
    } else if (arg === "--include-symbol-details") {
      args.includeSymbolDetails = true;
    } else if (arg === "--symbols") {
      args.symbols = argv[index + 1].split(",").map((symbol) => symbol.trim()).filter(Boolean);
      index += 1;
    }
  }

  return args;
}

async function loadSnapshots(input) {
  try {
    const payload = JSON.parse(await readFile(input, "utf8"));
    if (Array.isArray(payload?.snapshots) && payload.snapshots.length > 0) {
      return {
        generatedAt: payload.generatedAt,
        source: payload.source,
        snapshots: payload.snapshots
      };
    }
  } catch {
    // Fall back to bundled mock snapshots for local Stage 1 report previews.
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "mockSnapshots",
    snapshots: mockSnapshots
  };
}

function filterSnapshots(snapshots, symbols) {
  if (symbols.length === 0) {
    return snapshots;
  }

  const allowed = new Set(symbols);
  return snapshots.filter((snapshot) => allowed.has(snapshot.definition.symbol));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = await loadSnapshots(args.input);
  const snapshots = filterSnapshots(payload.snapshots, args.symbols);
  const report = buildWeeklyReport(snapshots, {
    tier: args.tier,
    includeSymbolDetails: args.includeSymbolDetails,
    generatedAt: payload.generatedAt,
    title: "Math of Stars Market Dashboard Weekly Digest"
  });

  const output = {
    ...report,
    source: payload.source,
    symbols: snapshots.map((snapshot) => snapshot.definition.symbol)
  };
  const textOutput = args.output.replace(/\.json$/i, ".txt");

  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await writeFile(textOutput, `${report.digestText}\n`, "utf8");

  console.log(`Wrote weekly report JSON to ${args.output}`);
  console.log(`Wrote weekly report text to ${textOutput}`);
}

await main();
