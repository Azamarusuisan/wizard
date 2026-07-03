import { createServer, type Server } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, relative } from "node:path";

export async function serveStatic(dir: string, port = 0) {
  const root = normalize(dir);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const candidate = normalize(join(root, pathname === "/" ? "index.html" : pathname));

    if (relative(root, candidate).startsWith("..")) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const file = existsSync(candidate) && statSync(candidate).isDirectory() ? join(candidate, "index.html") : candidate;
    if (!existsSync(file)) {
      response.writeHead(404).end("Not found");
      return;
    }

    response.writeHead(200, { "content-type": contentType(file) });
    createReadStream(file).pipe(response);
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    url: `http://127.0.0.1:${actualPort}`,
    close: () => close(server)
  };
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function contentType(file: string) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  }[extname(file)] ?? "application/octet-stream";
}
