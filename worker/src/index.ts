/**
 * Cloudflare Worker 前端 + 边缘代理
 *
 * 职责边界（重要）：
 *   这个 Worker 只做两件事：
 *     1. 静态资源托管（Astro 的 dist/ 目录，通过 ASSETS binding）
 *     2. /run_code/* 与 /metrics 的反向代理，把请求转发到真正跑 eBPF 的
 *        Linux 宿主机（env.ORIGIN），并把 SSE 响应逐块透传回浏览器
 *
 *   它不做编译、不跑 VM。Worker 是 V8 isolate：没有子进程、没有内核、
 *   没有 /dev/kvm，clang 与 Firecracker 都不可能在上面跑。
 *   原因见 docs/cloudflare-hosting.md。
 */

interface Env {
  ASSETS: Fetcher;
  /** 后端 origin，例如 http://10.0.0.5:8081 ；生产环境用 https */
  ORIGIN: string;
  /** 与后端 backend/src/main.rs 的 MAX_PROGRAM_SIZE 保持一致 */
  MAX_PROGRAM_BYTES?: string;
  /** 可选：允许跨域调用 API 的前端 origin（split-origin 部署时设置） */
  ALLOWED_ORIGIN?: string;
}

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
};

/** 不能透传的逐跳头 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "cf-connecting-ip",
  "cf-ray",
  "cf-ipcountry",
  "x-forwarded-proto",
]);

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const allow = env.ALLOWED_ORIGIN;
  if (!allow) return {};
  const origin = request.headers.get("origin");
  if (origin && origin === allow) {
    return {
      "access-control-allow-origin": allow,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
      vary: "origin",
    };
  }
  return {};
}

function jsonError(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...extra },
  });
}

async function handleRunCode(request: Request, env: Env, url: URL): Promise<Response> {
  const cors = corsHeaders(env, request);

  if (request.method === "OPTIONS" && env.ALLOWED_ORIGIN) {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "POST") {
    return jsonError(405, "Method Not Allowed - use POST", { allow: "POST", ...cors });
  }

  const maxBytes = Number(env.MAX_PROGRAM_BYTES ?? 16 * 1024);
  // 先按 Content-Length 快速拒绝，再在读完 body 后校验真实长度
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return jsonError(413, `Program size ${declared} exceeds maximum of ${maxBytes} bytes`, cors);
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return jsonError(400, "Empty program body", cors);
  }
  if (body.byteLength > maxBytes) {
    return jsonError(413, `Program size ${body.byteLength} exceeds maximum of ${maxBytes} bytes`, cors);
  }

  if (!env.ORIGIN || env.ORIGIN.includes("example.invalid")) {
    return jsonError(503, "No eBPF execution backend configured (set ORIGIN)", cors);
  }

  const upstreamUrl = new URL(url.pathname + url.search, env.ORIGIN);

  const headers = new Headers();
  headers.set("content-type", "text/plain");
  headers.set("accept", "text/event-stream");
  // 后端只对 localhost origin 回 ACAO，其它一律落到 localhost:3000；
  // 这里把 Origin 换成 ORIGIN 自己，避免后端回一个无意义的 CORS 头
  headers.set("origin", new URL(env.ORIGIN).origin);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: "POST",
      headers,
      body,
      // SSE 一直被流式消费，这里不设 signal，交给客户端断开时自然取消
    });
  } catch (err) {
    return jsonError(502, `Upstream unreachable: ${(err as Error).message}`, cors);
  }

  const outHeaders = new Headers(SSE_HEADERS);
  for (const [k, v] of upstream.headers) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key)) continue;
    if (key.startsWith("access-control-")) continue; // 由本 Worker 决定
    if (key === "content-type" || key === "cache-control") continue;
    if (key === "content-length") continue; // 流式响应不能带定长
    outHeaders.set(k, v);
  }
  for (const [k, v] of Object.entries(cors)) outHeaders.set(k, v);

  // 关键：直接把 upstream.body 交给 Response，不做 .text()/arrayBuffer()，
  // 否则整个 SSE 流会被缓冲，页面在跑完前收不到任何事件。
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}

async function handleMetrics(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.ORIGIN || env.ORIGIN.includes("example.invalid")) {
    return jsonError(503, "No eBPF execution backend configured (set ORIGIN)");
  }
  // Prometheus 抓取端点默认只在私网开；Worker 默认不对外转发，避免暴露指标。
  // 需要时把 ALLOW_METRICS 设成 "1"。
  if ((env as any).ALLOW_METRICS !== "1") {
    return jsonError(404, "Not Found");
  }
  const upstreamUrl = new URL(url.pathname + url.search, env.ORIGIN);
  const upstream = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: { accept: "text/plain" },
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "text/plain; version=0.0.4" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/run_code/")) {
      return handleRunCode(request, env, url);
    }
    if (url.pathname === "/metrics") {
      return handleMetrics(request, env, url);
    }

    // 其余全部交给静态资源（Astro 构建产物）
    return env.ASSETS.fetch(request);
  },
};
