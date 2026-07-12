import { describe, expect, it, vi } from "vitest";
import { defaultTextFileName, textDraftToFile } from "./textInput";

async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

describe("text input draft", () => {
  it("rejects empty text", () => {
    expect(textDraftToFile({ text: " \n\t ", fileName: defaultTextFileName })).toEqual({
      kind: "err",
      message: "Text input is empty.",
      recovery: "Type or paste text before using it as an encode source.",
    });
  });

  it("creates a UTF-8 text file with a safe default name", async () => {
    vi.spyOn(Date, "now").mockReturnValue(42);
    const result = textDraftToFile({ text: "ciao", fileName: " \t " });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      throw new Error("Expected text file.");
    }
    expect(result.file.name).toBe(defaultTextFileName);
    expect(result.file.type).toBe("text/plain; charset=utf-8");
    expect(result.file.lastModified).toBe(42);
    await expect(readFileText(result.file)).resolves.toBe("ciao");
  });

  it("sanitizes custom names and appends txt when no extension exists", () => {
    const result = textDraftToFile({ text: "payload", fileName: "folder/name" });
    expect(result).toMatchObject({
      kind: "ok",
      file: expect.objectContaining({ name: "folder_name.txt" }),
    });
  });
});
