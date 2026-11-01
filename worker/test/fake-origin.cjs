// 假后端：模拟 ebpf.party 的 SSE 行为，用来验证 Worker 代理的流式透传
const http = require("node:http");

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/metrics") {
    res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
    res.end("# fake metrics\n");
    return;
  }
  if (!url.pathname.startsWith("/run_code/")) {
    res.writeHead(404).end("nf");
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString();
    console.error(`[origin] POST ${url.pathname} origin=${req.headers.origin} bytes=${body.length}`);
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-origin-marker": "fake-backend",
    });
    const events = [
      { type: "compiling" },
      { type: "booting" },
      { type: "guestMessage", data: { type: "event", data: { echo: body.length } } },
      { type: "correctAnswer" },
    ];
    let i = 0;
    const tick = () => {
      if (i >= events.length) {
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify(events[i])}\n\n`);
      i += 1;
      setTimeout(tick, 300);
    };
    tick();
  });
});

server.listen(8081, "127.0.0.1", () => console.error("[origin] listening on 8081"));
