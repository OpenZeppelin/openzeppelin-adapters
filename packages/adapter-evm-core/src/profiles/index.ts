import type {
  CapabilityFactoryMap,
  EcosystemRuntime,
  NetworkConfig,
  ProfileName,
} from '@openzeppelin/ui-types';

import { createComposerRuntime } from './composer';
import { createDeclarativeRuntime } from './declarative';
import { createOperatorRuntime } from './operator';
import { isProfileName } from './shared';
import { createTransactorRuntime } from './transactor';
import { createViewerRuntime } from './viewer';

export { createComposerRuntime } from './composer';
export { createDeclarativeRuntime } from './declarative';
export { createOperatorRuntime } from './operator';
export { createTransactorRuntime } from './transactor';
export { createViewerRuntime } from './viewer';

export function createRuntime(
  profile: ProfileName,
  config: NetworkConfig,
  factories: CapabilityFactoryMap,
  options?: { uiKit?: string }
): EcosystemRuntime {
  if (!isProfileName(profile)) {
    throw new TypeError(
      `Invalid profile name: ${profile}. Expected one of declarative, viewer, transactor, composer, operator.`
    );
  }

  switch (profile) {
    case 'declarative':
      return createDeclarativeRuntime(config, factories, options);
    case 'viewer':
      return createViewerRuntime(config, factories, options);
    case 'transactor':
      return createTransactorRuntime(config, factories, options);
    case 'composer':
      return createComposerRuntime(config, factories, options);
    case 'operator':
      return createOperatorRuntime(config, factories, options);
  }
}
