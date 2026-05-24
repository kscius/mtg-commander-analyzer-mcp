/**
 * MCP tool: get_strategy_guide — construction guide for a synergy slug.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getStrategyGuidesIndex, getStrategyProfile } from '../core/strategyProfiles';

export interface GetStrategyGuideInput {
  commanderName: string;
  preferredStrategy: string;
  summaryOnly?: boolean;
}

export interface GetStrategyGuideResult {
  commanderName: string;
  preferredStrategy: string;
  summary: string;
  nextSuggestedAction: string;
  guideMarkdown: string;
  keyRatios: Record<string, string>;
  packages: string[];
  antiPatterns: string[];
  guideSource: 'markdown' | 'json-only';
}

interface StrategyGuideMeta {
  summary?: string;
  guidePath?: string;
  keyRatios?: Record<string, string>;
  packages?: string[];
  antiPatterns?: string[];
}

function loadGuideMeta(slug: string): StrategyGuideMeta | null {
  const metaPath = path.join(__dirname, '..', '..', 'data', 'strategy-guides.json');
  try {
    const index = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, StrategyGuideMeta>;
    return index[slug] ?? null;
  } catch {
    return null;
  }
}

function readMarkdownGuide(slug: string): string | null {
  const index = getStrategyGuidesIndex();
  const entry = index[slug];
  const guidesDir = path.join(__dirname, '..', '..', 'docs', 'strategy-guides');
  const fileName = entry?.file ?? `${slug}.md`;
  const full = path.join(guidesDir, fileName);
  try {
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf8');
  } catch {
    // ignore
  }
  return null;
}

export async function runGetStrategyGuide(
  input: GetStrategyGuideInput
): Promise<GetStrategyGuideResult> {
  const slug = input.preferredStrategy.trim().toLowerCase();
  const profile = getStrategyProfile(slug);
  const meta = loadGuideMeta(slug);
  const indexEntry = getStrategyGuidesIndex()[slug];

  const packagesFromProfile =
    profile?.synergyPackages?.map((p) => `${p.name}: ${p.cards.join(', ')}`) ?? [];
  const packages = meta?.packages?.length ? meta.packages : packagesFromProfile;
  const antiPatterns = meta?.antiPatterns ?? profile?.antisynergyPatterns ?? [];

  let guideMarkdown = readMarkdownGuide(slug);
  let guideSource: 'markdown' | 'json-only' = 'markdown';
  const title = indexEntry?.title ?? profile?.displayName ?? slug;

  if (!guideMarkdown) {
    guideSource = 'json-only';
    guideMarkdown = [
      `# ${title}`,
      '',
      meta?.summary ?? `Construction guide for ${slug}.`,
      '',
      '## Key ratios',
      ...Object.entries(meta?.keyRatios ?? {}).map(([k, v]) => `- **${k}**: ${v}`),
      '',
      '## Packages',
      ...packages.map((p) => `- ${p}`),
      '',
      '## Anti-patterns',
      ...antiPatterns.map((p) => `- ${p}`),
    ].join('\n');
  }

  if (!input.summaryOnly) {
    guideMarkdown += `\n\n---\n*Commander: ${input.commanderName}*\n`;
  }

  const summary =
    meta?.summary ??
    `${title}: ${profile?.keyPatterns?.slice(0, 2).join('; ') ?? 'see guide markdown'}`;

  return {
    commanderName: input.commanderName,
    preferredStrategy: slug,
    summary,
    nextSuggestedAction: `build_deck_from_commander with commanderName="${input.commanderName}" and preferredStrategy="${slug}"`,
    guideMarkdown: input.summaryOnly ? '' : guideMarkdown,
    keyRatios: meta?.keyRatios ?? {},
    packages,
    antiPatterns,
    guideSource,
  };
}
