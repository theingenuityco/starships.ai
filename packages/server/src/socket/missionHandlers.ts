/**
 * Mission-specific Socket.IO handlers for real-time mission messaging
 */

import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

export function setupMissionHandlers(io: Server) {
  logger.info('Setting up Mission Socket.IO handlers');

  io.on('connection', (socket: Socket) => {
    // Join mission room for real-time updates
    socket.on('mission:join-room', (missionId: string) => {
      const roomName = `mission:${missionId}`;
      socket.join(roomName);

      logger.info('Client joined mission room', {
        service: 'MissionSocketHandlers',
        operation: 'mission:join-room',
        resource: 'mission',
        resourceId: missionId,
        metadata: {
          socketId: socket.id,
          roomName,
          totalClientsInRoom: io.sockets.adapter.rooms.get(roomName)?.size || 0,
        },
      });

      socket.emit('mission:room-joined', {
        missionId,
        roomName,
        message: 'Successfully joined mission room',
      });
    });

    // Leave mission room
    socket.on('mission:leave-room', (missionId: string) => {
      const roomName = `mission:${missionId}`;
      socket.leave(roomName);

      logger.info('Client left mission room', {
        service: 'MissionSocketHandlers',
        operation: 'mission:leave-room',
        resource: 'mission',
        resourceId: missionId,
        metadata: {
          socketId: socket.id,
          roomName,
          totalClientsInRoom: io.sockets.adapter.rooms.get(roomName)?.size || 0,
        },
      });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info('Mission socket disconnected', {
        service: 'MissionSocketHandlers',
        operation: 'disconnect',
        metadata: {
          socketId: socket.id,
          reason,
        },
      });
    });
  });

  logger.info('Mission Socket.IO handlers setup complete');
}
