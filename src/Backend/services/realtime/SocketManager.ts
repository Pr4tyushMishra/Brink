import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from '../../core/logger/logger';
import { eventBus } from '../../core/event-bus/EventBus';
import { eventService } from '../events/EventService';
import { boardService } from '../board/BoardService';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string;

export class SocketManager {
    private io: SocketIOServer | null = null;

    // Ephemeral lock tracking: socketId → Set of locked entityIds
    private socketLocks = new Map<string, Set<string>>();

    initialize(httpServer: HttpServer) {
        this.io = new SocketIOServer(httpServer, {
            cors: {
                origin: '*', // For development, allow all
                methods: ['GET', 'POST']
            },
            maxHttpBufferSize: 50e6 // 50MB — needed for base64 image payloads
        });

        this.setupListeners();
        logger.info('SocketManager: Initialized Socket.io server.');
    }

    private setupListeners() {
        if (!this.io) return;

        // Middleware to verify JWT token
        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
                (socket as any).userId = decoded.userId;
                next();
            } catch (err) {
                return next(new Error("Authentication error: Invalid token"));
            }
        });

        this.io.on('connection', (socket: Socket) => {
            const userId = (socket as any).userId;
            logger.info(`Socket connected: ${socket.id}, User: ${userId}`);

            // 1. Join a specific board room
            socket.on('JOIN_BOARD', async (boardId: string) => {
                const board = await boardService.getBoard(boardId, userId);
                if (!board) {
                    logger.warn(`User ${userId} attempted to join unauthorized board ${boardId}`);
                    // You could emit an error back to the client here
                    return;
                }

                socket.join(boardId);
                logger.info(`User ${userId} (Socket ${socket.id}) joined board ${boardId}`);

                // Tell the frontend what their role is
                let role = 'VIEWER';
                if (board.ownerId === userId) {
                    role = 'OWNER';
                } else {
                    const { shares } = await boardService.getSharesForBoard(boardId, board.ownerId!);
                    const myShare = shares.find((s: any) => s.userId === userId);
                    if (myShare) {
                        role = myShare.role;
                    }
                }
                socket.emit('ROLE_ASSIGNED', role);
            });

            // 2. Client sends a drawing action (Event) directly via WebSocket instead of HTTP
            socket.on('CANVAS_EVENT', async (data: { boardId: string, type: string, payload: any }) => {
                try {
                    const { boardId, type, payload } = data;

                    // Security: Verify user actually has access to this board before processing!
                    const board = await boardService.getBoard(boardId, userId);
                    if (!board) {
                        logger.warn(`User ${userId} attempted to send event to unauthorized board ${boardId}`);
                        return;
                    }

                    // Strict Backend Permissions Check (Reject mutative events from VIEWERS)
                    if (board.ownerId !== userId) {
                        const { shares } = await boardService.getSharesForBoard(boardId, board.ownerId!);
                        const myShare = shares.find((s: any) => s.userId === userId);
                        if (!myShare || myShare.role === 'VIEWER') {
                            logger.warn(`User ${userId} attempted to mutate board ${boardId} but only has VIEWER access`);
                            return;
                        }
                    }

                    // Attach the sender's socket ID so we can bypass echoing it back to them
                    payload.senderId = socket.id;

                    // Ephemeral events don't get saved to the database!
                    if (type === 'VIEWPORT_UPDATE' || type === 'MARQUEE_UPDATE' || type === 'ENTITY_DRAGGING') {
                        if (this.io) {
                            this.io.to(boardId).emit('SYNC_EVENT', { type, payload });
                        }
                        return;
                    }

                    // Route it through our standard EventService so it gets saved and processed!
                    await eventService.processClientEvent(boardId, type, payload);

                    // Note: We don't need to manually broadcast back to clients here!
                    // We let the EventBus do it through the binding below, 
                    // to ensure HTTP requests and WebSocket requests act identically.

                } catch (e) {
                    logger.error(`Socket Event Error:`, e);
                }
            });

            // 3. Object-Level Locking (Ephemeral — no DB, just broadcast)
            socket.on('ENTITY_LOCK', (data: { boardId: string, entityIds: string[], userName: string }) => {
                try {
                    const { boardId, entityIds, userName } = data;

                    // Track locks for this socket (for disconnect cleanup)
                    if (!this.socketLocks.has(socket.id)) {
                        this.socketLocks.set(socket.id, new Set());
                    }
                    const held = this.socketLocks.get(socket.id)!;
                    entityIds.forEach(id => held.add(id));

                    // Broadcast to the room
                    if (this.io) {
                        this.io.to(boardId).emit('SYNC_EVENT', {
                            type: 'ENTITY_LOCKED',
                            payload: { entityIds, socketId: socket.id, userName }
                        });
                    }
                } catch (e) {
                    logger.error('Socket ENTITY_LOCK Error:', e);
                }
            });

            socket.on('ENTITY_UNLOCK', (data: { boardId: string, entityIds: string[] }) => {
                try {
                    const { boardId, entityIds } = data;

                    // Remove from tracking
                    const held = this.socketLocks.get(socket.id);
                    if (held) {
                        entityIds.forEach(id => held.delete(id));
                        if (held.size === 0) this.socketLocks.delete(socket.id);
                    }

                    // Broadcast to the room
                    if (this.io) {
                        this.io.to(boardId).emit('SYNC_EVENT', {
                            type: 'ENTITY_UNLOCKED',
                            payload: { entityIds, socketId: socket.id }
                        });
                    }
                } catch (e) {
                    logger.error('Socket ENTITY_UNLOCK Error:', e);
                }
            });

            socket.on('disconnect', () => {
                logger.info(`Socket disconnected: ${socket.id}`);

                // Auto-release all locks held by this socket
                const held = this.socketLocks.get(socket.id);
                if (held && held.size > 0 && this.io) {
                    const entityIds = Array.from(held);
                    // Broadcast unlock to ALL rooms this socket was in
                    socket.rooms.forEach(room => {
                        if (room !== socket.id) { // Skip the socket's own room
                            this.io!.to(room).emit('SYNC_EVENT', {
                                type: 'ENTITY_UNLOCKED',
                                payload: { entityIds, socketId: socket.id }
                            });
                        }
                    });
                    this.socketLocks.delete(socket.id);
                    logger.info(`Auto-released ${entityIds.length} lock(s) for disconnected socket ${socket.id}`);
                }
            });
        });

        // 3. Listen to the internal Engine EventBus and broadcast to WebSockets!
        // This allows HTTP actions (like a plugin creating a shape) to instantly push to WebSocket clients.
        const bindToEventBus = (eventType: string) => {
            eventBus.onEvent(eventType, (data: { boardId: string, event: any }) => {
                if (this.io) {
                    // Push event to everyone currently looking at this specific Board
                    this.io.to(data.boardId).emit('SYNC_EVENT', data.event);
                }
            });
        };

        // Bind to the core events
        bindToEventBus('ENTITY_CREATED');
        bindToEventBus('ENTITY_UPDATED');
        bindToEventBus('ENTITY_DELETED');
    }
}

export const socketManager = new SocketManager();
