/**
 * Shared utilities for ESLint configuration
 */

// Polyfill for structuredClone for Node.js environments that don't support it natively
if (typeof structuredClone !== 'function') {
  global.structuredClone = function (obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return Object.assign({}, obj);
    }
  };
}

/**
 * Safely extract configs to handle both ESLint v8 and v9 formats
 *
 * @param {object} plugin - The ESLint plugin object
 * @param {string} configName - The name of the config to extract
 * @returns {object} The extracted rules or an empty object
 */
const getPluginConfigs = (plugin, configName) => {
  try {
    if (plugin.configs && plugin.configs[configName] && plugin.configs[configName].rules) {
      return plugin.configs[configName].rules;
    }
    if (plugin.configs && plugin.configs[configName]) {
      return plugin.configs[configName].rules || {};
    }
    return {};
  } catch (e) {
    console.warn(`Failed to load rules from ${configName}:`, e);
    return {};
  }
};

module.exports = {
  getPluginConfigs,
};
