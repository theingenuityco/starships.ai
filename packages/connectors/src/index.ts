/**
 * @starships/connectors
 *
 * Code-driven connector framework. The server consumes `connectorRegistry` in-process:
 * - listRuntimeTemplates() / runtimeTemplate(provider) for runtime template fields
 * - catalog() for the connect UI
 * - get(provider).auth.{begin,complete,buildSession} for the connect + session lifecycle
 * - get(provider).actions for server-side action execution (see ConnectorActionExecutor)
 *
 * Every connector is code: it registers via registerCode() and owns its actions as plain
 * functions (no template DSL). The declarative bundle-template path has been retired.
 */

export * from './framework';
export * from './types';
export { ConnectorRegistry, connectorRegistry, toRuntimeTemplate } from './registry';
export { bootstrapCodeConnectors, resetCodeConnectorBootstrap } from './bootstrap';

export { OAuth2Strategy } from './strategies/OAuth2Strategy';
export { ApiKeyStrategy } from './strategies/ApiKeyStrategy';
export { BasicStrategy } from './strategies/BasicStrategy';
export { PlatformJwtStrategy } from './strategies/PlatformJwtStrategy';
export { NoneStrategy } from './strategies/NoneStrategy';
export { GitHubAppStrategy } from './strategies/GitHubAppStrategy';
export { githubConnector } from './connectors/github';
export { starshipsConnector } from './connectors/starships';
export { systemConnector } from './connectors/system';
