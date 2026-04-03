import tierIsolationTools from '../../scripts/adapter-validation/tier-isolation.cjs';

export interface DependencyGraph {
  files: string[];
  externalSpecifiers: string[];
}

export interface CollectDependencyGraphOptions {
  entryFile: string;
  externalEntryMap?: Record<string, string>;
}

export interface RestrictedDependencyOptions {
  workspaceRoot: string;
  restrictedPathPatterns: string[];
  restrictedExternalSpecifiers?: string[];
}

const { collectStaticDependencyGraph, findRestrictedDependencies } = tierIsolationTools as {
  collectStaticDependencyGraph: (options: CollectDependencyGraphOptions) => DependencyGraph;
  findRestrictedDependencies: (
    graph: DependencyGraph,
    options: RestrictedDependencyOptions
  ) => {
    offendingFiles: string[];
    offendingExternalSpecifiers: string[];
  };
};

export { collectStaticDependencyGraph, findRestrictedDependencies };
