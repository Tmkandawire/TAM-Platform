/**
 * @file dto/shared/requireAtLeastOneField.js
 * @description Shared Zod refinement helper for non-empty PATCH payloads.
 *
 * Prevents silent no-op mutations — any PATCH endpoint where all fields are
 * optional must still require at least one field to be present in the body.
 *
 * Usage:
 *   import { requireAtLeastOneField } from "./shared/requireAtLeastOneField.js";
 *
 *   const myPatchSchema = z.object({ ... }).refine(
 *     ...requireAtLeastOneField("fieldA", "fieldB")
 *   );
 *
 * Or with a custom message:
 *   .refine(...requireAtLeastOneField("fieldA", "fieldB", {
 *     message: "Provide at least one preference to update"
 *   }))
 *
 * Current consumers:
 *   - updateAccountDetailsSchema  (dto/settingsDto.js)
 *   - updateNotificationPrefsSchema (dto/settingsDto.js)
 *
 * Also suitable for any future PATCH DTO where all body fields are optional.
 */

/**
 * Returns the [predicate, options] tuple expected by Zod's .refine().
 *
 * @param {...string} fields
 *   The field names to check. At least one must be non-undefined in the data.
 *   If no fields are passed, falls back to checking Object.keys(data).length > 0
 *   (i.e. any key present).
 *
 * @param {{ message?: string }} [options]
 *   Optional last argument — if the last element of `fields` is a plain
 *   object it is treated as options, not a field name.
 *
 * @returns {[predicate: (data: object) => boolean, options: { message: string }]}
 *
 * @example
 *   // Explicit field list
 *   z.object({ a: z.string().optional(), b: z.string().optional() })
 *     .refine(...requireAtLeastOneField("a", "b"))
 *
 *   // Any key present (no field list)
 *   z.object({}).passthrough()
 *     .refine(...requireAtLeastOneField())
 */
export function requireAtLeastOneField(...args) {
  // Separate trailing options object from field name strings.
  const lastArg = args[args.length - 1];
  const hasOpts =
    lastArg !== null && typeof lastArg === "object" && !Array.isArray(lastArg);
  const options = hasOpts
    ? /** @type {{ message?: string }} */ (args.pop())
    : {};
  const fields = /** @type {string[]} */ (args);

  const message = options.message ?? "At least one field must be provided";

  const predicate = (data) =>
    fields.length > 0
      ? fields.some((f) => data[f] !== undefined)
      : Object.keys(data).length > 0;

  return [predicate, { message }];
}
