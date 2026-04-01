/**
 * Adapter validation entrypoint.
 *
 * Validates capability conformance:
 * - Tier 1 isolation (no Tier 2/3 transitive dependencies)
 * - Capability export structure (required source files, barrel exports, sub-path exports)
 */

const path = require('path');
const {
  validateTierIsolationForPackage,
} = require('./scripts/adapter-validation/tier-isolation.cjs');
const {
  validateCapabilityExportStructure,
} = require('./scripts/adapter-validation/capability-conformance.cjs');

function getCurrentPackageMetadata() {
  const fs = require('fs');
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { packageName: path.basename(process.cwd()) };
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return { packageName: packageJson.name || path.basename(process.cwd()) };
}

async function lintAdapters() {
  try {
    const { packageName } = getCurrentPackageMetadata();
    console.log(`Validating adapter package: ${packageName}`);

    const validationErrors = [];

    const tierIsolationResult = validateTierIsolationForPackage(process.cwd(), packageName);
    if (tierIsolationResult.checked && tierIsolationResult.errors.length === 0) {
      console.log('✅ Tier 1 capability isolation check passed.');
    } else if (tierIsolationResult.checked) {
      validationErrors.push(...tierIsolationResult.errors);
    }

    const conformanceResult = validateCapabilityExportStructure(process.cwd(), packageName);
    if (conformanceResult.checked && conformanceResult.errors.length === 0) {
      console.log(
        `✅ Capability export structure passed (${conformanceResult.implementedCapabilities.length} capabilities).`
      );
    } else if (conformanceResult.checked) {
      validationErrors.push(...conformanceResult.errors);
    }

    if (!tierIsolationResult.checked && !conformanceResult.checked) {
      console.log('No capability entrypoints found. Skipping adapter validation.');
      process.exit(0);
    }

    if (validationErrors.length > 0) {
      console.error('\n❌ Adapter validation failed:\n');
      validationErrors.forEach((message) => {
        console.error(`- ${message}`);
      });
      process.exit(1);
    }

    console.log('✅ Adapter validation passed.');
    process.exit(0);
  } catch (error) {
    console.error('Error validating adapter:', error);
    process.exit(1);
  }
}

lintAdapters();
