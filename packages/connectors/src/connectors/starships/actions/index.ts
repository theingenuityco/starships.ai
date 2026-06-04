import type { CodeAction } from '../../../framework';
import { adminCreateConnectorTemplate } from './admin-create-connector-template';
import { adminDeleteConnectorTemplate } from './admin-delete-connector-template';
import { adminGetConnectorTemplate } from './admin-get-connector-template';
import { adminListConnectorTemplates } from './admin-list-connector-templates';
import { adminUpdateConnectorTemplate } from './admin-update-connector-template';
import { listConnectors } from './list-connectors';
import { createDoc } from './create-doc';
import { editDoc } from './edit-doc';
import { listAgents } from './list-agents';
import { getAgent } from './get-agent';
import { createAgent } from './create-agent';
import { getAgentBySlug } from './get-agent-by-slug';
import { updateAgent } from './update-agent';
import { searchDocs } from './search-docs';
import { getDoc } from './get-doc';
import { listModels } from './list-models';
import { createConversation } from './create-conversation';
import { sendMessage } from './send-message';
import { createWidget } from './create-widget';
import { updateWidget } from './update-widget';
import { listAgentsFromMarketplace } from './list-agents-from-marketplace';
import { deployAgentsFromMarketplace } from './deploy-agents-from-marketplace';
import { searchWidgets } from './search-widgets';
import { getStarship } from './get-starship';
import { getAttachmentsPreviewUrls } from './get-attachments-preview-urls';
import { searchConnector } from './search-connector';
import { getConversationMessages } from './get-conversation-messages';
import { adminListConnectorTemplateActions } from './admin-list-connector-template-actions';
import { adminGetConnectorTemplateAction } from './admin-get-connector-template-action';
import { adminUpsertConnectorTemplateAction } from './admin-upsert-connector-template-action';
import { adminDeleteConnectorTemplateAction } from './admin-delete-connector-template-action';
import { adminBulkReplaceConnectorTemplateActions } from './admin-bulk-replace-connector-template-actions';
import { searchViews } from './search-views';
import { getView } from './get-view';
import { getViewBySlug } from './get-view-by-slug';
import { createView } from './create-view';
import { updateView } from './update-view';
import { deleteView } from './delete-view';
import { attachViewToChannel } from './attach-view-to-channel';
import { listChannels } from './list-channels';
import { createChannel } from './create-channel';
import { getChannel } from './get-channel';
import { updateChannel } from './update-channel';
import { deleteChannel } from './delete-channel';
import { addChannelMember } from './add-channel-member';
import { removeChannelMember } from './remove-channel-member';
import { getViewWidgets } from './get-view-widgets';
import { updateViewWidget } from './update-view-widget';
import { patchViewRoot } from './patch-view-root';
import { listTaskBoards } from './list-task-boards';
import { createTaskBoard } from './create-task-board';
import { getTaskBoard } from './get-task-board';
import { updateTaskBoard } from './update-task-board';
import { archiveTaskBoard } from './archive-task-board';
import { createTaskColumn } from './create-task-column';
import { updateTaskColumn } from './update-task-column';
import { deleteTaskColumn } from './delete-task-column';
import { listTaskCards } from './list-task-cards';
import { createTaskCard } from './create-task-card';
import { updateTaskCard } from './update-task-card';
import { moveTaskCard } from './move-task-card';
import { archiveTaskCard } from './archive-task-card';
import { listTables } from './list-tables';
import { createTable } from './create-table';
import { getTable } from './get-table';
import { listTableRows } from './list-table-rows';
import { upsertTableRows } from './upsert-table-rows';
import { getRoomPinsViews } from './get-room-pins-views';
import { getRoomPinsTables } from './get-room-pins-tables';
import { getRoomPinsTaskBoards } from './get-room-pins-task-boards';
import { getRoomResources } from './get-room-resources';
import { updateTable } from './update-table';
import { listRooms } from './list-rooms';
import { createRoom } from './create-room';
import { getRoom } from './get-room';
import { updateRoom } from './update-room';
import { deleteRoom } from './delete-room';
import { getRoomNotificationLevel } from './get-room-notification-level';
import { updateRoomNotificationLevel } from './update-room-notification-level';
import { addRoomMember } from './add-room-member';
import { removeRoomMember } from './remove-room-member';
import { getRoomPins } from './get-room-pins';
import { pinRoomView } from './pin-room-view';
import { unpinRoomView } from './unpin-room-view';
import { pinRoomTable } from './pin-room-table';
import { unpinRoomTable } from './unpin-room-table';
import { pinRoomTaskBoard } from './pin-room-task-board';
import { unpinRoomTaskBoard } from './unpin-room-task-board';
import { reorderRoomPinsViews } from './reorder-room-pins-views';
import { reorderRoomPinsTables } from './reorder-room-pins-tables';
import { reorderRoomPinsTaskBoards } from './reorder-room-pins-task-boards';
import { listConversationChildren } from './list-conversation-children';
import { updateMessage } from './update-message';

export const starshipsActions: CodeAction[] = [
  adminCreateConnectorTemplate,
  adminDeleteConnectorTemplate,
  adminGetConnectorTemplate,
  adminListConnectorTemplates,
  adminUpdateConnectorTemplate,
  listConnectors,
  createDoc,
  editDoc,
  listAgents,
  getAgent,
  createAgent,
  getAgentBySlug,
  updateAgent,
  searchDocs,
  getDoc,
  listModels,
  createConversation,
  sendMessage,
  createWidget,
  updateWidget,
  listAgentsFromMarketplace,
  deployAgentsFromMarketplace,
  searchWidgets,
  getStarship,
  getAttachmentsPreviewUrls,
  searchConnector,
  getConversationMessages,
  adminListConnectorTemplateActions,
  adminGetConnectorTemplateAction,
  adminUpsertConnectorTemplateAction,
  adminDeleteConnectorTemplateAction,
  adminBulkReplaceConnectorTemplateActions,
  searchViews,
  getView,
  getViewBySlug,
  createView,
  updateView,
  deleteView,
  attachViewToChannel,
  listChannels,
  createChannel,
  getChannel,
  updateChannel,
  deleteChannel,
  addChannelMember,
  removeChannelMember,
  getViewWidgets,
  updateViewWidget,
  patchViewRoot,
  listTaskBoards,
  createTaskBoard,
  getTaskBoard,
  updateTaskBoard,
  archiveTaskBoard,
  createTaskColumn,
  updateTaskColumn,
  deleteTaskColumn,
  listTaskCards,
  createTaskCard,
  updateTaskCard,
  moveTaskCard,
  archiveTaskCard,
  listTables,
  createTable,
  getTable,
  listTableRows,
  upsertTableRows,
  getRoomPinsViews,
  getRoomPinsTables,
  getRoomPinsTaskBoards,
  getRoomResources,
  updateTable,
  listRooms,
  createRoom,
  getRoom,
  updateRoom,
  deleteRoom,
  getRoomNotificationLevel,
  updateRoomNotificationLevel,
  addRoomMember,
  removeRoomMember,
  getRoomPins,
  pinRoomView,
  unpinRoomView,
  pinRoomTable,
  unpinRoomTable,
  pinRoomTaskBoard,
  unpinRoomTaskBoard,
  reorderRoomPinsViews,
  reorderRoomPinsTables,
  reorderRoomPinsTaskBoards,
  listConversationChildren,
  updateMessage,
];
