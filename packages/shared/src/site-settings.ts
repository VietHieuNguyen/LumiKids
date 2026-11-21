import { z } from "zod";

/**
 * 3D scenes the landing page can show. Adding a scene means a new value here plus its entry in the
 * web landing scene registry; the API only stores the chosen key.
 */
export const landingSceneSchema = z.enum(["VALLEY", "ARCTIC"]);

export const siteSettingsSchema = z.object({
  siteName: z.string(),
  tagline: z.string().nullable(),
  /** API path of the uploaded logo (changes when the logo changes), or null for the built-in logo. */
  logoPath: z.string().nullable(),
  landingScene: landingSceneSchema,
  updatedAt: z.iso.datetime().nullable(),
});

export const updateSiteSettingsSchema = z
  .object({
    siteName: z.string().trim().min(1).max(60).optional(),
    tagline: z
      .string()
      .trim()
      .max(160)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    landingScene: landingSceneSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Không có thay đổi nào.");

/** Logo upload limit; PNG, JPEG, WebP only (SVG is refused: it can carry script). */
export const SITE_LOGO_MAX_BYTES = 512 * 1024;

export type LandingScene = z.infer<typeof landingSceneSchema>;
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsSchema>;
