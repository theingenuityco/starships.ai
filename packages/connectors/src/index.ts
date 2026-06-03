/**
 * @starships/connectors
 *
 * Code-driven connector framework. The server consumes `connectorRegistry` in-process:
 * - listRuntimeTemplates() / runtimeTemplate(provider) for runtime template fields
 * - catalog() for the connect UI
 * - get(provider).auth.{begin,complete,buildSession} for the connect + session lifecycle
 *
 * Declarative connectors are registered from JSON via registerContainers(); hand-written
 * connectors (e.g. GitHub App) are registered as code and take precedence.
 */

export * from './types';
export { ConnectorRegistry, connectorRegistry, toRuntimeTemplate } from './registry';
export { fromTemplate, type ConnectorTemplateContainer } from './adapter/fromTemplate';
export { loadTemplateContainersFromDir } from './loaders';

export { OAuth2Strategy } from './strategies/OAuth2Strategy';
export { ApiKeyStrategy } from './strategies/ApiKeyStrategy';
export { BasicStrategy } from './strategies/BasicStrategy';
export { PlatformJwtStrategy } from './strategies/PlatformJwtStrategy';
export { NoneStrategy } from './strategies/NoneStrategy';
export { GitHubAppStrategy } from './strategies/GitHubAppStrategy';
export { githubConnector } from './connectors/github';
