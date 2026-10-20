import { describe, expect, it } from 'vitest';
import { analyzeRisk } from '../../src/risk/engine';
import { file, patch } from './helpers';

const ruleIds = (files: Parameters<typeof analyzeRisk>[0]) => analyzeRisk(files).flags.map((f) => f.ruleId);

describe('path rules', () => {
  it('flags migrations and points at the first added line', () => {
    const { flags } = analyzeRisk([file('db/migrations/0042_add_users.py', patch(0, 1, ['+from django.db import migrations']))]);
    expect(flags).toMatchObject([
      { ruleId: 'migration', category: 'schema', severity: 'high', lines: { side: 'RIGHT', start: 1, end: 1 } },
    ]);
  });

  it('flags auth, payments, infra config and dependency manifests', () => {
    expect(ruleIds([file('src/auth/session.ts')])).toEqual(['auth-path']);
    expect(ruleIds([file('app/services/BillingService.rb')])).toEqual(['payments-path']);
    expect(ruleIds([file('.github/workflows/ci.yml')])).toEqual(['infra-config']);
    expect(ruleIds([file('Dockerfile.prod')])).toEqual(['infra-config']);
    expect(ruleIds([file('web/package.json')])).toEqual(['dependency-manifest']);
    expect(ruleIds([file('requirements-dev.txt')])).toEqual(['dependency-manifest']);
  });

  it('matches auth words as whole words, including camelCase parts', () => {
    expect(ruleIds([file('src/components/LoginForm.tsx')])).toEqual(['auth-path']);
    expect(ruleIds([file('src/author/profile.ts')])).toEqual([]);
    expect(ruleIds([file('src/authentic-reviews.ts')])).toEqual([]);
  });

  it('flags committed .env files but not examples', () => {
    expect(ruleIds([file('.env.production')])).toEqual(['env-file']);
    expect(ruleIds([file('.env.example')])).toEqual([]);
  });

  it('flags a deleted test file, pointing at its first removed line', () => {
    const { flags } = analyzeRisk([
      file('src/cart.test.ts', patch(1, 0, ['-import { cart } from "./cart";']), { status: 'removed' }),
    ]);
    expect(flags).toMatchObject([{ ruleId: 'test-file-deleted', lines: { side: 'LEFT', start: 1 } }]);
  });

  it('flags the file with no line when GitHub sent no patch', () => {
    const { flags } = analyzeRisk([file('db/migrations/big.sql', null)]);
    expect(flags).toMatchObject([{ ruleId: 'migration', lines: null }]);
  });
});

describe('line rules', () => {
  it('flags destructive SQL on the exact line', () => {
    const { flags } = analyzeRisk([
      file('src/repo.ts', patch(5, 5, [' const q = [', '+  "ALTER TABLE users DROP COLUMN email",', ' ];'])),
    ]);
    expect(flags).toMatchObject([{ ruleId: 'destructive-sql', lines: { side: 'RIGHT', start: 6, end: 6 } }]);
  });

  it('flags well-known key formats and generic secret assignments', () => {
    const lines = ['+const key = "AKIAIOSFODNN7EXAMPLE";', ' ', '+password: "hunter2-but-longer"', ' ', '+name = "fine"'];
    const { flags } = analyzeRisk([file('src/config.ts', patch(1, 1, lines))]);
    expect(flags.map((f) => [f.ruleId, f.lines?.start])).toEqual([
      ['possible-secret', 1],
      ['possible-secret', 3],
    ]);
  });

  it('groups a multi-line private key into one flag', () => {
    const lines = ['+-----BEGIN RSA PRIVATE KEY-----', '+MIIEowIBAAKCAQEA', '+-----END RSA PRIVATE KEY-----'];
    const { flags } = analyzeRisk([file('deploy/key.txt', patch(0, 1, lines))]);
    // Only the BEGIN line matches a pattern, so the run is that one line.
    expect(flags).toMatchObject([{ ruleId: 'possible-secret', lines: { start: 1, end: 1 } }]);
  });

  it('merges consecutive matching lines into one range', () => {
    const lines = ['+DROP TABLE a;', '+DROP TABLE b;', ' -- keep', '+DROP TABLE c;'];
    const { flags } = analyzeRisk([file('scripts/cleanup.ts', patch(1, 1, lines))]);
    expect(flags.map((f) => f.lines)).toEqual([
      { side: 'RIGHT', start: 1, end: 2 },
      { side: 'RIGHT', start: 4, end: 4 },
    ]);
  });

  it('caps flags per rule per file and says how many were left out', () => {
    const lines = Array.from({ length: 5 }, (_, i) => [`+DROP TABLE t${i};`, ' ']).flat();
    const { flags } = analyzeRisk([file('scripts/cleanup.ts', patch(1, 1, lines))]);
    expect(flags).toHaveLength(3);
    expect(flags[2]?.explanation).toContain('(2 more in this file.)');
  });

  it('ignores secret-looking strings in tests', () => {
    expect(ruleIds([file('src/cart.test.ts', patch(1, 1, ['+const token = "ghp_' + 'a'.repeat(36) + '";']))])).toEqual([]);
  });

  it('flags skipped tests', () => {
    expect(ruleIds([file('src/cart.test.ts', patch(1, 1, ['+it.skip("adds items", () => {'])) ])).toEqual(['test-skipped']);
    expect(ruleIds([file('tests/test_cart.py', patch(1, 1, ['+@pytest.mark.skip(reason="flaky")']))])).toEqual(['test-skipped']);
  });

  it('flags removed test cases, but not tests that were only moved', () => {
    const removed = patch(10, 10, ['-it("rejects empty carts", () => {', '-  expect(checkout([])).toThrow();', '-});']);
    expect(ruleIds([file('src/cart.test.ts', removed)])).toEqual(['test-removed']);

    const moved = patch(10, 10, ['-it("rejects empty carts", () => {', '+it("rejects an empty cart", () => {']);
    expect(ruleIds([file('src/cart.test.ts', moved)])).toEqual([]);
  });
});

describe('analyzeRisk', () => {
  it('skips lockfiles and generated files entirely, and says why', () => {
    const report = analyzeRisk([file('package-lock.json', patch(1, 1, ['+  "integrity": "sha512-' + 'a'.repeat(80) + '"']))]);
    expect(report.flags).toEqual([]);
    expect(report.files).toEqual([{ path: 'package-lock.json', categories: [], skipReason: 'lockfile' }]);
  });

  it('lists each file with the categories it was flagged for', () => {
    const report = analyzeRisk([file('src/auth/login.ts'), file('README.md')]);
    expect(report.files).toEqual([
      { path: 'src/auth/login.ts', categories: ['auth'], skipReason: null },
      { path: 'README.md', categories: [], skipReason: null },
    ]);
  });

  it('sorts high severity first, then by file order', () => {
    const report = analyzeRisk([file('src/auth/a.ts'), file('db/migrations/1.sql'), file('src/billing/b.ts')]);
    expect(report.flags.map((f) => f.filePath)).toEqual(['db/migrations/1.sql', 'src/billing/b.ts', 'src/auth/a.ts']);
  });

  it('gives every flag a unique id', () => {
    const report = analyzeRisk([file('src/auth/payments/.env', patch(1, 1, ['+DROP TABLE x;', ' ', '+secret = "abcdefghijklmnop"']))]);
    const ids = report.flags.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Regression cases from real PRs that the first version of the rules missed.
describe('real PRs', () => {
  it('discourse/discourse#29187: post-deploy migration that drops columns and cannot be rolled back', () => {
    const migration = [
      '@@ -0,0 +1,12 @@',
      '+# frozen_string_literal: true',
      '+class DropPasswordColumnsFromUsers < ActiveRecord::Migration[7.1]',
      '+  DROPPED_COLUMNS ||= { users: %i[password_hash salt password_algorithm] }',
      '+',
      '+  def up',
      '+    DROPPED_COLUMNS.each { |table, columns| Migration::ColumnDropper.execute_drop(table, columns) }',
      '+  end',
      '+',
      '+  def down',
      '+    raise ActiveRecord::IrreversibleMigration',
      '+  end',
      '+end',
    ].join('\n');
    const { flags } = analyzeRisk([file('db/post_migrate/20241011080517_drop_password_columns_from_users.rb', migration)]);
    expect(flags.map((f) => [f.ruleId, f.lines?.start])).toEqual([
      ['migration', 1],
      ['destructive-sql', 6],
      ['irreversible-migration', 10],
      ['auth-path', 1],
    ]);
  });

  it('catches other frameworks’ column and table drops', () => {
    for (const line of [
      '+    remove_columns :users, :a, :b',
      '+    remove_reference :posts, :user',
      '+        Schema::dropIfExists("users");',
      '+    Migration::TableDropper.execute_drop("old_table")',
    ]) {
      expect(ruleIds([file('src/x.rb', patch(1, 1, [line]))]), line).toEqual(['destructive-sql']);
    }
  });

  it('recognizes migration folders by name', () => {
    for (const path of ['db/post_migrate/1_x.rb', 'src/database/migrations/2024_x.ts', 'alembic/versions/abc.py', 'prisma/migrations/1/migration.sql']) {
      expect(ruleIds([file(path)]), path).toContain('migration');
    }
    expect(ruleIds([file('src/migrator-docs/readme.md')])).toEqual([]);
  });
});
