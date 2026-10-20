import type { PrFile, RiskCategory, Severity } from '@pr-lens/shared';
import type { DiffLine } from './patch';
import { basename, hasAnyWord, isTestPath } from './paths';

// A file-level rule: matches on the path (and status), flags the file's first changed line.
export type PathRule = {
  id: string;
  category: RiskCategory;
  severity: Severity;
  matches: (file: PrFile) => boolean;
  explanation: string;
};

// A line-level rule: flags each run of consecutive matching added (or removed) lines.
export type LineRule = {
  id: string;
  category: RiskCategory;
  severity: Severity;
  kind: 'add' | 'del';
  appliesTo: (file: PrFile) => boolean;
  matches: (line: DiffLine) => boolean;
  explanation: string;
};

const everyFile = () => true;

const AUTH_WORDS = new Set([
  'auth', 'authn', 'authz', 'authentication', 'authorization', 'authorize', 'oauth', 'oidc', 'sso', 'saml',
  'session', 'sessions', 'permission', 'permissions', 'rbac', 'acl', 'jwt', 'login', 'logout', 'signin',
  'password', 'passwords', 'credential', 'credentials', 'csrf',
]);

const PAYMENT_WORDS = new Set([
  'payment', 'payments', 'billing', 'invoice', 'invoices', 'stripe', 'paypal', 'braintree', 'checkout',
  'subscription', 'subscriptions', 'refund', 'refunds',
]);

const DEPENDENCY_FILES = new Set([
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'go.mod', 'Cargo.toml',
  'Gemfile', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json', 'mix.exs', 'Podfile',
]);

const MIGRATION_DIR_WORDS = new Set(['migrate', 'migration', 'migrations', 'alembic', 'flyway', 'liquibase']);

// Any folder named like a migration folder: migrations/, db/migrate/, db/post_migrate/, alembic/...
function isMigration(path: string): boolean {
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  return hasAnyWord(dir, MIGRATION_DIR_WORDS) || /\.sql$/i.test(path);
}

function isSchemaFile(path: string): boolean {
  return /(^|\/)(schema\.(prisma|rb|sql|graphql)|structure\.sql)$/i.test(path);
}

function isEnvFile(name: string): boolean {
  return /^\.env(\..+)?$/.test(name) && !/\.(example|sample|template)$/.test(name);
}

function isInfraConfig(path: string): boolean {
  const name = basename(path);
  return (
    /^Dockerfile/.test(name) ||
    /^(docker-)?compose(\..+)?\.ya?ml$/.test(name) ||
    /^\.github\/workflows\//.test(path) ||
    name === '.gitlab-ci.yml' ||
    name === 'Jenkinsfile' ||
    /(^|\/)\.circleci\//.test(path) ||
    /\.tf$/.test(name) ||
    ['wrangler.toml', 'wrangler.jsonc', 'vercel.json', 'netlify.toml', 'fly.toml', 'Procfile'].includes(name)
  );
}

export const PATH_RULES: PathRule[] = [
  {
    id: 'migration',
    category: 'schema',
    severity: 'high',
    matches: (f) => isMigration(f.path),
    explanation: 'Database migration. Check it can be rolled back and is safe to run on a live table.',
  },
  {
    id: 'schema-file',
    category: 'schema',
    severity: 'medium',
    matches: (f) => isSchemaFile(f.path),
    explanation: 'Schema definition changed. Make sure a matching migration is included.',
  },
  {
    id: 'env-file',
    category: 'secrets',
    severity: 'high',
    matches: (f) => isEnvFile(basename(f.path)) && f.status !== 'removed',
    explanation: 'Environment file committed. These often hold real secrets and usually belong in .gitignore.',
  },
  {
    id: 'auth-path',
    category: 'auth',
    severity: 'medium',
    matches: (f) => hasAnyWord(f.path, AUTH_WORDS),
    explanation: 'Touches authentication, sessions or permissions. Mistakes here can let the wrong people in.',
  },
  {
    id: 'payments-path',
    category: 'payments',
    severity: 'high',
    matches: (f) => hasAnyWord(f.path, PAYMENT_WORDS),
    explanation: 'Touches payments or billing. Check amounts, currencies, retries and idempotency.',
  },
  {
    id: 'infra-config',
    category: 'config',
    severity: 'medium',
    matches: (f) => isInfraConfig(f.path),
    explanation: 'CI, container or deployment config. Changes here affect every build or deploy.',
  },
  {
    id: 'dependency-manifest',
    category: 'dependencies',
    severity: 'medium',
    matches: (f) => DEPENDENCY_FILES.has(basename(f.path)) || /^requirements.*\.txt$/.test(basename(f.path)),
    explanation: 'Dependencies changed. Check new packages are trusted and version bumps are intended.',
  },
  {
    id: 'test-file-deleted',
    category: 'tests',
    severity: 'high',
    matches: (f) => f.status === 'removed' && isTestPath(f.path),
    explanation: 'Test file deleted. Make sure the behavior it covered is still tested somewhere.',
  },
];

// Raw SQL, then ORM/framework helpers (Rails, Django, Laravel, Knex/TypeORM, Discourse's droppers).
const DESTRUCTIVE_SQL = new RegExp(
  [
    /\b(DROP\s+(TABLE|COLUMN|INDEX|DATABASE|SCHEMA)|TRUNCATE(\s+TABLE)?|ALTER\s+TABLE\s+\S+\s+DROP)\b/.source,
    /\b(remove_(column|columns|reference|belongs_to|timestamps)|drop_(table|join_table))\b/.source,
    /\b(RemoveField|DeleteModel)\b/.source,
    /\b(dropColumns?|dropTable|dropIfExists|dropTableIfExists)\b/.source,
    /\b(ColumnDropper|TableDropper)\b/.source,
  ].join('|'),
  'i',
);

// Well-known key formats, plus generic `secret = "..."` assignments.
const SECRET_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key ID
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, // GitHub token
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/, // GitHub fine-grained token
  /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, // Slack token
  /\b[sr]k_live_[A-Za-z0-9]{16,}\b/, // Stripe live key
  /\bAIza[0-9A-Za-z_-]{35}\b/, // Google API key
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, // Anthropic API key
  /\b(api[_-]?key|secret|password|passwd|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i,
];

const TEST_SKIP = /\b(it|test|describe)\.skip\s*\(|\bx(it|describe|test)\s*\(|@pytest\.mark\.skip|@unittest\.skip|\bt\.Skip(Now|f)?\(|@Disabled\b|@Ignore\b/;

const TEST_DECLARATION = /^\s*(it|test)\s*\(|^\s*def test_|^\s*func Test[A-Z_]|@Test\b/;

export const LINE_RULES: LineRule[] = [
  {
    id: 'irreversible-migration',
    category: 'schema',
    severity: 'high',
    kind: 'add',
    appliesTo: everyFile,
    matches: (l) => /\bIrreversibleMigration\b/.test(l.text),
    explanation: "Migration can't be rolled back. If the deploy goes wrong there's no automatic way back.",
  },
  {
    id: 'destructive-sql',
    category: 'schema',
    severity: 'high',
    kind: 'add',
    appliesTo: everyFile,
    matches: (l) => DESTRUCTIVE_SQL.test(l.text),
    explanation: 'Drops or truncates data. This is usually irreversible once deployed.',
  },
  {
    id: 'possible-secret',
    category: 'secrets',
    severity: 'high',
    kind: 'add',
    appliesTo: (f) => !isTestPath(f.path),
    matches: (l) => SECRET_PATTERNS.some((p) => p.test(l.text)),
    explanation: 'Looks like a hard-coded secret or key. If it is real, it needs rotating, not just removing.',
  },
  {
    id: 'test-skipped',
    category: 'tests',
    severity: 'medium',
    kind: 'add',
    appliesTo: (f) => isTestPath(f.path),
    matches: (l) => TEST_SKIP.test(l.text),
    explanation: 'Test disabled. Check why, and whether it should come back before merging.',
  },
  {
    id: 'test-removed',
    category: 'tests',
    severity: 'medium',
    kind: 'del',
    appliesTo: (f) => isTestPath(f.path) && f.status !== 'removed',
    matches: (l) => TEST_DECLARATION.test(l.text),
    explanation: 'Test case removed. Make sure it was moved or replaced, not just dropped.',
  },
];

// Counts test declarations a file adds, so test-removed doesn't fire on tests that were only moved or renamed.
export function addedTestDeclarations(lines: DiffLine[]): number {
  return lines.filter((l) => l.kind === 'add' && TEST_DECLARATION.test(l.text)).length;
}
