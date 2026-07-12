# Vendored Cimbar Runtime

Assets in `public/vendor/cimbar/v0.6.5` come from the official `libcimbar` v0.6.5 release archive. The project source is `https://github.com/sz3/libcimbar/tree/v0.6.5`.

Relevant files:

- `cimbar_js.2026-05-09T0146.js`: upstream Emscripten glue loaded by the product adapters.
- `cimbar_js.2026-05-09T0146.wasm`: upstream WASM codec asset.
- `main.2026-05-09T0146.js`: upstream sender runtime.
- `recv.2026-05-09T0146.js`: upstream receiver runtime.
- `recv-worker.2026-05-09T0146.js`: upstream decoder worker.
- `zstd.2026-05-09T0146.js`: compression support used by upstream runtime.

The upstream sender/receiver HTML shells, PWA manifests and service workers are intentionally not
distributed. Project E uses its own entry point and does not register the upstream caches; keeping
only runtime assets reduces executable public surface and prevents alternate UI entry points.

Licensing noted from upstream analysis:

- `libcimbar`: MPL-2.0.
- `wirehair`: BSD-3-Clause.
