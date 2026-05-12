export type SkillManifest = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly instructions?: string;
  readonly tools?: ReadonlyArray<{ name: string; jsonSchema: unknown }>;
  readonly templates?: ReadonlyArray<{ name: string; body: string }>;
  readonly scripts?: ReadonlyArray<{ name: string; entry: string }>;
};

export interface SkillsRegistry {
  install(manifestPath: string): Promise<SkillManifest>;
  enable(skillId: string): Promise<void>;
  disable(skillId: string): Promise<void>;
  list(): Promise<ReadonlyArray<SkillManifest>>;
}
