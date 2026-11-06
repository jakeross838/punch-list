import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { companyNameProblem, STARTING_TRADES, tidyCompanyName, yourNameProblem } from '../src/index';

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');

describe('your own company', () => {
  it('keeps a name tidy and says what is wrong with one', () => {
    expect(tidyCompanyName('  Gulf   Coast Homes ')).toBe('Gulf Coast Homes');
    expect(companyNameProblem('   ')).toBe('Enter the company name');
    expect(companyNameProblem('x'.repeat(81))).toBe('Keep it to 80 characters or fewer');
    expect(companyNameProblem('Gulf Coast Homes')).toBeNull();
    expect(yourNameProblem('')).toBe('Enter your name');
    expect(yourNameProblem('Pat Lee')).toBeNull();
  });

  it('starts with the same trades the database gives a new company', () => {
    const file = readdirSync(MIGRATIONS).find((f) => f.endsWith('_many_companies.sql'));
    expect(file).toBeDefined();
    const migration = readFileSync(join(MIGRATIONS, file!), 'utf8');
    const list = migration.slice(migration.indexOf('from unnest(array['), migration.indexOf(']) with ordinality'));
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...STARTING_TRADES]);
  });
});
