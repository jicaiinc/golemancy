import type { CapabilityTestResult, ProviderConfig } from '@golemancy/shared';

export interface CapabilityTester {
  test(provider: ProviderConfig): Promise<CapabilityTestResult>;
}

export class NoopCapabilityTester implements CapabilityTester {
  async test(provider: ProviderConfig): Promise<CapabilityTestResult> {
    return {
      providerId: provider.id,
      testedAt: new Date().toISOString(),
      capabilities: provider.capabilities,
    };
  }
}
