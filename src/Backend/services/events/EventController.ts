import type { FastifyInstance } from 'fastify';
import { eventService } from './EventService';

export async function eventController(server: FastifyInstance) {

    // Create a new generic event on a board
    server.post<{ Params: { boardId: string }, Body: { type: string, payload: any } }>(
        '/boards/:boardId/events',
        // Example of Basic Validation as discussed
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['type', 'payload'],
                    properties: {
                        type: { type: 'string' },
                        payload: { type: 'object' }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { boardId } = request.params;
                const { type, payload } = request.body;

                const event = await eventService.processClientEvent(boardId, type, payload);

                return reply.status(201).send(event);
            } catch (error) {
                return reply.status(500).send({ error: 'Failed to process event' });
            }
        }
    );

}
