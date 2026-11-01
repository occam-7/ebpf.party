import { bindings, defineConfig } from "cf/config";

/**
 * Cloudflare CLI（`cf`）的项目配置。
 *
 * `wrangler.jsonc` 仍然有效：`cf` 不读它，`wrangler dev/deploy` 不读本文件。
 * 两份配置描述同一个 Worker —— 改绑定、路由或 assets 目录时两边都要改，
 * 否则 `cf deploy` 与 `wrangler deploy` 会上传不同的东西。
 *
 * 静态资源目录在 wrangler.config.ts 里（cloudflare.config.ts 没有 assets.directory 字段）。
 */
export default defineConfig({
	worker: {
		name: "ebpf-party-zh",
		compatibilityDate: "2025-10-01",
		entrypoint: "src/index.ts",
		assets: {
			notFoundHandling: "404-page",
			runWorkerFirst: true,
		},
		env: {
			// 未接真实后端时的占位：以 .invalid 结尾，Worker 会直接回 503 而不是去连接。
			ORIGIN: bindings.text("https://backend.example.invalid"),
			MAX_PROGRAM_BYTES: bindings.text("16384"),
			ASSETS: bindings.assets(),
		},
	},
});
