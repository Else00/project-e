import { programVersion, protocolVersions } from "../src/domain/protocolVersions";

type PackageManifest = Readonly<{ version?: unknown }>;

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

const readManifest = async (path: URL): Promise<PackageManifest> =>
  (await Bun.file(path).json()) as PackageManifest;

const appManifest = await readManifest(new URL("../package.json", import.meta.url));
const protocolManifest = await readManifest(
  new URL("../vendor/project-e-protocol/package.json", import.meta.url),
);

const errors: string[] = [];
if (typeof appManifest.version !== "string" || !semverPattern.test(appManifest.version)) {
  errors.push("package.json version must be a stable SemVer value.");
} else if (appManifest.version !== programVersion) {
  errors.push(`package.json ${appManifest.version} does not match UI version ${programVersion}.`);
}
if (protocolManifest.version !== protocolVersions.package) {
  errors.push(
    `Vendored protocol ${String(protocolManifest.version)} does not match runtime ${protocolVersions.package}.`,
  );
}

const refType = process.env.GITHUB_REF_TYPE;
const refName = process.env.GITHUB_REF_NAME;
if (refType === "tag" && refName !== `web-v${programVersion}`) {
  errors.push(`Release tag must be web-v${programVersion}; received ${refName ?? "<missing>"}.`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`version-check: ${error}`);
  process.exit(1);
}

console.log(
  `version-check: web ${programVersion}, protocol package ${protocolVersions.package}, wire ${protocolVersions.wire}`,
);
