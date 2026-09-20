const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  collectModuleSpecifiers,
  importedPackageNames,
  toPackageName,
} = require('./validate-dist-externals.cjs');

function collected(source) {
  return [...collectModuleSpecifiers(source)].sort();
}

function packages(source) {
  return [...importedPackageNames(source)].sort();
}

describe('validate-dist-externals specifier collection', () => {
  it('collects a static import', () => {
    assert.deepEqual(collected("import { Button } from '@openzeppelin/ui-components';"), [
      '@openzeppelin/ui-components',
    ]);
    assert.deepEqual(packages("import { Button } from '@openzeppelin/ui-components';"), [
      '@openzeppelin/ui-components',
    ]);
  });

  it('collects an export-from re-export', () => {
    assert.deepEqual(collected("export { x } from 'ui-kit';"), ['ui-kit']);
    assert.deepEqual(packages("export { x } from 'ui-kit';"), ['ui-kit']);
  });

  it('collects an inline dynamic import', () => {
    assert.deepEqual(collected("const x = await import('late-pkg');"), ['late-pkg']);
    assert.deepEqual(packages("const x = await import('late-pkg');"), ['late-pkg']);
  });

  it('collects a CommonJS require', () => {
    assert.deepEqual(collected("const pkg = require('cjs-pkg');"), ['cjs-pkg']);
    assert.deepEqual(packages("const pkg = require('cjs-pkg');"), ['cjs-pkg']);
  });

  it('maps a deep import to the package root', () => {
    assert.deepEqual(collected("import helper from 'pkg/sub';"), ['pkg/sub']);
    assert.deepEqual(packages("import helper from 'pkg/sub';"), ['pkg']);
    assert.equal(toPackageName('@scope/name/deep/path'), '@scope/name');
  });

  it('skips node: builtins and relative paths', () => {
    assert.deepEqual(collected("import fs from 'node:fs';\nimport local from './foo.js';"), [
      './foo.js',
      'node:fs',
    ]);
    assert.deepEqual(packages("import fs from 'node:fs';\nimport local from './foo.js';"), []);
    assert.equal(toPackageName('node:fs'), null);
    assert.equal(toPackageName('./foo.js'), null);
  });

  it('does not treat identifier suffixes as import or require calls', () => {
    assert.deepEqual(
      collected("const x = myimport('not-a-pkg');\nconst y = prequire('also-not');"),
      []
    );
  });
});
