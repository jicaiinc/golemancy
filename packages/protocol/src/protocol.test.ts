import { describe, expect, it } from 'vitest';
import {
  API_PATHS,
  AllowedSecretAccountSchema,
  CreateProjectRequestSchema,
  CreateRunRequestSchema,
  NativeHostRuntimeSchema,
} from './index.js';

describe('protocol contracts', () => {
  it('encodes dynamic API path segments', () => {
    expect(API_PATHS.runEvents('run/with space')).toBe('/runs/run%2Fwith%20space/events');
    expect(API_PATHS.secretStatus('openai.apiKey')).toBe('/settings/secrets/openai.apiKey/status');
  });

  it('requires run input as either prompt or messages', () => {
    expect(CreateRunRequestSchema.safeParse({ prompt: 'hello' }).success).toBe(true);
    expect(
      CreateRunRequestSchema.safeParse({ messages: [{ role: 'user', content: 'hello' }] }).success,
    ).toBe(true);
    expect(CreateRunRequestSchema.safeParse({}).success).toBe(false);
    expect(CreateRunRequestSchema.safeParse({ messages: [] }).success).toBe(false);
  });

  it('validates project names and secret account allowlist', () => {
    expect(CreateProjectRequestSchema.safeParse({ name: 'Agent work' }).success).toBe(true);
    expect(CreateProjectRequestSchema.safeParse({ name: '' }).success).toBe(false);
    expect(AllowedSecretAccountSchema.safeParse('openai.apiKey').success).toBe(true);
    expect(AllowedSecretAccountSchema.safeParse('arbitrary.secret').success).toBe(false);
  });

  it('keeps native-host runtime handshake strict enough for extension bootstrap', () => {
    expect(
      NativeHostRuntimeSchema.safeParse({
        url: 'http://127.0.0.1:18901',
        token: '0123456789abcdef',
        pid: 123,
        version: '0.2.0-rebuild.0',
        writtenAt: new Date().toISOString(),
      }).success,
    ).toBe(true);

    expect(
      NativeHostRuntimeSchema.safeParse({
        url: 'not-a-url',
        token: 'short',
        pid: -1,
        version: '0.2.0-rebuild.0',
        writtenAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});
