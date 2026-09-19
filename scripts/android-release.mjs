#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = join(root, 'mobile', 'android');
const gradleFile = join(androidRoot, 'app', 'build.gradle');
const manifestFile = join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
const policyFile = join(root, 'mobile', 'release-policy.json');
const outputAab = join(androidRoot, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const args = new Set(process.argv.slice(2));
const buildRequested = args.has('--build');
const checkRequested = args.has('--check') || !buildRequested;
const allowDirty = args.has('--allow-dirty');
const expectedVersionArg = process.argv.find((arg) => arg.startsWith('--expected-version='));
const expectedVersion = expectedVersionArg?.slice('--expected-version='.length).trim() || '';

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  execFileSync(command, commandArgs, {
    cwd: options.cwd || root,
    env: { ...process.env, ...(options.env || {}) },
    stdio: 'inherit',
  });
}

function capture(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: options.cwd || root,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parseProperties(file) {
  if (!existsSync(file)) return {};
  const entries = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const separator = line.search(/[=:]/);
    if (separator < 1) continue;
    entries[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return entries;
}

function parseDotEnv(file) {
  if (!existsSync(file)) return {};
  const entries = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    entries[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  return entries;
}

function listFiles(directory, predicate) {
  const found = [];
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(fullPath, predicate));
    else if (predicate(fullPath)) found.push(fullPath);
  }
  return found;
}

function normalizeFingerprint(value) {
  return String(value || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
}

function readVersionConfig() {
  const source = readFileSync(gradleFile, 'utf8');
  const code = Number(source.match(/def\s+releaseVersionCode\s*=\s*(\d+)/)?.[1]);
  const name = source.match(/def\s+releaseVersionName\s*=\s*["']([^"']+)["']/)?.[1] || '';
  const applicationId = source.match(/applicationId\s+["']([^"']+)["']/)?.[1] || '';
  return { code, name, applicationId, source };
}

function getSigningConfig() {
  const properties = {
    ...parseProperties(join(androidRoot, 'gradle.properties')),
    ...parseProperties(join(homedir(), '.gradle', 'gradle.properties')),
    ...parseDotEnv(join(root, '.env.release.local')),
  };
  const value = (name) => process.env[`ORG_GRADLE_PROJECT_${name}`] || process.env[name] || properties[name] || '';
  return {
    storeFile: value('RELEASE_STORE_FILE'),
    storePassword: value('RELEASE_STORE_PASSWORD'),
    keyAlias: value('RELEASE_KEY_ALIAS'),
    keyPassword: value('RELEASE_KEY_PASSWORD'),
  };
}

function resolveStoreFile(storeFile) {
  return isAbsolute(storeFile) ? storeFile : resolve(androidRoot, storeFile);
}

function validateStaticConfiguration({ requireSigning }) {
  const policy = JSON.parse(readFileSync(policyFile, 'utf8'));
  const version = readVersionConfig();
  const manifest = readFileSync(manifestFile, 'utf8');
  let signing = null;

  if (!Number.isInteger(version.code) || version.code <= 0) fail('versionCode Android non valido.');
  if (!/^\d+\.\d+\.\d+$/.test(version.name)) fail('versionName deve avere il formato numerico x.y.z.');
  if (version.applicationId !== policy.applicationId) fail(`applicationId inatteso: ${version.applicationId || 'mancante'}.`);
  if (expectedVersion && version.name !== expectedVersion) {
    fail(`La versione confermata (${expectedVersion}) non coincide con build.gradle (${version.name}).`);
  }
  const latestPlayVersion = Number(process.env.PLAY_LATEST_VERSION_CODE || policy.lastPublishedVersionCode);
  if (!Number.isInteger(latestPlayVersion) || latestPlayVersion < 0) {
    fail('Il riferimento all’ultima versionCode pubblicata non e valido.');
  } else if (requireSigning && version.code <= latestPlayVersion) {
    fail(`versionCode ${version.code} non e superiore all'ultima versione Play nota (${latestPlayVersion}).`);
  }
  if (!/^[A-Fa-f0-9:]{64,95}$/.test(String(policy.uploadCertificateSha256 || ''))) {
    fail('L’impronta SHA-256 autorizzata non e valida.');
  }
  if (!/minifyEnabled\s+true/.test(version.source) || !/shrinkResources\s+true/.test(version.source)) {
    fail('La build release deve avere minifyEnabled e shrinkResources attivi.');
  }
  if (!/android:allowBackup="false"/.test(manifest)) fail('Il backup Android deve essere disattivato.');
  if (!/android:usesCleartextTraffic="false"/.test(manifest)) fail('Il traffico HTTP non cifrato deve essere disattivato.');

  const tracked = capture('git', ['ls-files']).split(/\r?\n/).filter(Boolean);
  const forbiddenTracked = tracked.filter((path) =>
    /(^|\/)\.env(?!\.example$)/i.test(path)
    || /\.(jks|keystore)$/i.test(path)
    || /(^|\/)(keystore|key)\.properties$/i.test(path)
    || /service.?account.*\.json$/i.test(path)
  );
  if (forbiddenTracked.length) fail(`File sensibili tracciati da Git: ${forbiddenTracked.join(', ')}`);

  const frontendEnv = {
    ...parseDotEnv(join(root, 'frontend', '.env.local')),
    ...parseDotEnv(join(root, 'frontend', '.env.production')),
    ...process.env,
  };
  const supabaseUrl = String(frontendEnv.VITE_SUPABASE_URL || '').trim();
  const supabaseKey = String(frontendEnv.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!/^https:\/\//i.test(supabaseUrl)) fail('VITE_SUPABASE_URL deve essere configurato con HTTPS.');
  if (!supabaseKey) fail('VITE_SUPABASE_PUBLISHABLE_KEY non configurata.');
  if (/sb_secret_|service_role/i.test(supabaseKey)) fail('Nel frontend e presente una chiave Supabase privata.');
  for (const name of Object.keys(frontendEnv)) {
    if (/^VITE_.*(SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD|TOKEN)$/i.test(name) && frontendEnv[name]) {
      fail(`Variabile privata esposta al client: ${name}.`);
    }
  }

  if (requireSigning) {
    signing = getSigningConfig();
    const missing = Object.entries(signing).filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
      fail(`Configurazione firma incompleta: ${missing.join(', ')}.`);
    } else {
      const storePath = resolveStoreFile(signing.storeFile);
      const storeName = basename(storePath).toLowerCase();
      if (!existsSync(storePath) || !statSync(storePath).isFile()) fail('Il keystore configurato non esiste.');
      if (storeName === 'debug.keystore' || storeName.includes('testkey')) fail('Chiave debug/test non consentita per la release.');
      if (!process.env.CI && storePath.startsWith(`${root}/`)) {
        warn('Per maggiore sicurezza conserva il keystore fuori dalla cartella del progetto.');
      }
    }
  }

  return { policy, signing, version };
}

function scanBuiltClient() {
  const dist = join(root, 'frontend', 'dist');
  const files = listFiles(dist, (file) => /\.(js|css|html|json)$/i.test(file));
  const forbiddenPatterns = [
    ['chiave Supabase segreta', /sb_secret_[A-Za-z0-9_-]+/],
    ['ruolo Supabase di servizio', /service_role/i],
    ['chiave privata', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['chiave Stripe privata', /sk_(?:live|test)_[A-Za-z0-9]+/],
  ];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const [label, pattern] of forbiddenPatterns) {
      if (pattern.test(content)) fail(`${label} rilevata nel bundle: ${file.slice(root.length + 1)}.`);
    }
  }
}

function verifyAab(aab, policy) {
  if (!existsSync(aab)) throw new Error(`AAB non trovato: ${aab}`);
  // Android upload keys are self-signed by design: jarsigner --strict would
  // reject that valid condition. Integrity is checked here, then the exact
  // authorized public certificate fingerprint is matched below.
  run('jarsigner', ['-verify', aab]);
  const certificate = capture('keytool', ['-printcert', '-jarfile', aab]);
  const fingerprint = certificate.match(/SHA256:\s*([A-Fa-f0-9:]+)/)?.[1] || '';
  if (normalizeFingerprint(fingerprint) !== normalizeFingerprint(policy.uploadCertificateSha256)) {
    throw new Error('Il certificato dell’AAB non coincide con la chiave di caricamento Motrice autorizzata.');
  }
  const digest = createHash('sha256').update(readFileSync(aab)).digest('hex');
  return digest;
}

function printResult(version) {
  for (const message of warnings) console.warn(`ATTENZIONE: ${message}`);
  if (failures.length) {
    console.error('\nPubblicazione bloccata:');
    for (const message of failures) console.error(`- ${message}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`\nControlli release ${version.name} (${version.code}) superati.`);
  return true;
}

try {
  const result = validateStaticConfiguration({ requireSigning: buildRequested });
  if (!printResult(result.version)) process.exit(1);
  if (checkRequested && !buildRequested) process.exit(0);

  if (!allowDirty && capture('git', ['status', '--porcelain'])) {
    throw new Error('La cartella contiene modifiche non salvate in Git. Salvale prima di creare una release.');
  }

  run('npm', ['audit', '--omit=dev', '--audit-level=high']);
  const tests = listFiles(join(root, 'frontend', 'src'), (file) => /\.test\.js$/i.test(file));
  if (!tests.length) throw new Error('Nessun test automatico trovato.');
  run('node', ['--test', ...tests]);
  run('npm', ['run', 'cap:sync']);
  scanBuiltClient();
  if (!printResult(result.version)) process.exit(1);
  // A clean build is mandatory here: Android's bundle manifest task can be
  // considered up-to-date after only the version constants change, producing
  // an AAB whose embedded version does not match build.gradle.
  run('./gradlew', ['clean', 'bundleRelease', '--no-daemon'], {
    cwd: androidRoot,
    env: {
      ORG_GRADLE_PROJECT_RELEASE_STORE_FILE: result.signing.storeFile,
      ORG_GRADLE_PROJECT_RELEASE_STORE_PASSWORD: result.signing.storePassword,
      ORG_GRADLE_PROJECT_RELEASE_KEY_ALIAS: result.signing.keyAlias,
      ORG_GRADLE_PROJECT_RELEASE_KEY_PASSWORD: result.signing.keyPassword,
    },
  });

  const digest = verifyAab(outputAab, result.policy);
  const releaseDirectory = join(root, 'releases', result.version.name, 'aab');
  const releaseAab = join(releaseDirectory, 'app-release.aab');
  mkdirSync(releaseDirectory, { recursive: true });
  copyFileSync(outputAab, releaseAab);
  writeFileSync(`${releaseAab}.sha256`, `${digest}  app-release.aab\n`, { mode: 0o600 });
  console.log(`\nAAB verificato: ${releaseAab}`);
  console.log(`SHA-256: ${digest}`);
} catch (error) {
  console.error(`\nPubblicazione bloccata: ${error.message}`);
  process.exitCode = 1;
}
