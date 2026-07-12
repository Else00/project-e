export type ProtocolVersion = Readonly<{
  major: number;
  minor: number;
}>;

export const protocolVersion = {
  major: 1,
  minor: 0,
} as const satisfies ProtocolVersion;

export const protocolPackageVersion = "0.2.0" as const;
