import Fastify from 'fastify';
import { logger } from '../../core/logger/logger';
import { eventBus } from '../../core/event-bus/EventBus';
import { boardController } from '../../services/board/BoardController';
import { eventController } from '../../services/events/EventController';

// Initialize the EntityService so it starts listening to the EventBus
import '../../services/entity/EntityService';

// Initialize the WebSocket Server
import { setupRealtimeServer } from '../../apps/realtime-server/socket';

// Initialize the Microkernel Module System
import { moduleLoader } from '../../core/kernel/ModuleLoader';
import { HistoryModule } from '../../modules/history/HistoryModule';

import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import path from 'path';

const server = Fastify({
    logger: false
});

// Configure CORS for our Frontend
server.register(cors, {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
});

// Setup File Uploads
server.register(multipart, {
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    }
});

// Setup Static File Serving for Uploads
server.register(staticPlugin, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
});

// Let's listen to an event to prove the EventBus works
eventBus.onEvent('API_HEALTH_CHECK', (payload) => {
    logger.info('Event received from EventBus:', payload);
});

import { AuthRouter } from '../../services/auth/AuthRouter';
import { assetController } from '../../services/assets/AssetController';

// Register Controllers (Routes)
server.register(AuthRouter, { prefix: '/api/auth' });
server.register(boardController, { prefix: '/api' });
server.register(eventController, { prefix: '/api' });
server.register(assetController, { prefix: '/api/assets' });

// Setup WebSockets (Realtime)
setupRealtimeServer(server);

server.get('/health', async (_request, _reply) => {
    // Emit an event to the EventBus
    eventBus.emitEvent('API_HEALTH_CHECK', { endpoint: '/health', time: new Date().toISOString() });

    return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
    try {
        // 1. Boot up independent Plugin Modules via the Microkernel
        await moduleLoader.register(new HistoryModule(eventBus));

        // 2. Boot up HTTP Port
        await server.listen({ port: 3000, host: '0.0.0.0' });
        logger.info(`Server listening on port 3000`);

    } catch (err) {
        logger.error('Error starting server', err);
        process.exit(1);
    }
};

// Graceful shutdown support for Modules
process.on('SIGINT', async () => {
    logger.info('\nGracefully shutting down kernel and modules...');
    await moduleLoader.destroyAll();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('\nGracefully shutting down kernel and modules...');
    await moduleLoader.destroyAll();
    process.exit(0);
});

start();
