export const MASTER_DATA_SEEDER = Symbol('IMasterDataSeeder');

/**
 * Seeds the configured master rows at startup. Other startup steps that read those rows wait on the same
 * run through ensureSeeded, so their order does not depend on how Nest orders the lifecycle hooks.
 */
export interface IMasterDataSeeder {
  /** Resolves once the seed has finished. Repeated calls share one run and never seed twice. */
  ensureSeeded(): Promise<void>;
}
