/**
 * Agent Templates Index
 * Exports all agent templates from individual files
 */

export { generalAssistantTemplate } from './general-assistant';
export { codeReviewerTemplate } from './code-reviewer';
export { creativeWriterTemplate } from './creative-writer';
export { dataAnalystTemplate } from './data-analyst';
export { customerSupportTemplate } from './customer-support';
export { sybilTemplate } from './sybil';
export { gaiaTemplate } from './gaia';

// Re-export all agent templates as a single array for convenience
import { generalAssistantTemplate } from './general-assistant';
import { codeReviewerTemplate } from './code-reviewer';
import { creativeWriterTemplate } from './creative-writer';
import { dataAnalystTemplate } from './data-analyst';
import { customerSupportTemplate } from './customer-support';
import { sybilTemplate } from './sybil';
import { gaiaTemplate } from './gaia';

export const ALL_AGENT_TEMPLATES = [
  generalAssistantTemplate,
  codeReviewerTemplate,
  creativeWriterTemplate,
  dataAnalystTemplate,
  customerSupportTemplate,
  sybilTemplate,
  gaiaTemplate,
];
