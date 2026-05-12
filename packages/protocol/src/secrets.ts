import { z } from 'zod';

export const SecretStatusResponseSchema = z.object({
  account: z.string(),
  present: z.boolean(),
  // Optional hint shown in the UI — never the full plaintext.
  masked: z.string().nullable().optional(),
});
export type SecretStatusResponse = z.infer<typeof SecretStatusResponseSchema>;

export const SetSecretRequestSchema = z.object({
  value: z.string().min(1, 'value cannot be empty'),
});
export type SetSecretRequest = z.infer<typeof SetSecretRequestSchema>;

export const SetSecretResponseSchema = z.object({
  account: z.string(),
  saved: z.literal(true),
  masked: z.string().nullable().optional(),
});
export type SetSecretResponse = z.infer<typeof SetSecretResponseSchema>;

export const DeleteSecretResponseSchema = z.object({
  account: z.string(),
  deleted: z.boolean(),
});
export type DeleteSecretResponse = z.infer<typeof DeleteSecretResponseSchema>;

// Allowlist of accounts the UI can write through the HTTP surface. Anything
// not in here is rejected at the route level so a compromised renderer can't
// scribble arbitrary key/value pairs into the OS keychain.
export const ALLOWED_SECRET_ACCOUNTS = ['openai.apiKey'] as const;
export type AllowedSecretAccount = (typeof ALLOWED_SECRET_ACCOUNTS)[number];
export const AllowedSecretAccountSchema = z.enum(ALLOWED_SECRET_ACCOUNTS);
