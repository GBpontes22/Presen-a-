import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const spreadsheetId = "1Vufd1iCOEj450pKEfGg7Kz1OiXyx_7ybfj1mubdvFmQ";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the attendance PWA shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Presença do Embaixador<\/title>/i);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"\/>/i);
  assert.match(html, /<meta name="theme-color" content="#08056f"\/>/i);
  assert.match(html, /Presença do Embaixador/);
  assert.match(html, /Novo registro/);
  assert.match(html, /Data/);
  assert.match(html, /Evento/);
  assert.match(html, /Presença/);
  assert.match(html, /Link direto para a planilha enviada/);
  assert.match(html, new RegExp(spreadsheetId));
  assert.doesNotMatch(html, /URL do Web App|Sincronizar pendentes|Script do Google Planilhas|Conexão/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("ships installable PWA assets", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  );
  const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

  assert.equal(manifest.name, "Presença do Embaixador");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, ".");
  assert.equal(manifest.theme_color, "#08056f");
  assert.equal(manifest.icons[0].src, "logo-er.png");
  assert.equal(manifest.icons[0].sizes, "512x512");

  assert.match(serviceWorker, /CACHE_NAME/);
  assert.match(serviceWorker, /manifest\.webmanifest/);
  assert.match(serviceWorker, /self\.addEventListener\("fetch"/);
});
