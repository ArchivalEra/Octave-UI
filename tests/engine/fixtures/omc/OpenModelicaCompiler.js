// tests/engine/fixtures/omc/OpenModelicaCompiler.js
// 成功路径回归锁的假 OMC 胶水模块：形状对齐 wasm-bindgen 产物的 ESM namespace
// （default = 异步加载器，其余为具名导出）。所有调用转记到 globalThis.__omcFixtureState，
// 使测试能同时断言「谁被调了」「调用顺序」「传参」以及「__omc 确实就是本模块」。
const state = () => globalThis.__omcFixtureState;

export default async function boot(wasmUrl) {
  state()?.calls.push(['default', wasmUrl]);
}

export function omc_set_env(key, value) {
  state()?.calls.push(['omc_set_env', key, value]);
}

export function omc_init() {
  state()?.calls.push(['omc_init']);
}

export function omc_set_inwasm_driver(flag) {
  state()?.calls.push(['omc_set_inwasm_driver', flag]);
}

export function omc_eval(code) {
  state()?.calls.push(['omc_eval', code]);
  return `eval:${code}`;
}
