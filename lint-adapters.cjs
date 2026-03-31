/**
 * Adapter validation entrypoint.
 *
 * Supports both legacy `src/adapter.ts` interface linting and the
 * capability-based Tier 1 isolation validation used by the new architecture.
 */

const { ESLint } = require('eslint');
const path = require('path');
const fs = require('fs');
const {
  validateTierIsolationForPackage,
} = require('./scripts/adapter-validation/tier-isolation.cjs');

// Create an instance of ESLint with our custom config
const eslint = new ESLint();

// Function to find adapter implementation in the current package
function findAdapterFiles() {
  const adapterFiles = [];
  const srcDir = path.resolve(process.cwd(), 'src');

  // Skip if the src directory doesn't exist
  if (!fs.existsSync(srcDir)) {
    console.warn(`Warning: src directory not found: ${srcDir}`);
    return adapterFiles;
  }

  // Look for adapter.ts in the src directory
  const adapterFile = path.join(srcDir, 'adapter.ts');
  if (fs.existsSync(adapterFile)) {
    adapterFiles.push(adapterFile);
  }

  return adapterFiles;
}

function getCurrentPackageMetadata() {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {
      packageName: path.basename(process.cwd()),
      packageJsonPath,
    };
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return {
    packageName: packageJson.name || path.basename(process.cwd()),
    packageJsonPath,
  };
}

// Function to run ESLint against adapter files
async function lintAdapters() {
  try {
    const { packageName } = getCurrentPackageMetadata();
    console.log(`Validating adapter package: ${packageName}`);

    const validationErrors = [];
    const adapterFiles = findAdapterFiles();
    const tierIsolationResult = validateTierIsolationForPackage(process.cwd(), packageName);

    if (tierIsolationResult.checked && tierIsolationResult.errors.length === 0) {
      console.log('✅ Tier 1 capability isolation check passed.');
    } else if (tierIsolationResult.checked) {
      validationErrors.push(...tierIsolationResult.errors);
    }

    let results = [];

    if (adapterFiles.length > 0) {
      console.log(`Found ${adapterFiles.length} legacy adapter implementation(s) to check:`);
      adapterFiles.forEach((file) => console.log(`- ${path.relative(process.cwd(), file)}`));
      console.log();

      results = await eslint.lintFiles(adapterFiles);

      const adapterRuleViolations = results
        .flatMap((result) => result.messages)
        .filter((message) => message.ruleId === 'custom/no-extra-adapter-methods');

      if (adapterRuleViolations.length > 0) {
        validationErrors.push(
          ...adapterRuleViolations.map(
            (message) =>
              `${message.message} (${message.filePath}:${message.line}:${message.column})`
          )
        );
      } else {
        console.log('✅ Legacy adapter interface compliance passed.');
      }
    }

    if (!tierIsolationResult.checked && adapterFiles.length === 0) {
      console.log(
        'No legacy adapter.ts or capability entrypoints found. Skipping adapter validation.'
      );
      process.exit(0);
    }

    if (validationErrors.length > 0) {
      console.error('\n❌ Adapter validation failed:\n');
      validationErrors.forEach((message) => {
        console.error(`- ${message}`);
      });

      if (adapterFiles.length > 0) {
        console.error(
          '\nLegacy adapter violations should be removed or marked private if they are helpers.'
        );
      }

      process.exit(1);
    }

    if (results.length > 0) {
      const formatter = await eslint.loadFormatter('stylish');
      const formattedResults = await formatter.format(results);
      if (formattedResults.trim()) {
        console.log('\nFull lint results:');
        console.log(formattedResults);
      }

      const hasLintErrors = results.some((result) => result.errorCount > 0);
      process.exit(hasLintErrors ? 1 : 0);
    }

    console.log('✅ Adapter validation passed.');
    process.exit(0);
  } catch (error) {
    console.error('Error linting adapter files:', error);
    process.exit(1);
  }
}

// Run the linting
lintAdapters();
