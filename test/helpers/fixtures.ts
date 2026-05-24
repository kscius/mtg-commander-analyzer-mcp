import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = join(process.cwd(), 'test', 'fixtures');

export function loadFixtureText(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

/** Mainboard lines only (strips Commander: header). */
export function loadMainboardFixture(name: string): string {
  const text = loadFixtureText(name);
  return text
    .split(/\r?\n/)
    .filter((line) => !/^commander:/i.test(line.trim()))
    .join('\n')
    .trim();
}
