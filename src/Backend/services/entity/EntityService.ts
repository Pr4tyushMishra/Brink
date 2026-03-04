import { entityRepository } from './EntityRepository';
import { eventBus } from '../../core/event-bus/EventBus';
import { logger } from '../../core/logger/logger';
import type { CanvasEvent } from '../../shared/types/CanvasEvent';

export class EntityService {
    constructor() {
        this.bindEvents();
    }

    private updateDebounceTimers = new Map<string, NodeJS.Timeout>();
    private pendingUpdates = new Map<string, any>();

    private bindEvents() {
        // Listen for new entities being created
        eventBus.onEvent('ENTITY_CREATED', async (data: { boardId: string, event: CanvasEvent }) => {
            try {
                const entity = data.event.payload.entity;
                await entityRepository.saveEntity(data.boardId, entity);
                logger.info(`EntityService: Saved new entity ${entity.id} to board ${data.boardId}`);
            } catch (e) {
                logger.error(`EntityService Error on ENTITY_CREATED:`, e);
            }
        });

        // Listen for entities moving/updating
        eventBus.onEvent('ENTITY_UPDATED', (data: { boardId: string, event: CanvasEvent }) => {
            try {
                const payload = data.event.payload;
                const entityId = payload.entityId || (payload.entity ? payload.entity.id : undefined);
                const updates = payload.updates || payload.entity;

                if (!entityId) throw new Error("Missing entityId in payload");

                // Aggressive deep merge for pending updates to ensure no data is lost during rapid drags
                const currentPending = this.pendingUpdates.get(entityId) || {};

                const mergedUpdates = { ...currentPending, ...updates };

                // Specifically merge nested json fields if they both exist
                if (currentPending.props && updates.props) {
                    mergedUpdates.props = { ...currentPending.props, ...updates.props };
                }
                if (currentPending.transform && updates.transform) {
                    mergedUpdates.transform = { ...currentPending.transform, ...updates.transform };
                }
                if (currentPending.metadata && updates.metadata) {
                    mergedUpdates.metadata = { ...currentPending.metadata, ...updates.metadata };
                }

                this.pendingUpdates.set(entityId, mergedUpdates);

                if (this.updateDebounceTimers.has(entityId)) {
                    clearTimeout(this.updateDebounceTimers.get(entityId));
                }

                // Debounce database write by 150ms
                const timer = setTimeout(async () => {
                    this.updateDebounceTimers.delete(entityId);
                    const finalUpdates = this.pendingUpdates.get(entityId);
                    if (finalUpdates) {
                        this.pendingUpdates.delete(entityId);
                        try {
                            await entityRepository.updateEntity(entityId, finalUpdates);
                            logger.info(`EntityService: Saved aggregated update for entity ${entityId}`);
                        } catch (err) {
                            logger.error(`EntityService Error flushing aggregated update for ${entityId}:`, err);
                        }
                    }
                }, 150);

                this.updateDebounceTimers.set(entityId, timer);
            } catch (e) {
                logger.error(`EntityService Error on ENTITY_UPDATED:`, e);
            }
        });

        // Listen for entities deleted
        eventBus.onEvent('ENTITY_DELETED', async (data: { boardId: string, event: CanvasEvent }) => {
            try {
                const entityId = data.event.payload.entityId;
                if (!entityId) throw new Error("Missing entityId in payload");

                await entityRepository.deleteEntity(entityId);
                logger.info(`EntityService: Deleted entity ${entityId} from board ${data.boardId}`);
            } catch (e) {
                logger.error(`EntityService Error on ENTITY_DELETED:`, e);
            }
        });
    }
}

// Automatically instantiate so it starts listening
export const entityService = new EntityService();
