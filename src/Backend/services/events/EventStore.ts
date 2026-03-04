import type { CanvasEvent } from '../../shared/types/CanvasEvent';
import { prisma } from '../../core/database/prisma';

export class EventStore {
    async saveEvent(event: CanvasEvent): Promise<CanvasEvent> {
        await prisma.event.create({
            data: {
                id: event.id,
                boardId: event.boardId,
                type: event.type,
                payload: event.payload as any,
                createdAt: event.createdAt
            }
        });
        return event;
    }

    async getEventsForBoard(boardId: string): Promise<CanvasEvent[]> {
        const docs = await prisma.event.findMany({
            where: { boardId: boardId },
            orderBy: { createdAt: 'asc' }
        });

        return docs.map((doc: any) => ({
            id: doc.id,
            boardId: doc.boardId,
            type: doc.type,
            payload: doc.payload as any,
            createdAt: doc.createdAt
        }));
    }
}

export const eventStore = new EventStore();
