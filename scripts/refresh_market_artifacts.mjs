import { spawn } from "node:child_process";

function parseArgs(argv) {
  const args = {
    symbols: "",
    sleep: "0.25",
    tier: "free",
    includeSymbolDetails: false,
    reportSymbols: "",
    skipFetch: false,
    skipReport: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--symbols") {
      args.symbols = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--sleep") {
      args.sleep = argv[index + 1] ?? args.sleep;
      index += 1;
    } else if (arg === "--tier") {
      args.tier = argv[index + 1] === "paid" ? "paid" : "free";
      index += 1;
    } else if (arg === "--include-symbol-details") {
      args.includeSymbolDetails = true;
    } else if (arg === "--report-symbols") {
      args.reportSymbols = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--skip-fetch") {
      args.skipFetch = true;
    } else if (arg === "--skip-report") {
      args.skipReport = true;
    }
  }

  return args;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const python = process.env.PYTHON ?? "python3";

  if (!args.skipFetch) {
    const fetchArgs = ["-B", "jobs/fetch_yahoo_snapshots.py", "--sleep", args.sleep];
    if (args.symbols) {
      fetchArgs.push("--symbols", args.symbols);
    }

    await run(python, fetchArgs);
  }

  if (!args.skipReport) {
    const reportArgs = ["scripts/build_weekly_report.mjs", "--tier", args.tier];
    if (args.includeSymbolDetails) {
      reportArgs.push("--include-symbol-details");
    }
    if (args.reportSymbols) {
      reportArgs.push("--symbols", args.reportSymbols);
    }

    await run("node", reportArgs);
  }
}

await main();
