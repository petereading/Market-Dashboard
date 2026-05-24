import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultInput = resolve(root, "public/reports/latest-weekly-report.json");
const defaultOutput = resolve(root, "public/reports/latest-weekly-email.html");

function parseArgs(argv) {
  const args = {
    input: defaultInput,
    output: defaultOutput
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = resolve(root, argv[index + 1]);
      index += 1;
    } else if (arg === "--output") {
      args.output = resolve(root, argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(value) < 20 ? 2 : 1
  }).format(value);
}

function buildSubject(report) {
  const date = report.generatedAt?.slice?.(0, 10) ?? "latest";
  return `Math of Stars Market Digest - ${date}`;
}

function buildTextEmail(report) {
  const lines = [
    buildSubject(report),
    "",
    report.digestText,
    "",
    "追蹤摘要",
    `總數：${report.summary.total}`,
    `PR 高於 SMA1：${report.summary.improvingCount}`,
    `站在月分界上方：${report.summary.aboveMonthCount}`,
    "",
    "圖表閱讀、教育及研究用途，不構成投資建議。"
  ];

  return `${lines.filter(Boolean).join("\n")}\n`;
}

function buildSymbolRows(report) {
  return report.symbolDetails
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e8e0d2;">
            <strong>${escapeHtml(item.symbol)}</strong><br>
            <span style="color:#65706b;">${escapeHtml(item.displayName)}</span>
          </td>
          <td align="right" style="padding:10px 8px;border-bottom:1px solid #e8e0d2;">${escapeHtml(item.prValue)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e8e0d2;">${escapeHtml(item.status)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e8e0d2;">${escapeHtml(item.signal)}</td>
          <td align="right" style="padding:10px 8px;border-bottom:1px solid #e8e0d2;">${formatNumber(item.distanceToMonthPct)}%</td>
        </tr>
      `
    )
    .join("");
}

function buildDetailBlocks(report) {
  if (!report.includeSymbolDetails) {
    return "";
  }

  return report.symbolDetails
    .slice(0, 5)
    .map(
      (item) => `
        <div style="padding:14px 0;border-top:1px solid #e8e0d2;">
          <h3 style="margin:0 0 6px;font-size:17px;line-height:1.35;color:#1e2926;">${escapeHtml(item.displayName)}</h3>
          <p style="margin:0 0 8px;color:#394742;line-height:1.65;">${escapeHtml(item.coachSummary)}</p>
          <p style="margin:0;color:#65706b;line-height:1.55;">動能指數 ${escapeHtml(item.prValue)}，狀態：${escapeHtml(item.status)}，位置：${escapeHtml(item.pricePosition)}。</p>
        </div>
      `
    )
    .join("");
}

function buildHtmlEmail(report) {
  const subject = buildSubject(report);
  const strongest = report.summary.strongest;
  const weakest = report.summary.weakest;

  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f7f2e8;color:#1e2926;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,'Noto Sans TC',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;">本週市場追蹤摘要及圖表閱讀提示。</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f2e8;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#fffdf8;border:1px solid #e2d8c8;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#eef4f1;border-bottom:1px solid #d8e2dd;">
                <p style="margin:0 0 6px;color:#65706b;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Math of Stars</p>
                <h1 style="margin:0;font-size:26px;line-height:1.25;color:#1e2926;">Market Dashboard Weekly Digest</h1>
                <p style="margin:10px 0 0;color:#52605b;font-size:14px;">Generated ${escapeHtml(report.generatedAt ?? "")}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <h2 style="margin:0 0 10px;font-size:20px;line-height:1.35;">一句話總結</h2>
                <p style="margin:0;color:#394742;font-size:16px;line-height:1.7;">本週追蹤清單中，${escapeHtml(report.summary.improvingCount)} 個 symbol 的 PR 值高於 SMA1，${escapeHtml(report.summary.aboveMonthCount)} 個仍站在月分界上方。</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border:1px solid #e8e0d2;border-radius:8px;">
                  <tr>
                    <td style="padding:14px 16px;border-right:1px solid #e8e0d2;">
                      <span style="display:block;color:#65706b;font-size:13px;">追蹤總數</span>
                      <strong style="font-size:24px;">${escapeHtml(report.summary.total)}</strong>
                    </td>
                    <td style="padding:14px 16px;border-right:1px solid #e8e0d2;">
                      <span style="display:block;color:#65706b;font-size:13px;">PR 高於 SMA1</span>
                      <strong style="font-size:24px;">${escapeHtml(report.summary.improvingCount)}</strong>
                    </td>
                    <td style="padding:14px 16px;">
                      <span style="display:block;color:#65706b;font-size:13px;">月分界上方</span>
                      <strong style="font-size:24px;">${escapeHtml(report.summary.aboveMonthCount)}</strong>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;line-height:1.65;color:#394742;">較強：${escapeHtml(strongest?.displayName ?? "-")}，動能指數 ${escapeHtml(strongest?.prValue ?? "-")}。</p>
                <p style="margin:0;line-height:1.65;color:#394742;">較弱：${escapeHtml(weakest?.displayName ?? "-")}，動能指數 ${escapeHtml(weakest?.prValue ?? "-")}。</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <h2 style="margin:0 0 12px;font-size:20px;line-height:1.35;">追蹤清單</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
                  <tr>
                    <th align="left" style="padding:8px;color:#65706b;border-bottom:2px solid #d8e2dd;">Symbol</th>
                    <th align="right" style="padding:8px;color:#65706b;border-bottom:2px solid #d8e2dd;">動能</th>
                    <th align="left" style="padding:8px;color:#65706b;border-bottom:2px solid #d8e2dd;">狀態</th>
                    <th align="left" style="padding:8px;color:#65706b;border-bottom:2px solid #d8e2dd;">訊號</th>
                    <th align="right" style="padding:8px;color:#65706b;border-bottom:2px solid #d8e2dd;">月線距離</th>
                  </tr>
                  ${buildSymbolRows(report)}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <h2 style="margin:0 0 8px;font-size:20px;line-height:1.35;">先教你看圖</h2>
                <p style="margin:0;color:#394742;line-height:1.7;">PR 值可視為動能溫度計，SMA1 則幫助判斷動能是否正在改善。價格站在月分界上方時，代表節奏較容易由弱轉穩；若跌回分界下方，原本的改善訊號需要下調可信度。</p>
              </td>
            </tr>
            ${
              report.includeSymbolDetails
                ? `<tr><td style="padding:0 28px 24px;"><h2 style="margin:0 0 8px;font-size:20px;line-height:1.35;">個別 symbol 摘要</h2>${buildDetailBlocks(report)}</td></tr>`
                : ""
            }
            <tr>
              <td style="padding:20px 28px;background:#f7f2e8;border-top:1px solid #e8e0d2;">
                <p style="margin:0;color:#65706b;font-size:13px;line-height:1.6;">圖表閱讀、教育及研究用途，不構成投資建議。</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await readFile(args.input, "utf8"));
  const textOutput = args.output.replace(/\.html$/i, ".txt");

  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, buildHtmlEmail(report), "utf8");
  await writeFile(textOutput, buildTextEmail(report), "utf8");

  console.log(`Wrote email preview HTML to ${args.output}`);
  console.log(`Wrote email preview text to ${textOutput}`);
}

await main();
