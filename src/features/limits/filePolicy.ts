import { byteSize, type ByteSize } from "../../domain/scalars";
import type { FileValidation } from "../../domain/state";
import { safeFileName } from "../../domain/validators";

export const recommendedSingleFileLimit = 10 * 1024 * 1024;
export const warningSingleFileLimit = 33 * 1024 * 1024;

export function validateFileForEncoding(file: Pick<File, "name" | "size"> | null): FileValidation {
  if (!file) {
    return { kind: "empty" };
  }
  const size = byteSize(file.size);
  const name = safeFileName(file.name);
  if (size.kind === "err") {
    return {
      kind: "blocked",
      name,
      size: 0 as ByteSize,
      message: size.reason,
      recovery: "Choose a normal local file.",
    };
  }
  if (file.size === 0) {
    return {
      kind: "blocked",
      name,
      size: size.value,
      message: "Empty files cannot produce a useful Cimbar stream.",
      recovery: "Choose a file with content.",
    };
  }
  if (file.size > warningSingleFileLimit) {
    return {
      kind: "blocked",
      name,
      size: size.value,
      message: "This file is beyond the direct browser transfer limit.",
      recovery: "Use a chunked workflow or reduce the file below 33 MiB.",
    };
  }
  if (file.size > recommendedSingleFileLimit) {
    return {
      kind: "warning",
      name,
      size: size.value,
      message: "This file can be attempted, but transfer time and redundancy headroom may be poor.",
      recovery: "Prefer files below 10 MiB for direct browser transfer.",
    };
  }
  return {
    kind: "valid",
    name,
    size: size.value,
    message: "Good size for a direct Cimbar browser transfer.",
  };
}
