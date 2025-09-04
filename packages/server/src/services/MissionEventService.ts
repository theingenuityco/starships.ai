/**
 * Mission Event Service
 * Handles real-time WebSocket events for mission updates
 */

import { Server } from 'socket.io';
import { Logger } from '@/utils/logger';
import type { MissionModel, MissionClarityModel, MissionPhase, MissionStatus } from '@starships/protocol';

export class MissionEventService {
  private static instance: MissionEventService | null = null;
  private io: Server | null = null;
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  public static getInstance(): MissionEventService {
    if (!MissionEventService.instance) {
      MissionEventService.instance = new MissionEventService();
    }
    return MissionEventService.instance;
  }

  public setSocketIO(io: Server): void {
    this.io = io;
    this.logger.info('MissionEventService initialized with Socket.IO server');
  }

  /**
   * Emit clarity update to all clients in mission room
   */
  public emitClarityUpdate(missionId: string, clarity: MissionClarityModel): void {
    if (!this.io) {
      this.logger.warn('Socket.IO not initialized, cannot emit clarity update');
      return;
    }

    const roomName = `mission:${missionId}`;
    const event = 'mission:clarity-updated';
    const data = {
      missionId,
      clarity,
      timestamp: new Date().toISOString(),
    };

    this.io.to(roomName).emit(event, data);

    this.logger.info('Emitted clarity update', {
      service: 'MissionEventService',
      operation: 'emitClarityUpdate',
      resource: 'mission',
      resourceId: missionId,
      metadata: {
        roomName,
        overallScore: clarity.overallScore,
        iteration: clarity.iteration,
        connectedClients: this.io.sockets.adapter.rooms.get(roomName)?.size || 0,
      },
    });
  }

  /**
   * Emit phase change to all clients in mission room
   */
  public emitPhaseChange(missionId: string, newPhase: MissionPhase, previousPhase: MissionPhase): void {
    if (!this.io) {
      this.logger.warn('Socket.IO not initialized, cannot emit phase change');
      return;
    }

    const roomName = `mission:${missionId}`;
    const event = 'mission:phase-changed';
    const data = {
      missionId,
      newPhase,
      previousPhase,
      timestamp: new Date().toISOString(),
    };

    this.io.to(roomName).emit(event, data);

    this.logger.info('Emitted phase change', {
      service: 'MissionEventService',
      operation: 'emitPhaseChange',
      resource: 'mission',
      resourceId: missionId,
      metadata: {
        roomName,
        newPhase,
        previousPhase,
        connectedClients: this.io.sockets.adapter.rooms.get(roomName)?.size || 0,
      },
    });
  }

  /**
   * Emit status change to all clients in mission room
   */
  public emitStatusChange(missionId: string, newStatus: MissionStatus, previousStatus: MissionStatus): void {
    if (!this.io) {
      this.logger.warn('Socket.IO not initialized, cannot emit status change');
      return;
    }

    const roomName = `mission:${missionId}`;
    const event = 'mission:status-changed';
    const data = {
      missionId,
      newStatus,
      previousStatus,
      timestamp: new Date().toISOString(),
    };

    this.io.to(roomName).emit(event, data);

    this.logger.info('Emitted status change', {
      service: 'MissionEventService',
      operation: 'emitStatusChange',
      resource: 'mission',
      resourceId: missionId,
      metadata: {
        roomName,
        newStatus,
        previousStatus,
        connectedClients: this.io.sockets.adapter.rooms.get(roomName)?.size || 0,
      },
    });
  }

  /**
   * Emit general mission update (for any other mission changes)
   */
  public emitMissionUpdate(missionId: string, mission: MissionModel, changeType: string): void {
    if (!this.io) {
      this.logger.warn('Socket.IO not initialized, cannot emit mission update');
      return;
    }

    const roomName = `mission:${missionId}`;
    const event = 'mission:updated';
    const data = {
      missionId,
      mission,
      changeType,
      timestamp: new Date().toISOString(),
    };

    this.io.to(roomName).emit(event, data);

    this.logger.info('Emitted mission update', {
      service: 'MissionEventService',
      operation: 'emitMissionUpdate',
      resource: 'mission',
      resourceId: missionId,
      metadata: {
        roomName,
        changeType,
        connectedClients: this.io.sockets.adapter.rooms.get(roomName)?.size || 0,
      },
    });
  }
}
