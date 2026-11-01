# eBPF.party

This repo holds the website, content, backend & userspace for ebpf.party.

## 中文版（本 fork）

这是 [DavidVentura/ebpf.party](https://github.com/DavidVentura/ebpf.party) 的中文 fork，
由 `occam-7` 维护，已把教程正文、界面文案与题目说明翻成中文。

- 原版（英文）：https://ebpf.party
- 本站面向中文读者，译文与英文原版有歧义时以原版为准
- 代码标识符、命令、辅助函数名、ASCII 示意图、C 代码与注释一律保持原样，只翻给人读的散文
- 上游同步：`git fetch upstream && git merge upstream/master`，改动集中在 `website/src/content/`、
  `website/src/components/`、`website/src/pages/` 与 `website/src/layouts/`，冲突面小

## 已知限制

浏览器内的 TCC 类型检查依赖 `tcc` 子模块用 emscripten 编出的 `syntax_check.wasm`（不进仓库）。
本 fork 提交了一个占位模块 `website/src/wasm/syntax_check.mjs`，让全新 clone 能直接 `pnpm build`；
代价是「边打字边检查」不再产生诊断——代码里真实存在的编译错误仍会在点「运行」后由后端
`clang` 报出来。要恢复该功能，按 `Makefile` 的 `website_bindings` 目标构建 tcc 产物并覆盖占位文件。

## 托管到 Cloudflare Workers

`worker/` 是 Cloudflare Worker 版本的外壳：托管 `website/dist` 静态产物，并把 `/run_code/*`
的 SSE 流反代到真正的执行主机。执行后端（`clang -target bpf` + Firecracker/KVM）无法在
Worker 上运行，原因与验证记录见 [docs/cloudflare-hosting.md](docs/cloudflare-hosting.md)。

```bash
cd website && pnpm install && pnpm build
cd ../worker && npm install && wrangler deploy
```

## 上游原始说明

仓库结构：`website/`（Astro 站点）、`backend/`（Rust 执行后端）、`userspace/`（虚拟机内
的 eBPF loader）、`shared/`（前后端共用的协议类型）、`tcc/`（子模块，浏览器端类型检查用）、
`bins/`（rootfs 里的小测试程序）。
