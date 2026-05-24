/**
 * Golden deck regression — expected analyze outcomes for CI and agent regression.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { DeckAnalysis, CategoryStatus } from './types';
import { COMMANDER_MAINBOARD_SIZE } from './commanderFormat';

export interface GoldenCategorySnapshot {
  name: string;
  count: number;
  status: CategoryStatus;
  min?: number;
  max?: number;
}

export interface GoldenAnalyzeAssertions {
  mainboardCount: number;
  banlistValid: boolean;
  maxCategoriesBelow: number;
  maxLintHardIssues: number;
  maxBracketWarnings: number;
  minSynergyScore: number;
  qualityGateReady: boolean;
}

export interface GoldenAnalyzeExpected {
  schemaVersion: number;
  caseId: string;
  description: string;
  commanderName: string;
  preferredStrategy: string;
  fixture: string;
  assertions: GoldenAnalyzeAssertions;
  categorySnapshots: GoldenCategorySnapshot[];
}

export interface GoldenAssertFailure {
  field: string;
  expected: string;
  actual: string;
}

const GOLDEN_DIR = join(process.cwd(), 'data', 'golden');

export function loadGoldenAnalyzeExpected(
  fileName = 'shadrix-group-slug-analyze.expected.json'
): GoldenAnalyzeExpected {
  const path = join(GOLDEN_DIR, fileName);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as GoldenAnalyzeExpected;
}

function isQualityGateReady(analysis: DeckAnalysis, synergyTarget = 60): boolean {
  if (!analysis.banlistValid) return false;
  if (analysis.totalCards !== COMMANDER_MAINBOARD_SIZE) return false;
  if (analysis.categories.some((c) => c.status === 'below')) return false;
  const hard = analysis.lintReport?.issues.filter((i) => i.severity === 'hard') ?? [];
  if (hard.length > 0) return false;
  if (analysis.bracketWarnings.length > 0) return false;
  if (analysis.synergyScore != null && analysis.synergyScore < synergyTarget) return false;
  return true;
}

/** Compare analyze output to committed golden expectations. */
export function assertAnalyzeMatchesGolden(
  analysis: DeckAnalysis,
  expected: GoldenAnalyzeExpected,
  synergyTarget = 60
): GoldenAssertFailure[] {
  const failures: GoldenAssertFailure[] = [];
  const a = expected.assertions;

  if (analysis.totalCards !== a.mainboardCount) {
    failures.push({
      field: 'mainboardCount',
      expected: String(a.mainboardCount),
      actual: String(analysis.totalCards),
    });
  }
  if (analysis.banlistValid !== a.banlistValid) {
    failures.push({
      field: 'banlistValid',
      expected: String(a.banlistValid),
      actual: String(analysis.banlistValid),
    });
  }

  const below = analysis.categories.filter((c) => c.status === 'below').length;
  if (below > a.maxCategoriesBelow) {
    failures.push({
      field: 'maxCategoriesBelow',
      expected: `≤ ${a.maxCategoriesBelow}`,
      actual: String(below),
    });
  }

  const hardLint =
    analysis.lintReport?.issues.filter((i) => i.severity === 'hard').length ?? 0;
  if (hardLint > a.maxLintHardIssues) {
    failures.push({
      field: 'maxLintHardIssues',
      expected: `≤ ${a.maxLintHardIssues}`,
      actual: String(hardLint),
    });
  }

  if (analysis.bracketWarnings.length > a.maxBracketWarnings) {
    failures.push({
      field: 'maxBracketWarnings',
      expected: `≤ ${a.maxBracketWarnings}`,
      actual: String(analysis.bracketWarnings.length),
    });
  }

  if (analysis.synergyScore != null && analysis.synergyScore < a.minSynergyScore) {
    failures.push({
      field: 'minSynergyScore',
      expected: `≥ ${a.minSynergyScore}`,
      actual: String(analysis.synergyScore),
    });
  }

  const ready = isQualityGateReady(analysis, synergyTarget);
  if (a.qualityGateReady && !ready) {
    failures.push({
      field: 'qualityGateReady',
      expected: 'true',
      actual: 'false',
    });
  }

  for (const snap of expected.categorySnapshots) {
    if (snap.status === 'unknown') continue;
    const live = analysis.categories.find((c) => c.name === snap.name);
    if (!live) {
      failures.push({
        field: `category:${snap.name}`,
        expected: 'present',
        actual: 'missing',
      });
      continue;
    }
    if (live.status !== snap.status) {
      failures.push({
        field: `category:${snap.name}.status`,
        expected: snap.status,
        actual: live.status,
      });
    }
    if (live.count !== snap.count) {
      failures.push({
        field: `category:${snap.name}.count`,
        expected: String(snap.count),
        actual: String(live.count),
      });
    }
  }

  return failures;
}
