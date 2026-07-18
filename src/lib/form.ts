/** Trimmed form value, with empty strings normalised to null. */
export function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
