/**
 * bracketOfficialSources.ts
 * Load official Bracket 3 policy reference and source URLs for maintenance scripts.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BracketOfficialSource {
  id: string;
  label: string;
  url: string;
  role: string;
  fetchMethod: 'https' | 'playwright';
  validationMode?: 'hard' | 'soft';
  expectedPhrases: string[];
  blockedIndicators?: string[];
  notes?: string;
}

export interface BracketOfficialSourcesFile {
  version: string;
  maintenance: {
    recommendedCadenceDays: number;
    command: string;
    notes: string;
  };
  sources: BracketOfficialSource[];
  lastCheckedAt: string | null;
  lastCheckResults: Array<{
    sourceId: string;
    ok: boolean;
    missingPhrases?: string[];
    error?: string;
    checkedAt: string;
  }>;
}

export interface Bracket3FastManaPolicy {
  prohibitedInBracket3: boolean;
  summary: string;
  solRing: { isGameChanger: boolean; note: string };
  countsAsGameChanger: { note: string; examples: string[]; listFile: string };
  notOnGameChangersList: { note: string; examples: string[] };
  agentGuidance: string;
}

export interface Bracket3PolicyReference {
  id: string;
  version: string;
  bracketId: string;
  label: string;
  officialSummary: string;
  hardLimits: {
    maxGameChangers: number;
    maxExtraTurnCards: number;
    allowMassLandDestruction: boolean;
    allowInfiniteTwoCardCombosBeforeTurnSix: boolean;
  };
  fastMana: Bracket3FastManaPolicy;
  projectBanlistSeparate: { file: string; note: string };
  intentOverChecklist: string;
  sourcesFile: string;
  docsFile: string;
}

function dataPath(relative: string): string {
  return path.join(__dirname, '..', '..', 'data', relative);
}

function readJson<T>(relative: string): T {
  const raw = fs.readFileSync(dataPath(relative), 'utf8');
  return JSON.parse(raw) as T;
}

/** Official source registry (Moxfield + Wizards URLs). */
export function loadBracketOfficialSources(): BracketOfficialSourcesFile {
  return readJson<BracketOfficialSourcesFile>('bracket-official-sources.json');
}

/** Human + agent policy reference including fast-mana rules. */
export function loadBracket3PolicyReference(): Bracket3PolicyReference {
  return readJson<Bracket3PolicyReference>('bracket3-policy-reference.json');
}

/** Persist check results and lastCheckedAt (maintenance script). */
export function saveBracketOfficialSources(data: BracketOfficialSourcesFile): void {
  fs.writeFileSync(dataPath('bracket-official-sources.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** Moxfield brackets page — primary UI reference for agents. */
export function getMoxfieldBracketsUrl(): string {
  return 'https://moxfield.com/commanderbrackets';
}
