import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.FRONTEND_PORT || 4173);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function resolveRequestPath(urlPathname) {
  const relativePath = decodeURIComponent(urlPathname === "/" ? "/index.html" : urlPathname);
  const absolutePath = path.resolve(rootDir, `.${relativePath}`);
  if (!absolutePath.startsWith(rootDir)) return null;
  return absolutePath;
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  const filePath = resolveRequestPath(requestUrl.pathname);

  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const extname = path.extname(filePath);
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(port, host, () => {
  console.log(`frontend dev server listening on http://${host}:${port}`);
});

