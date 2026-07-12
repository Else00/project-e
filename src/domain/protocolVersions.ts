import { protocolPackageVersion, protocolVersion } from "project-e-protocol";

export const programVersion = "0.2.1";

export const protocolVersions = {
  package: protocolPackageVersion,
  wire: `${protocolVersion.major}.${protocolVersion.minor}`,
  direct: true,
  bigfile: true,
  integrity: "BLAKE3-256",
  cimbarRuntime: "libcimbar-v0.6.5",
} as const;

export type ProtocolVersions = typeof protocolVersions;
