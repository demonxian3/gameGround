export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function readStoredValue(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function storeValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function normalizeMode(value, multiMode, singleMode) {
  return value === multiMode ? multiMode : singleMode;
}

export function getMappedKeys(event) {
  const mapped = new Set([event.key, event.code]);
  if (event.code === "KeyW" || event.key === "w" || event.key === "W") mapped.add("ArrowUp");
  if (event.code === "KeyA" || event.key === "a" || event.key === "A") mapped.add("ArrowLeft");
  if (event.code === "KeyS" || event.key === "s" || event.key === "S") mapped.add("ArrowDown");
  if (event.code === "KeyD" || event.key === "d" || event.key === "D") mapped.add("ArrowRight");
  return [...mapped];
}

export function formatCountdown(ms) {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function drawRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

export function fitCanvas(canvas, ctx) {
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
