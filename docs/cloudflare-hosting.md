# 把 ebpf.party 托管到 Cloudflare Workers：能搬的与搬不动的

## 结论

可以，但只能搬一半。**静态站点 + 浏览器端类型检查完全适合 Worker；真正的执行后端搬不过去。**

本站后端不是普通的 Web 服务，它是一台「按需拉起 Firecracker 微虚拟机、在真内核里跑 eBPF 程序」的机器。Worker 是 V8 isolate：没有子进程，没有 `/dev/kvm`，没有内核，也没有 2MB 大页。所以落地形态只能是：

```
浏览器 ──► Cloudflare Worker ──┬──► ASSETS（Astro 构建产物，全球边缘）
                               └──► /run_code/*、/metrics 反代 ──► Linux 执行主机（clang + Firecracker）
```

本目录的 `worker/` 就是这一层，压缩包内已验证可跑（见「验证记录」）。

## 原后端到底在做什么

逐条对着源码说，这些都是搬不动的部分：

| 环节 | 实现位置 | 依赖 |
| --- | --- | --- |
| C → BPF 字节码 | `backend/src/compile.rs` | 外部 `clang -target bpf`，`-include-pch task.h.pch`，`-g -gmodules` 保留调试信息 |
| 执行环境 | `backend/src/vm_pool.rs` | `firecracker_spawn`，`use_hugepages: true`，每台 VM 64MB |
| 启动前置检查 | `backend/src/main.rs:27` `check_hugepages` | 读 `/proc/sys/vm/nr_hugepages`，要求 `max_concurrent_vms × 64MB / 2MB` 个大页 |
| 内核内验证 | `userspace/src/ebpf.rs` | 真内核的 verifier：加载、attach、把 verifier log 与事件回传 |
| 诊断解释 | `backend/src/diag.rs`（64K）、`btf.rs`、`dwarf.rs` | 目标内核的 BTF、程序自身 DWARF、`task.h` 类型信息 |
| 题目判分 | `userspace/src/exercises.rs` | 观测到的真实事件与期望答案比对 |

eBPF 这门课的教学核心，恰恰是「内核 verifier 拒绝你的程序、告诉你为什么」。这一环没有内核就不存在，**不是可以模拟的细节**。

## Worker 能做什么、不能做什么

能：

- 托管 `website/dist` 全部静态产物（Astro 输出，纯静态）
- 浏览器端 TCC（WASM）实时类型检查 —— 这部分本来就在客户端跑（`website/src/workers/tcc-worker.ts`），与托管无关
- 以流式方式反代 `/run_code/*` 的 SSE，逐块透传不缓冲
- 对齐后端约束：`MAX_PROGRAM_SIZE = 16 * 1024`（`backend/src/main.rs:184`）在边缘先拒一次，省掉一次往返

不能：

- 起进程、调 `clang`
- 访问 KVM、Firecracker、hugepages
- 提供内核 verifier、内核 BTF、tracepoint/kprobe 挂载点

所以「把后端源码改成能在 Worker 上跑」这件事不成立：不是代码写法问题，是运行时能力边界问题。

## Worker 实现要点

`worker/src/index.ts`（约 170 行）：

- `/run_code/*` → `POST` only，`413` 超限、`400` 空 body、`405` 其它方法、`503` 未配 `ORIGIN`
- 上游响应逐块交给 `Response`，**不做 `.text()`/`arrayBuffer()`**，否则 SSE 会被缓冲到跑完才吐
- 过滤逐跳头（`connection`、`transfer-encoding`、`content-length` 等），强制 `text/event-stream` 与 `cache-control: no-transform`
- 把 `Origin` 改写成 `ORIGIN` 自己的 origin：后端只认 `http://localhost:*` 并回 ACAO（`backend/src/main.rs:161`），透传浏览器 Origin 只会拿到一个没用的 CORS 头
- `/metrics` 默认 `404`，需要时设 `ALLOW_METRICS=1` 才转发
- 其它路径全部 `env.ASSETS.fetch`

## 部署

```bash
cd website && pnpm install && pnpm build
cd ../worker && npm install
wrangler deploy --dry-run --outdir dist   # 先验证打包
wrangler deploy                           # 真正上线时把 vars.ORIGIN 换成执行主机地址
```

`worker/wrangler.jsonc` 里 `assets.directory` 指向 `../website/dist`，`run_worker_first: true`，所以首屏请求也进 Worker。

`ORIGIN` 的接法，按可用性排序：

1. 执行主机直接对外 `https`（需自己签/挂证书）
2. Cloudflare Tunnel 把内网后端映射成 `https://...`，Worker 侧只填隧道域名 —— 不暴露源站 IP，推荐
3. Cloudflare Containers：**未验证**。本项目的 runner 依赖 `/dev/kvm` 与 hugepages，容器是否提供嵌套虚拟化需要实测，不要假定可用

Cloudflare CLI（`cf`，beta）走另一套项目配置：`worker/cloudflare.config.ts` 定义 Worker 与绑定，
静态目录写在 `worker/wrangler.config.ts`。`cf migrate` 生成的配置默认带一个 `throw` 和 TODO，必须删掉。
两条路径各自只认自己的配置文件，改配置时两边同步。`cf` 不能用 `wrangler login` 的凭据，需 `cf auth login`。

## 已知限制

- 浏览器内类型检查（TCC WASM）未随仓库分发：本 fork 用占位模块保证 `pnpm build` 可跑通，
  代价是边打字边检查不产生诊断；真实编译错误在点「运行」后仍由后端 `clang` 报出
- 只翻译了教程正文、界面文案与题目说明；代码、命令、辅助函数名、C 注释保持英文
- 线上实例没有接执行主机，`/run_code/*` 一律 `503`；「运行」按钮当前不可用

## 部署记录

已用 `cf deploy` 部署到真实账号（Worker `ebpf-party-zh`，版本 `03cf8134-c97f-49ab-b674-661301ed11af`）：

- 地址 <https://ebpf-party-zh.13148.workers.dev>
- `GET /` → `200`，19465 字节，`lang="zh-CN"`，TTFB 180ms
- `GET /exercises/chapter-0/1_theory/` → `200`；`GET /how-it-works/` → `200`
- `POST /run_code/x` → `503 No eBPF execution backend configured (set ORIGIN)`（`ORIGIN` 为 `.invalid` 占位）
- `GET /run_code/x` → `405`；未知路径 → `404`
- 上传：49 个静态资源 + Worker 包 4.35 KiB（gzip 1.65 KiB）

## 验证记录

本地 `wrangler dev`（workerd）+ `worker/test/fake-origin.cjs` 假后端：

- `GET /` → `200`，19335 字节，`lang="zh-CN"`，静态资源经 Worker 正常返回
- `POST /run_code/...` → `200`，`TTFB 28ms`、总耗时 `1.23s`（4 个事件 × 300ms），证明 SSE 未被缓冲；上游自定义头 `x-origin-marker` 透传成功，`content-length` 被剥掉，`transfer-encoding: chunked`
- `POST` 20000 字节 → `413 Program size 20000 exceeds maximum of 16384 bytes`
- `GET /run_code/x` → `405`；空 body → `400`；`/metrics` 未开 → `404`；未知路径 → `404`

未验证：

- 真实 eBPF 后端（需要一台带 KVM 的 Linux 主机 + 预编译 rootfs/vmlinux，本仓库不含这些产物）
- 自定义域与路由（已部署到 workers.dev，未绑域名）
- Cloudflare Containers 承载 runner 的可行性
