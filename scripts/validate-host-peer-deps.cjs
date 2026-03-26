const fs = require('fs');
const path = require('path');

const HOST_RUNTIME_PACKAGES = [
  'react',
  'react-dom',
  'react-hook-form',
  '@openzeppelin/ui-components',
  '@openzeppelin/ui-react',
  '@openzeppelin/ui-types',
  '@openzeppelin/ui-utils',
];

const packagesDir = path.join(__dirname, '..', 'packages');
const packageDirs = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('adapter-'))
  .map((entry) => entry.name);

const failures = [];

for (const packageDir of packageDirs) {
  const packageJsonPath = path.join(packagesDir, packageDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = packageJson.dependencies || {};
  const peerDependencies = packageJson.peerDependencies || {};
  const devDependencies = packageJson.devDependencies || {};

  for (const dependencyName of HOST_RUNTIME_PACKAGES) {
    if (dependencies[dependencyName]) {
      failures.push(
        `${packageJson.name}: move ${dependencyName} from dependencies to peerDependencies + devDependencies`
      );
    }

    if (peerDependencies[dependencyName] && !devDependencies[dependencyName]) {
      failures.push(
        `${packageJson.name}: add ${dependencyName} to devDependencies to support local development`
      );
    }
  }
}

if (failures.length > 0) {
  console.error('Host runtime dependency policy violations found:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Host runtime dependency policy passed.');
