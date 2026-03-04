import type { FastifyInstance } from 'fastify';
import { socketManager } from '../../services/realtime/SocketManager';

export function setupRealtimeServer(server: FastifyInstance) {
    // Fastify creates the underlying HTTP server lazily,
    // so we need to hook into the 'ready' lifecycle event
    // to ensure the HTTP server exists before binding Socket.io
    server.ready(err => {
        if (err) throw err;
        if (server.server) {
            socketManager.initialize(server.server);
        }
    });
}
