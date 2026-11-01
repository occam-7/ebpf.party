# ebpf-party-zh Worker

静态站点托管 + `/run_code/*` 边缘反代。设计边界与验证记录见 `../docs/cloudflare-hosting.md`。

## 为什么需要这一层

`website/dist` 是纯静态产物，Worker 直接托管。但执行 eBPF 需要 `clang -target bpf` 与
Firecracker/KVM，Worker 上不存在，所以 `/run_code/*` 转发到 `ORIGIN` 指向的 Linux 主机，
并保证 SSE 逐块透传。

## 本地跑

```bash
# 1. 造一个假后端（模拟 SSE），仅用于验证代理行为
node test/fake-origin.cjs

# 2. 起 Worker
wrangler dev --port 8787
```

## 验证

```bash
curl -sS --noproxy '*' -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/
curl -sS --noproxy '*' -N -D- -X POST --data-binary 'int x;' \
  http://127.0.0.1:8787/run_code/chapter-0/1_theory
```

期望：静态页 `200`；`/run_code` 返回 `text/event-stream` 且事件逐个到达（首字节约 30ms，
而不是等全部事件结束），`x-origin-marker` 透传，无 `content-length`。

## 变量

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `ORIGIN` | 是 | 执行主机地址，生产用 `https` |
| `MAX_PROGRAM_BYTES` | 否 | 默认 16384，需与 `backend/src/main.rs` 的 `MAX_PROGRAM_SIZE` 一致 |
| `ALLOWED_ORIGIN` | 否 | 前端与 API 跨域部署时设置；同源部署留空 |
| `ALLOW_METRICS` | 否 | 设 `1` 才转发 `/metrics` |

## 注意

- 构建前先 `cd ../website && pnpm build`，否则 `assets.directory` 不存在，`wrangler` 会报错
- 本机验 `curl` 打回环时加 `--noproxy '*'`：环境里的 `https_proxy` 会让回环请求走代理并超时
