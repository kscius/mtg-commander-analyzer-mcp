/** Row shape produced by `scripts/benchmarkDecks.ts` for CI quality gates. */
export interface BenchmarkRow {
  commander: string;
  preferredStrategy?: string;
  buildMs: number;
  mainboardCards: number;
  synergyScore: number | null;
  buildQuality: string;
  converged: boolean;
  readyToShip: boolean;
  categoriesBelow: number;
  lintHardIssues: number;
  banlistValid: boolean;
  error?: string;
}

/** Hard invariants for CI gate — template-only builds may still miss readyToShip. */
export function benchmarkHasHardFailures(rows: BenchmarkRow[]): boolean {
  return rows.some(
    (row) =>
      row.error != null ||
      row.mainboardCards !== 99 ||
      !row.banlistValid ||
      row.lintHardIssues > 0
  );
}

export function formatBenchmarkHardFailures(rows: BenchmarkRow[]): string[] {
  const messages: string[] = [];
  for (const row of rows) {
    const label = row.preferredStrategy
      ? `${row.commander} [${row.preferredStrategy}]`
      : row.commander;
    if (row.error) {
      messages.push(`${label}: build error — ${row.error}`);
    } else if (row.mainboardCards !== 99) {
      messages.push(`${label}: expected 99 mainboard cards, got ${row.mainboardCards}`);
    } else if (!row.banlistValid) {
      messages.push(`${label}: banlist validation failed`);
    } else if (row.lintHardIssues > 0) {
      messages.push(`${label}: ${row.lintHardIssues} hard lint issue(s)`);
    }
  }
  return messages;
}
