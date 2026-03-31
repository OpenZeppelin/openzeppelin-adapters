const fs = require('fs');
const path = require('path');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const TIER_ONE_CAPABILITIES = ['addressing', 'explorer', 'network-catalog', 'ui-labels'];
const RESTRICTED_PATH_PATTERNS = [
  'wallet/',
  'transaction/',
  'access-control/',
  'query/',
  'proxy/',
  'abi/',
  'contract/',
  'mapping/',
  'transform/',
  'configuration/rpc',
];

function extractStaticModuleSpecifiers(source) {
  const specifiers = new Set();
  const importPattern = /\bimport\s+(?!type\b)(?:[^'"\n]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const exportPattern = /\bexport\s+(?!type\b)(?:[^'"\n]+?\s+from\s+)?['"]([^'"]+)['"]/g;

  for (const pattern of [importPattern, exportPattern]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        specifiers.add(match[1]);
      }
    }
  }

  return [...specifiers];
}

function resolveRelativeModule(fromFile, specifier) {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = specifier.match(/\.[a-z0-9]+$/i)
    ? [basePath]
    : [
        ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => path.resolve(basePath, `index${extension}`)),
      ];

  const resolvedCandidate = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolvedCandidate) {
    throw new Error(`Unable to resolve "${specifier}" from "${fromFile}".`);
  }

  return resolvedCandidate;
}

function resolveGraphTarget(fromFile, specifier, externalEntryMap) {
  if (specifier in externalEntryMap) {
    return externalEntryMap[specifier];
  }

  if (specifier.startsWith('.')) {
    return resolveRelativeModule(fromFile, specifier);
  }

  return null;
}

function collectStaticDependencyGraph({ entryFile, externalEntryMap = {} }) {
  const visitedFiles = new Set();
  const externalSpecifiers = new Set();

  const visit = (filePath) => {
    if (visitedFiles.has(filePath)) {
      return;
    }

    visitedFiles.add(filePath);

    const source = fs.readFileSync(filePath, 'utf8');
    for (const specifier of extractStaticModuleSpecifiers(source)) {
      const target = resolveGraphTarget(filePath, specifier, externalEntryMap);
      if (target) {
        visit(target);
        continue;
      }

      externalSpecifiers.add(specifier);
    }
  };

  visit(entryFile);

  return {
    files: [...visitedFiles],
    externalSpecifiers: [...externalSpecifiers],
  };
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function findRestrictedDependencies(
  graph,
  { workspaceRoot, restrictedPathPatterns, restrictedExternalSpecifiers = [] }
) {
  const offendingFiles = graph.files
    .map((filePath) => toPosixPath(path.relative(workspaceRoot, filePath)))
    .filter((relativePath) =>
      restrictedPathPatterns.some((pattern) => relativePath.includes(pattern))
    )
    .sort();

  const offendingExternalSpecifiers = graph.externalSpecifiers
    .filter((specifier) => restrictedExternalSpecifiers.includes(specifier))
    .sort();

  return {
    offendingFiles,
    offendingExternalSpecifiers,
  };
}

function buildTierOneEntries(packageRoot) {
  const capabilitiesRoot = path.join(packageRoot, 'src', 'capabilities');

  if (!fs.existsSync(capabilitiesRoot)) {
    return [];
  }

  return TIER_ONE_CAPABILITIES.map((capability) => ({
    capability,
    sourceFile: path.join(capabilitiesRoot, `${capability}.ts`),
  })).filter(({ sourceFile }) => fs.existsSync(sourceFile));
}

function buildEvmCoreAliasMap(packageRoot) {
  const evmCoreRoot = path.resolve(packageRoot, '../adapter-evm-core/src/capabilities');

  return Object.fromEntries(
    TIER_ONE_CAPABILITIES.map((capability) => [
      `@openzeppelin/adapter-evm-core/${capability}`,
      path.join(evmCoreRoot, `${capability}.ts`),
    ])
  );
}

function getTierIsolationPolicy(packageRoot, packageName) {
  if (packageName === '@openzeppelin/adapter-evm') {
    return {
      externalEntryMap: buildEvmCoreAliasMap(packageRoot),
      restrictedExternalSpecifiers: ['@openzeppelin/adapter-evm-core'],
    };
  }

  return {
    externalEntryMap: {},
    restrictedExternalSpecifiers: [],
  };
}

function validateTierIsolationForPackage(packageRoot, packageName) {
  const tierOneEntries = buildTierOneEntries(packageRoot);
  if (tierOneEntries.length === 0) {
    return {
      checked: false,
      errors: [],
    };
  }

  const workspaceRoot = path.resolve(packageRoot, '../..');
  const policy = getTierIsolationPolicy(packageRoot, packageName);
  const errors = [];

  for (const entry of tierOneEntries) {
    const graph = collectStaticDependencyGraph({
      entryFile: entry.sourceFile,
      externalEntryMap: policy.externalEntryMap,
    });
    const { offendingExternalSpecifiers, offendingFiles } = findRestrictedDependencies(graph, {
      workspaceRoot,
      restrictedPathPatterns: RESTRICTED_PATH_PATTERNS,
      restrictedExternalSpecifiers: policy.restrictedExternalSpecifiers,
    });

    if (offendingExternalSpecifiers.length === 0 && offendingFiles.length === 0) {
      continue;
    }

    const details = [];
    if (offendingExternalSpecifiers.length > 0) {
      details.push(`external imports: ${offendingExternalSpecifiers.join(', ')}`);
    }
    if (offendingFiles.length > 0) {
      details.push(`dependency files: ${offendingFiles.join(', ')}`);
    }

    errors.push(
      `${packageName} Tier 1 capability "${entry.capability}" violates isolation (${details.join('; ')})`
    );
  }

  return {
    checked: true,
    errors,
  };
}

module.exports = {
  TIER_ONE_CAPABILITIES,
  RESTRICTED_PATH_PATTERNS,
  collectStaticDependencyGraph,
  findRestrictedDependencies,
  validateTierIsolationForPackage,
};
