// 本地构建用的占位模块：上游把 emscripten 编出的 TCC wasm 作为构建产物分发，
// 不随仓库提交（见 Makefile 的 website_bindings 目标）。
// 这个 stub 只让 vite/rollup 能解析 `../wasm/syntax_check.mjs`，让静态站点能构建出来；
// 它不做类型检查，浏览器端点 Run 也不会得到 tcc 诊断。
export default function createModule() {
  return Promise.resolve({
    ccall: () => 0,
    UTF8ToString: () => "",
  });
}
