import type { ValidationError, ValidationResult } from "../errors.ts";

export const success = <Value>(value: Value): ValidationResult<Value> => ({ ok: true, value });

export const failure = <Value>(error: ValidationError): ValidationResult<Value> => ({
  ok: false,
  error,
});
