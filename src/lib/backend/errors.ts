/** RLS hides rows it refuses to change, so an empty result means "not allowed" rather than success. */
export function permissionDenied(): { code: string; message: string } {
  return { code: "42501", message: "row-level security: no rows changed" };
}
