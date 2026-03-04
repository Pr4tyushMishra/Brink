import { v4 as uuidv4 } from 'uuid';
import type { CanvasEvent } from '../../shared/types/CanvasEvent';
import { eventStore } from './EventStore';
import { eventBus } from '../../core/event-bus/EventBus';
import { logger } from '../../core/logger/logger';

export class EventService {
    async processClientEvent(boardId: string, type: string, payload: any): Promise<CanvasEvent> {

        // 1. Create the chronological event record
        const newEvent: CanvasEvent = {
            id: uuidv4(),
            boardId,
            type,
            payload,
            createdAt: new Date().toISOString()
        };

        // 2. Store it in the Event Database
        await eventStore.saveEvent(newEvent);

        // 3. Emit it internally so the Entity Service (and future modules) can react
        logger.info(`Processing Event [${type}] for board ${boardId}`);
        eventBus.emitEvent(type, { boardId, event: newEvent });

        return newEvent;
    }
}

export const eventService = new EventService();
