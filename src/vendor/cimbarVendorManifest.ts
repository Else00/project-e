export const cimbarVendorManifest = {
  version: "v0.6.5",
  sourceUrl: "https://github.com/sz3/libcimbar/tree/v0.6.5",
  releaseUrl: "https://github.com/sz3/libcimbar/releases/tag/v0.6.5",
  basePath: "/vendor/cimbar/v0.6.5",
  files: {
    glue: "cimbar_js.2026-05-09T0146.js",
    wasm: "cimbar_js.2026-05-09T0146.wasm",
    encoderApp: "main.2026-05-09T0146.js",
    decoderApp: "recv.2026-05-09T0146.js",
    decoderWorker: "recv-worker.2026-05-09T0146.js",
    zstd: "zstd.2026-05-09T0146.js",
  },
  licenses: [
    {
      name: "libcimbar",
      license: "MPL-2.0",
      source: "https://github.com/sz3/libcimbar/tree/v0.6.5",
    },
    {
      name: "wirehair",
      license: "BSD-3-Clause",
      source: "https://github.com/catid/wirehair",
    },
  ],
} as const;

export function vendorAssetPath(fileName: string): string {
  const baseUrl = `${import.meta.env.BASE_URL}/`.replace(/\/+$/, "/");
  const assetBase = `${baseUrl}${cimbarVendorManifest.basePath.replace(/^\//, "")}`;
  return `${assetBase}/${fileName}`;
}
