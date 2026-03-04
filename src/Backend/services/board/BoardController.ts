import type { FastifyInstance } from 'fastify';
import { boardService } from './BoardService';
import { authGuard } from '../auth/AuthGuard';

export async function boardController(server: FastifyInstance) {

    // Create a new Board
    server.post<{ Body: { name: string } }>('/boards', { preValidation: [authGuard] }, async (request, reply) => {
        try {
            const { name } = request.body;
            const userId = (request as any).userId;

            if (!name) {
                return reply.status(400).send({ error: 'Board name is required' });
            }

            const board = await boardService.createBoard(name, userId);
            return reply.status(201).send(board);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to create board' });
        }
    });

    // Get ALL Boards for the logged in User
    server.get('/boards', { preValidation: [authGuard] }, async (request, reply) => {
        try {
            const userId = (request as any).userId;
            const boards = await boardService.getBoardsForUser(userId);
            return reply.status(200).send(boards);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to retrieve boards' });
        }
    });

    // Get a specific Board by ID
    server.get<{ Params: { id: string } }>('/boards/:id', { preValidation: [authGuard] }, async (request, reply) => {
        try {
            const userId = (request as any).userId;
            const board = await boardService.getBoard(request.params.id, userId);

            if (!board) {
                return reply.status(404).send({ error: 'Board not found or unauthorized' });
            }
            return reply.status(200).send(board);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to retrieve board' });
        }
    });

    // Share a Board
    server.post<{ Params: { id: string }, Body: { email: string, role: 'VIEWER' | 'EDITOR' } }>('/boards/:id/share', { preValidation: [authGuard] }, async (request, reply) => {
        try {
            const userId = (request as any).userId;
            const { email, role } = request.body;

            if (!email || !role) {
                return reply.status(400).send({ error: 'Email and role are required' });
            }

            const share = await boardService.shareBoard(request.params.id, userId, email, role);
            return reply.status(200).send(share);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message || 'Failed to share board' });
        }
    });

    // Get Shares for a Board
    server.get<{ Params: { id: string } }>('/boards/:id/shares', { preValidation: [authGuard] }, async (request, reply) => {
        try {
            const userId = (request as any).userId;
            const shares = await boardService.getSharesForBoard(request.params.id, userId);

            // Map to a clean frontend model
            const formatted = shares.map(s => ({
                id: s.userId,
                name: (s as any).user.name || 'User', // Requires name in Prisma User model, relying on email for now
                email: (s as any).user.email,
                role: s.role
            }));

            return reply.status(200).send(formatted);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message || 'Failed to retrieve shares' });
        }
    });

    // Rename a Board
    server.put<{ Params: { id: string }, Body: { name: string } }>('/boards/:id/rename', { preValidation: [authGuard] }, async (request, reply) => {
        try {
            const userId = (request as any).userId;
            const { name } = request.body;

            if (!name || name.trim() === '') {
                return reply.status(400).send({ error: 'Valid board name is required' });
            }

            await boardService.renameBoard(request.params.id, name.trim(), userId);

            // Broadcast the rename to all connected clients immediately
            import('../../core/event-bus/EventBus').then(({ eventBus }) => {
                eventBus.emitEvent('CANVAS_EVENT', {
                    boardId: request.params.id,
                    senderId: 'SYSTEM',
                    type: 'BOARD_RENAMED',
                    payload: { name: name.trim() }
                });
            });

            return reply.status(200).send({ success: true, name: name.trim() });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message || 'Failed to rename board' });
        }
    });
}
