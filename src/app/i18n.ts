import { scalarBounds } from "../domain/scalars";

export const i18n = {
  workspace: {
    encode: "Encode",
    decode: "Decode",
    info: "Info",
  },
  encode: {
    title: "Encode",
    intro: "Pick a file or type text; project-e selects direct or bigfile transfer automatically.",
    chooseFile: "Choose file",
    chooseFileFirst: "Choose file first.",
    textInput: "Text input",
    textInputDetail: "UTF-8 text is encoded as a local text/plain file.",
    textInputPlaceholder: "Type or paste text to send.",
    textFileName: "File name",
    useText: "Use text",
    frameOutput: "Frame output",
    frameOutputDetail: "Official WASM sender surface. Fullscreen contains only the optical frame.",
    encodeStatus: "Encode status",
    loadingWasm: "Loading WASM",
    directPlanLabel: "Direct envelope",
    directPlan: "BLAKE3 envelope",
    plannedBigfile:
      "Auto bigfile active. Chunks use distinct encode ids plus per-chunk and final BLAKE3 verification.",
  },
  help: {
    encodeMode:
      "**Sender mode** selects the optical symbol geometry.\n\n[B]{.term-b} is the current practical default in the official web sender: dense payload layout, broadly tested, best first choice for most screens.\n\n[Bm]{.term-bm} is a medium geometry: less dense than [B]{.term-b}, usually easier for cameras that struggle with the tightest symbol layout.\n\n[Bu]{.term-bu} is a wider geometry: more spacing and tolerance for blur/glare, at the cost of lower practical throughput.\n\n[4C]{.term-4c} is a lower-density compatibility mode for older or constrained receiver paths.\n\nProfiles keep [B]{.term-b} unless you explicitly test another geometry.",
    encodeFps: `**Sender FPS** controls animation speed.\n\nRange: \`${scalarBounds.fps.min}-${scalarBounds.fps.max}\` frames/sec, integer steps.\n\nHigher values transfer faster but can outrun camera exposure, autofocus, display refresh or browser scheduling.`,
    wakeLock:
      "**Wake lock** asks the browser to keep the display awake during long transfers.\n\nIf unsupported, keep the screen awake manually before entering fullscreen.",
    colorBalance:
      "**Color balance** asks the sender to render a safer color profile for imperfect displays and camera pipelines.\n\nIt can reduce practical density but improves scanner tolerance.",
    fullscreenTarget:
      "**Fullscreen target** enters fullscreen automatically when rendering starts, when the browser accepts the user gesture.\n\nThe fullscreen icon remains the manual browser-permission action.\n\nFullscreen contains only the optical frame/canvas.",
    fullscreenMargin:
      "**Fullscreen margin** adds a small black safety margin around the optical frame only in fullscreen.\n\nKeep it off for maximum displayed size. Turn it on when a camera or display crops screen edges.",
    redundancy: `**Redundancy** adds extra fountain data so missed or blurred frames can be recovered.\n\nRange: \`${scalarBounds.redundancy.min.toFixed(2)}-${scalarBounds.redundancy.max.toFixed(2)}\`, step \`${scalarBounds.redundancy.step}\`.\n\nMore redundancy is slower but safer.`,
    chunkSize: `**Chunk size** bounds each direct stream.\n\nRange: \`${scalarBounds.chunkSizeMiB.min}-${scalarBounds.chunkSizeMiB.max} MiB\`, step \`${scalarBounds.chunkSizeMiB.step} MiB\`.\n\nSmaller chunks recover more easily after interruptions; larger chunks reduce session overhead but are riskier.`,
    encodeIdStrategy:
      "**Encode id strategy** separates receiver sessions.\n\n`Auto` uses a timestamp-derived id.\n\n`Manual` is used for repeatable tests and for bigfile chunks where each chunk needs a distinct stream id.",
    encodeIdBase: `**Encode id base** is the numeric session id used when manual ids are enabled.\n\nRange: \`${scalarBounds.encodeId.min}-${scalarBounds.encodeId.max}\`, integer steps.\n\nAvoid repeatedly reusing small values because receivers can confuse nearby sessions.`,
    decodeMode:
      "**Decode mode** selects which optical geometry the scanner tries to decode.\n\n[Auto]{.term-auto} rotates through supported modes.\n\nManual [B]{.term-b}, [Bm]{.term-bm}, [Bu]{.term-bu} or [4C]{.term-4c} is useful when you know the sender mode and want less search overhead.",
    frameLimit: `**Frame limit** caps how often the decoder samples camera frames.\n\nRange: \`${scalarBounds.fps.min}-${scalarBounds.fps.max}\` frames/sec, integer steps.\n\nMatch the sender FPS unless the camera, CPU or browser starts dropping work.`,
    workers: `**Workers** control how many browser workers process frames.\n\nRange: \`${scalarBounds.workerCount.min}-${scalarBounds.workerCount.max}\`, integer steps.\n\nMore workers can help desktop CPUs; too many can heat or throttle mobile devices.`,
    autoDetect:
      "**Auto-detect mode** reads mode hints from incoming frames after initial detection.\n\nIt complements [Auto]{.term-auto} decode mode, but is not the same setting: Decode mode chooses the search strategy, auto-detect accepts mode hints from detected frames.",
    nativeFormats:
      "**Prefer NV12/I420** keeps frames closer to camera-native YUV planes when the browser exposes them.\n\n`NV12` and `I420` are planar/semi-planar camera pixel formats. Avoiding RGB conversion can reduce decode latency.",
  },
  modes: {
    encode: {
      b: "default dense",
      bm: "medium geometry",
      bu: "wide geometry",
      "4c": "compatibility",
    },
    decode: {
      auto: "search modes",
      b: "dense",
      bm: "medium",
      bu: "wide",
      "4c": "compat",
    },
  },
  presets: {
    balanced:
      "Balanced is the conservative project-e default derived from the official web sender shape. It keeps B mode because B is the current tested high-density sender baseline.",
    fast: "Fast keeps B mode and reduces safety margins for controlled screens, stable cameras and short sessions.",
    robust:
      "Robust keeps B mode but slows timing, enables color balance and raises redundancy for handheld glare or imperfect focus.",
    largeCareful:
      "Large careful keeps B mode because bigfile chunks benefit from the tested dense sender path; project-e applies manual encode ids per chunk automatically.",
  },
  info: {
    title: "Diagnostics",
    intro: "Fullscreen display target, privacy and local runtime state.",
    localOnly: "Local-only by design",
    localOnlyDetail:
      "No upload endpoint, no API key, no backend runtime. Static hosting is enough.",
    displayTarget: "Fullscreen display target",
    displayTargetDetail:
      "Browser screen APIs expose CSS pixels on many systems; physical pixels are estimated from CSS screen size and DPR.",
    runtimeDetails: "Technical package details",
  },
} as const;
