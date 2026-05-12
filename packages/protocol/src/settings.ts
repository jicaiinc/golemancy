import { z } from 'zod';

export const WorkModeSchema = z.enum(['builder', 'everyday']);
export type WorkMode = z.infer<typeof WorkModeSchema>;

export const ThemePreferenceSchema = z.enum(['light', 'dark', 'system']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const PermissionPolicySchema = z.object({
  defaultPermissions: z.boolean(),
  autoReview: z.boolean(),
  fullAccess: z.boolean(),
});

export const AppSettingsSchema = z.object({
  workMode: WorkModeSchema,
  theme: ThemePreferenceSchema,
  permissions: PermissionPolicySchema,
  language: z.string().default('auto'),
  showMenuBar: z.boolean().default(true),
  launchAtLogin: z.boolean().default(false),
  reduceMotion: z.boolean().default(false),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;
