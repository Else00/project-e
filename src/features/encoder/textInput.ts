import { safeFileName } from "../../domain/validators";

export const defaultTextFileName = "clipboard-text.txt";

export type TextInputDraft = Readonly<{
  text: string;
  fileName: string;
}>;

export type TextInputResult =
  | Readonly<{ kind: "ok"; file: File }>
  | Readonly<{ kind: "err"; message: string; recovery: string }>;

export function textDraftToFile(draft: TextInputDraft): TextInputResult {
  if (draft.text.trim().length === 0) {
    return {
      kind: "err",
      message: "Text input is empty.",
      recovery: "Type or paste text before using it as an encode source.",
    };
  }
  const fileName = safeFileName(
    draft.fileName.trim().length > 0 ? draft.fileName : defaultTextFileName,
  );
  const finalName = fileName.includes(".") ? fileName : `${fileName}.txt`;
  return {
    kind: "ok",
    file: new File([draft.text], finalName, {
      type: "text/plain; charset=utf-8",
      lastModified: Date.now(),
    }),
  };
}
