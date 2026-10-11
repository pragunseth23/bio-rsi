// End-to-end test of the UI against the real FastAPI/RDKit backend.
// Usage: start the frontend (`npm run dev`), keep port 8000 free, then `npm run test:e2e`.
// The suite starts and stops its own API on an isolated SQLite file, so backend/data is untouched.
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.resolve(process.argv[2] || "test-results/e2e");
const DB = path.join(OUT, "e2e.sqlite");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const errors = [];
let expectErrors = false;
const pass = (name, detail = "") => { results.push({ name, ok: true, detail }); console.log(`PASS  ${name} ${detail}`); };
const fail = (name, detail = "") => { results.push({ name, ok: false, detail }); console.log(`FAIL  ${name} ${detail}`); };
const check = async (name, fn) => {
  try { const d = await fn(); pass(name, d ?? ""); } catch (e) { fail(name, String(e.message || e).split("\n")[0]); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let api;
function startApi() {
  api = spawn(`${ROOT}/.venv/bin/python`, ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"], {
    cwd: ROOT, env: { ...process.env, DATABASE_PATH: DB, ITERATION_DELAY: "0.25" }, stdio: ["ignore", fs.openSync(path.join(OUT, "api.log"), "a"), fs.openSync(path.join(OUT, "api.log"), "a")],
  });
}
async function waitApi(up = true) {
  for (let i = 0; i < 80; i++) {
    const ok = await fetch("http://127.0.0.1:8000/api/health").then((r) => r.ok).catch(() => false);
    if (ok === up) return;
    await sleep(250);
  }
  throw new Error("API state timeout");
}
async function stopApi() { api.kill("SIGKILL"); await waitApi(false); await sleep(300); }

if (await fetch("http://127.0.0.1:8000/api/health").then(() => true).catch(() => false)) {
  console.error("Port 8000 is in use. Stop the API first: this suite starts its own on an isolated database.");
  process.exit(2);
}
startApi();
await waitApi(true);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, acceptDownloads: true,
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  permissions: ["clipboard-read", "clipboard-write"],
});
const p = await ctx.newPage();
const requests = [];
p.on("request", (r) => requests.push(r.url()));
p.on("console", (m) => m.type() === "error" && !expectErrors && errors.push(`console: ${m.text()}`));
p.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
p.on("response", (r) => {
  if (r.status() >= 400 && !expectErrors && !r.url().includes("/api/molecule/evaluate")) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
const shot = (n, full = false) => p.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: full });
const tabsEnd = () => p.locator(".tabs-end").innerText().catch(() => "");
const smiles = () => p.locator(".config textarea");
const launchBtn = () => p.getByRole("button", { name: /Launch optimization/ });
const field = (label) => p.getByLabel(label, { exact: true });

await p.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await shot("01-landing");

await check("Fonts load via next/font", async () => {
  const fam = await p.evaluate(() => getComputedStyle(document.querySelector(".hero-title")).fontFamily);
  const ok = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family); });
  if (!/Newsreader/i.test(fam) || !ok.some((f) => /Newsreader/i.test(f)) || !ok.some((f) => /Plex Sans/i.test(f))) throw new Error(`${fam} / ${ok}`);
  return ok.join(", ").slice(0, 80);
});
await check("No /favicon.ico request; app icon served", async () => {
  if (requests.some((u) => u.endsWith("/favicon.ico"))) throw new Error("favicon.ico requested");
  const href = await p.locator('link[rel="icon"]').first().getAttribute("href");
  const r = await p.request.get(new URL(href, "http://127.0.0.1:3000").href);
  if (r.status() !== 200) throw new Error(`${href} -> ${r.status()}`);
  return href;
});
await check("Hero renders a 3D model with element legend", async () => {
  await p.locator(".scene canvas").waitFor();
  const legend = await p.locator(".specimen-legend").innerText();
  if (!/C\s*2/.test(legend) || !/O\s*1/.test(legend)) throw new Error(legend);
  return legend.replace(/\s+/g, " ");
});

// Scroll into the console via the header CTA
await p.getByRole("link", { name: "Enter the lab" }).click();
await p.waitForTimeout(900);
await check("Enter the lab scrolls to console and sets #lab/optimization", async () => {
  const top = await p.evaluate(() => document.getElementById("lab").getBoundingClientRect().top);
  if (Math.abs(top) > 40) throw new Error(`console top ${top}`);
  if (!p.url().endsWith("#lab/optimization")) throw new Error(p.url());
});

// Validation
await smiles().fill("C1CC");
await p.waitForTimeout(1200);
await check("Invalid SMILES shows inline error and disables launch", async () => {
  const err = await p.locator(".config .field-error").first().innerText();
  if (!(await launchBtn().isDisabled())) throw new Error("launch enabled");
  if (requests.some((u) => u.includes("scene?smiles=C1CC"))) throw new Error("hero fetched invalid geometry");
  return err;
});
await shot("02-invalid-smiles");
await check("Presets fill SMILES and validate", async () => {
  for (const [name, s] of [["Phenol", "Oc1ccccc1"], ["Aspirin", "CC(=O)Oc1ccccc1C(=O)O"], ["Ethanol", "CCO"]]) {
    await p.getByRole("button", { name, exact: true }).click();
    if ((await smiles().inputValue()) !== s) throw new Error(name);
    await p.locator('.seed-status[data-state="valid"]').waitFor({ timeout: 5000 });
  }
});
await check("Seed preview shows real RDKit fitness before launch", async () => {
  const t = await p.locator(".specimen-card").first().innerText();
  if (!t.includes("0.407")) throw new Error(t);
});
await check("logP objective shows validated target field", async () => {
  await field("Objective").selectOption("logp");
  await field("Target logP").fill("9");
  const e = await p.locator(".config .field-error").first().innerText();
  if (!(await launchBtn().isDisabled())) throw new Error("launch enabled with target 9");
  await field("Target logP").fill("2");
  return e;
});
await check("Multi objective weights validated (all zero rejected)", async () => {
  await field("Objective").selectOption("multi");
  for (const l of ["QED", "logP proximity", "MW near 300", "TPSA near 75", "Constraints"]) await field(l).fill("0");
  const e = await p.locator(".weights .field-error").innerText();
  if (!(await launchBtn().isDisabled())) throw new Error("launch enabled");
  for (const [l, v] of [["QED", ".4"], ["logP proximity", ".2"], ["MW near 300", ".15"], ["TPSA near 75", ".15"], ["Constraints", ".1"]]) await field(l).fill(v);
  await field("Objective").selectOption("qed");
  return e;
});
await check("Empty iterations blocks launch; budget updates live", async () => {
  await field("Iterations").fill("");
  const e = await p.locator(".config .field-error").first().innerText();
  const b1 = await p.locator(".budget strong").innerText();
  await field("Iterations").fill("30");
  await field("Batch size").fill("30");
  const b2 = await p.locator(".budget strong").innerText();
  if (!b2.includes("900") || !b1.includes("—")) throw new Error(`${b1} / ${b2}`);
  return `${e}; ${b2}`;
});
await p.getByRole("button", { name: /Reproducibility/ }).click();
await field("Random seed").fill("42");
await shot("03-config-ready");

// Run A: launch → stop
await launchBtn().click();
await check("Launch starts a real run and streams generations", async () => {
  await p.waitForFunction(() => /Running/.test(document.querySelector(".tabs-end")?.textContent || ""), null, { timeout: 8000 });
  await p.waitForFunction(() => document.querySelectorAll(".trail tbody tr").length >= 3, null, { timeout: 15000 });
  return await tabsEnd();
});
await shot("04-running");
await p.getByRole("button", { name: /Stop run/ }).click();
await check("Stop calls the backend and the run ends as Stopped", async () => {
  await p.waitForFunction(() => /Stopped/.test(document.querySelector(".tabs-end")?.textContent || ""), null, { timeout: 8000 });
  return (await tabsEnd()).replace(/\s+/g, " ");
});

// Run B: launch → API restart mid-run → reconnect, honest "Interrupted"
await launchBtn().click();
await p.waitForFunction(() => /Running/.test(document.querySelector(".tabs-end")?.textContent || ""), null, { timeout: 8000 });
await p.waitForTimeout(2000);
expectErrors = true;
await stopApi();
await check("Service loss shows a visible reconnect/offline banner", async () => {
  await p.locator(".banner").first().waitFor({ timeout: 10000 });
  await p.waitForTimeout(1500);
  await shot("05-service-down");
  return (await p.locator(".banner").first().innerText()).replace(/\s+/g, " ").slice(0, 90);
});
startApi();
await waitApi(true);
await check("Reconnects automatically; restarted run is reported Interrupted", async () => {
  await p.waitForFunction(() => /Interrupted/.test(document.querySelector(".tabs-end")?.textContent || ""), null, { timeout: 30000 });
  await p.waitForFunction(() => !document.querySelector(".banner"), null, { timeout: 30000 });
  return (await tabsEnd()).replace(/\s+/g, " ");
});
expectErrors = false;

// Run C: full Ethanol / QED / 30 / 30 / 42
await p.waitForTimeout(500);
await launchBtn().click();
let sawChip = false;
const chipWatch = p.locator(".improve-chip").first().waitFor({ timeout: 40000 }).then(() => (sawChip = true)).catch(() => {});
await check("Full run completes 30/30 generations", async () => {
  await p.waitForFunction(() => /Completed/.test(document.querySelector(".tabs-end")?.textContent || ""), null, { timeout: 90000 });
  return (await p.locator(".progress-stats").innerText()).replace(/\s+/g, " ");
});
await chipWatch;
await check("Improvement chip appeared for a real fitness increase", async () => { if (!sawChip) throw new Error("not seen"); });
await p.waitForTimeout(1000);
await shot("06-completed", true);
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(1200);
await shot("06b-hero-after-run");
await check("Hero readout reflects the run", async () => {
  const t = await p.locator(".readout").innerText();
  if (!/30\s*\/\s*30/.test(t)) throw new Error(t);
  return t.replace(/\s+/g, " ");
});
await check("3D reset view button works", async () => {
  await p.getByRole("button", { name: "Reset 3D view" }).click();
});

// Compare
await p.locator("#lab").scrollIntoViewIfNeeded();
const compareBtn = p.getByRole("button", { name: /Compare generations/ });
await compareBtn.click();
await check("Compare dialog opens with selectable generations", async () => {
  await p.getByRole("dialog").waitFor();
  await p.locator("#compare-0").selectOption("3");
  await p.waitForTimeout(600);
  const t = await p.getByRole("dialog").innerText();
  if (!t.includes("Generation 3")) throw new Error("selection not applied");
});
await shot("07-compare");
await p.keyboard.press("Escape");
await check("Esc closes dialog and returns focus", async () => {
  await p.getByRole("dialog").waitFor({ state: "detached" });
  const focused = await p.evaluate(() => document.activeElement?.textContent || "");
  if (!/Compare generations/.test(focused)) throw new Error(`focus on: ${focused}`);
});

// Tabs, history and URL
await p.getByRole("tab", { name: /History/ }).click();
await check("History tab lists runs and records", async () => {
  await p.waitForFunction(() => document.querySelectorAll(".records-panel tbody tr").length === 31, null, { timeout: 5000 });
  const runs = await p.locator(".run-list li").count();
  const rows = await p.locator(".records-panel tbody tr").count();
  if (runs !== 3 || rows !== 31) throw new Error(`runs ${runs} rows ${rows}`);
  if (!p.url().endsWith("#lab/history")) throw new Error(p.url());
  return `${runs} runs, ${rows} records`;
});
await shot("08-history");
await check("Browser back/forward switch tabs", async () => {
  await p.goBack();
  await p.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes("Optimization"));
  await p.goForward();
  await p.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes("History"));
});
await check("Refresh keeps the History tab and run", async () => {
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const sel = await p.locator('[role="tab"][aria-selected="true"]').innerText();
  if (!sel.includes("History")) throw new Error(sel);
  if (!/Completed/.test(await tabsEnd())) throw new Error(await tabsEnd());
});
await check("Selecting a saved run loads its records", async () => {
  await p.locator(".run-list button").nth(2).click();
  await p.waitForFunction(() => /Stopped/.test(document.querySelector(".tabs-end")?.textContent || ""));
  const rows = await p.locator(".records-panel tbody tr").count();
  await p.locator(".run-list button").nth(0).click();
  await p.waitForFunction(() => /Completed/.test(document.querySelector(".tabs-end")?.textContent || ""));
  return `stopped run has ${rows} records`;
});

// Export
await check("Export JSON downloads a valid export", async () => {
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: /Export JSON/ }).click()]);
  const file = path.join(OUT, "export.json");
  await dl.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (data.experiments.length !== 31) throw new Error(`${data.experiments.length} experiments`);
  const out = execFileSync(`${ROOT}/.venv/bin/python`, ["-c", `import json,sys; sys.path.insert(0,'${ROOT}'); from scripts.verify_export import check; print(check(json.load(open('${file}'))))`]).toString().trim();
  return `${dl.suggestedFilename()} · verify_export: ${out} records`;
});

// Keyboard: inspect a record → verification
await check("Keyboard: arrow keys move between tabs", async () => {
  await p.getByRole("tab", { name: /History/ }).focus();
  await p.keyboard.press("ArrowRight");
  const sel = await p.locator('[role="tab"][aria-selected="true"]').innerText();
  if (!sel.includes("Verification")) throw new Error(sel);
  await p.keyboard.press("ArrowLeft");
});
await check("Keyboard: inspect button opens a record in Verification", async () => {
  await p.getByRole("tab", { name: /History/ }).click();
  const btn = p.getByRole("button", { name: "Inspect generation 30" });
  await btn.focus();
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes("Verification"));
});

// Verify (real), copy, tamper
await p.getByRole("button", { name: /Verify experiment/ }).click();
await check("Verification of a genuine record passes", async () => {
  await p.locator('.verdict[data-shown]').waitFor({ timeout: 8000 });
  const t = await p.locator(".verdict").innerText();
  if (!/integrity verified/.test(t) || (await p.locator('.verdict[data-tone="ok"]').count()) !== 1) throw new Error(t);
  return t;
});
await shot("09-verified");
await check("Copy hash writes the clipboard and confirms", async () => {
  await p.getByRole("button", { name: "Copy record hash" }).click();
  await p.locator(".copy-status", { hasText: "Copied" }).waitFor();
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  if (!/^0x[0-9a-f]{64}$/.test(clip)) throw new Error(clip);
});
// Tamper with generation 10 of this run in the isolated test DB.
const runId = (await p.locator(".run-id").innerText()).replace("Run ", "").trim();
const tamper = (restore) => execFileSync(`${ROOT}/.venv/bin/python`, ["-c", `
import sqlite3, json
db = sqlite3.connect('${DB}')
(rid,) = db.execute("select id from runs where id like ?", ('${runId}%',)).fetchone()
row = db.execute("select data from experiments where run_id=? and iteration=10", (rid,)).fetchone()
exp = json.loads(row[0])
exp['record']['fitness'] = exp['record']['fitness'] + (-0.5 if ${restore ? "True" : "False"} else 0.5)
db.execute("update experiments set data=? where run_id=? and iteration=10", (json.dumps(exp), rid))
db.commit()
`]);
tamper(false);
await p.getByRole("button", { name: /Verify again/ }).click();
await check("Tampered ancestor makes verification fail visibly", async () => {
  await p.waitForFunction(() => /failed/.test(document.querySelector(".verdict[data-shown]")?.textContent || ""), null, { timeout: 8000 });
  const items = await p.locator(".checks li").allInnerTexts();
  return items.map((s) => s.split("\n")[0]).join(" | ");
});
await shot("10-tampered");
tamper(true);
await p.getByRole("button", { name: /Verify again/ }).click();
await check("Restored record verifies again", async () => {
  await p.waitForFunction(() => /integrity verified/.test(document.querySelector(".verdict[data-shown]")?.textContent || ""), null, { timeout: 8000 });
});

// Backend down at load → banner, disabled launch, automatic recovery
expectErrors = true;
await stopApi();
await p.goto("http://127.0.0.1:3000/#lab/optimization"); await p.reload();
await check("Load with service down: offline banner and launch disabled", async () => {
  await p.locator(".banner", { hasText: "unreachable" }).waitFor({ timeout: 10000 });
  if (!(await launchBtn().isDisabled())) throw new Error("launch enabled while offline");
});
await shot("11-offline");
startApi();
await waitApi(true);
await p.getByRole("button", { name: /Retry now/ }).click();
await check("Retry recovers without reload", async () => {
  await p.locator(".banner", { hasText: "unreachable" }).waitFor({ state: "detached", timeout: 20000 });
  await p.waitForFunction(() => !document.querySelector(".config button[type=submit]")?.disabled, null, { timeout: 10000 });
});
expectErrors = false;

// Onchain path with an unreachable RPC: commitments must fail honestly, never show as committed.
expectErrors = true;
await stopApi();
api = spawn(`${ROOT}/.venv/bin/python`, ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"], {
  cwd: ROOT,
  env: { ...process.env, DATABASE_PATH: path.join(OUT, "chain.sqlite"), ITERATION_DELAY: "0.1", BASE_SEPOLIA_RPC_URL: "http://127.0.0.1:9", WALLET_PRIVATE_KEY: "0x" + "11".repeat(32), CONTRACT_ADDRESS: "0x" + "22".repeat(20) },
  stdio: ["ignore", fs.openSync(path.join(OUT, "api.log"), "a"), fs.openSync(path.join(OUT, "api.log"), "a")],
});
await waitApi(true);
await p.goto("http://127.0.0.1:3000/"); await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await check("Chain mode shown when credentials are configured", async () => {
  const t = await p.locator(".mode-chip").innerText();
  if (!/Base Sepolia/.test(t)) throw new Error(t);
});
await p.getByRole("link", { name: "Enter the lab" }).click();
await field("Iterations").fill("3");
await p.locator('.seed-status[data-state="valid"]').waitFor({ timeout: 8000 });
await launchBtn().click();
await check("Unreachable RPC: commitments end Failed, never Committed", async () => {
  await p.waitForFunction(() => document.querySelectorAll(".trail tbody tr").length === 4 && [...document.querySelectorAll(".trail tbody .badge")].every((b) => /Failed/.test(b.textContent)), null, { timeout: 120000 });
  const onchain = await p.locator(".trail-head .muted").innerText();
  if (!/0 onchain/.test(onchain)) throw new Error(onchain);
  return onchain;
});
await p.getByRole("button", { name: "Inspect generation 3" }).click();
await p.getByRole("button", { name: /Verify experiment/ }).click();
await check("Failed commitment is reported separately from intact integrity", async () => {
  await p.locator(".verdict[data-shown]").waitFor({ timeout: 8000 });
  const t = await p.locator(".verdict").innerText();
  if (!/Local integrity verified/.test(t) || !/failed/.test(t)) throw new Error(t);
  return t;
});
await shot("13-commit-failed");
await check("Retry failed commitments re-queues them on the backend", async () => {
  const [res] = await Promise.all([p.waitForResponse((r) => r.url().includes("/retry")), p.getByRole("button", { name: /Retry failed commitments/ }).click()]);
  const body = await res.json();
  if (body.status !== "queued") throw new Error(JSON.stringify(body));
  await p.waitForTimeout(2500);
  const log = fs.readFileSync(path.join(OUT, "api.log"), "utf8");
  const posts = (log.match(/POST \/api\/runs\/[^ ]+\/retry/g) || []).length;
  return `retry accepted by the backend (status "queued"; ${posts} retry call logged)`;
});
expectErrors = false;
await ctx.close();

// Reduced motion
const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const rp = await rctx.newPage();
await rp.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await rp.waitForTimeout(1500);
await check("Reduced motion: content visible immediately, no running animations", async () => {
  const op = await rp.evaluate(() => getComputedStyle(document.getElementById("lab")).opacity);
  const running = await rp.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getComputedTiming().duration || 0) > 50).length);
  if (op !== "1" || running > 0) throw new Error(`opacity ${op}, running ${running}`);
});
await rp.screenshot({ path: path.join(OUT, "12-reduced-motion.png") });
await rctx.close();
await browser.close();
api.kill("SIGTERM");

if (errors.length) fail("No unexpected console errors or failed requests", errors.slice(0, 8).join(" || "));
else pass("No unexpected console errors or failed requests");
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
