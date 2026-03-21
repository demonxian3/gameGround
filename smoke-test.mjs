import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve("output", "playwright");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const secondPage = await context.newPage();

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => {
  errors.push(String(err));
});
secondPage.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
secondPage.on("pageerror", (err) => {
  errors.push(String(err));
});

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
const roomState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await secondPage.goto(`http://127.0.0.1:4173?room=${roomState.roomId}`, { waitUntil: "networkidle" });
await secondPage.waitForTimeout(250);

const states = {};

async function capture(name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  states[name] = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

await capture("tetris-initial");
await page.keyboard.press("ArrowLeft");
await secondPage.keyboard.press("ArrowRight");
await page.waitForTimeout(80);
await secondPage.waitForTimeout(80);
await page.keyboard.press("Space");
await secondPage.keyboard.press("Space");
await page.waitForTimeout(200);
await capture("tetris-play");

await page.click('[data-game="snake"]');
await page.waitForTimeout(150);
await capture("snake-initial");
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(80);
await page.keyboard.press("Space");
await page.waitForTimeout(250);
await capture("snake-play");

await page.click('[data-game="tank"]');
await page.waitForTimeout(150);
await capture("tank-initial");
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(260);
await page.keyboard.up("ArrowRight");
await page.keyboard.press("Space");
await page.waitForTimeout(300);
await capture("tank-play");

await page.click('[data-game="cat"]');
await page.waitForTimeout(150);
await capture("cat-initial");
let target = await page.evaluate(() => window.arcadia.getCatCellCenter(5, 3));
await page.click("canvas", { position: target });
await page.waitForTimeout(150);
target = await page.evaluate(() => window.arcadia.getCatCellCenter(6, 4));
await page.click("canvas", { position: target });
await page.waitForTimeout(150);
await capture("cat-play");

fs.writeFileSync(path.join(outputDir, "states.json"), JSON.stringify(states, null, 2));
fs.writeFileSync(path.join(outputDir, "errors.json"), JSON.stringify(errors, null, 2));

await secondPage.close();
await context.close();
await browser.close();
