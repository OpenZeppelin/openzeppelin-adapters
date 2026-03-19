/**
 * Custom ESLint plugin for OpenZeppelin Adapters
 */

'use strict';

const noExtraAdapterMethods = require('./rules/no-extra-adapter-methods.cjs');

module.exports = {
  rules: {
    'no-extra-adapter-methods': noExtraAdapterMethods,
  },
};
