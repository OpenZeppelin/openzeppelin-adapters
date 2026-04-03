const fs = require('fs');
const path = require('path');

const ALL_CAPABILITIES = [
  'addressing',
  'explorer',
  'network-catalog',
  'ui-labels',
  'contract-loading',
  'schema',
  'type-mapping',
  'query',
  'execution',
  'wallet',
  'ui-kit',
  'relayer',
  'access-control',
];

const TIER_ONE_CAPABILITIES = ['addressing', 'explorer', 'network-catalog', 'ui-labels'];

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

function findCapabilitySourceFile(capabilitiesDir, capability) {
  for (const ext of SOURCE_EXTENSIONS) {
    const filePath = path.join(capabilitiesDir, `${capability}${ext}`);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function validateCapabilityExportStructure(packageRoot, packageName) {
  const capabilitiesDir = path.join(packageRoot, 'src', 'capabilities');
  const errors = [];

  if (!fs.existsSync(capabilitiesDir)) {
    return { checked: false, errors: [], implementedCapabilities: [] };
  }

  const implementedCapabilities = ALL_CAPABILITIES.filter((cap) =>
    findCapabilitySourceFile(capabilitiesDir, cap)
  );

  const missingTierOne = TIER_ONE_CAPABILITIES.filter(
    (cap) => !implementedCapabilities.includes(cap)
  );
  if (missingTierOne.length > 0) {
    errors.push(
      `${packageName} is missing required Tier 1 capabilities: ${missingTierOne.join(', ')}`
    );
  }

  const barrelFile = path.join(capabilitiesDir, 'index.ts');
  if (!fs.existsSync(barrelFile)) {
    errors.push(
      `${packageName} is missing capabilities barrel export at src/capabilities/index.ts`
    );
  }

  const profilesDir = path.join(packageRoot, 'src', 'profiles');
  if (
    implementedCapabilities.length > TIER_ONE_CAPABILITIES.length &&
    !fs.existsSync(profilesDir)
  ) {
    errors.push(
      `${packageName} implements Tier 2+ capabilities but is missing src/profiles/ directory`
    );
  }

  const packageJsonPath = path.join(packageRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const exports = packageJson.exports || {};

    for (const cap of implementedCapabilities) {
      const subPath = `./${cap}`;
      if (!exports[subPath]) {
        errors.push(
          `${packageName} implements "${cap}" capability but missing sub-path export "${subPath}" in package.json`
        );
      }
    }
  }

  return { checked: true, errors, implementedCapabilities };
}

module.exports = {
  ALL_CAPABILITIES,
  TIER_ONE_CAPABILITIES,
  validateCapabilityExportStructure,
};
