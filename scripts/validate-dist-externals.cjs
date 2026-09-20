const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const workspaceRoot = path.resolve(__dirname, '..');
const packagesDir = path.join(workspaceRoot, 'packages');
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const runtimeExtensionPattern = /\.(?:cjs|mjs|js)$/;

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function collectModuleSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /^\s*import\s+(?:[^'"\n]+?\s+from\s+)?['"]([^'"]+)['"]/gm,
    /^\s*export\s+(?:[^'"\n]+?\s+from\s+)['"]([^'"]+)['"]/gm,
    /^\s*(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }

  return specifiers;
}

function toPackageName(specifier) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('#') ||
    builtinModules.includes(specifier) ||
    builtins.has(specifier)
  ) {
    return null;
  }

  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function validatePackage(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  const distDir = path.join(packageDir, 'dist');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (packageJson.private || !packageJson.scripts?.build || !fs.existsSync(distDir)) {
    return [];
  }

  const declaredRuntimeDependencies = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ]);
  const importedPackages = new Set();

  for (const filePath of listFiles(distDir).filter((file) => runtimeExtensionPattern.test(file))) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const specifier of collectModuleSpecifiers(source)) {
      const packageName = toPackageName(specifier);
      if (packageName) {
        importedPackages.add(packageName);
      }
    }
  }

  return [...importedPackages]
    .filter((packageName) => !declaredRuntimeDependencies.has(packageName))
    .sort()
    .map(
      (packageName) =>
        `${packageJson.name}: dist imports ${packageName}, but it is absent from dependencies and peerDependencies`
    );
}

const packageDirs = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('adapter-'))
  .map((entry) => path.join(packagesDir, entry.name));

const failures = packageDirs.flatMap(validatePackage);

if (failures.length > 0) {
  console.error('Undeclared dist external imports found:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Dist external import declarations passed.');
