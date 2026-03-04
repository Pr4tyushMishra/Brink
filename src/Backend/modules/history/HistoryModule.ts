import { BaseModule } from '../../core/kernel/BaseModule';
import { logger } from '../../core/logger/logger';
import type { CanvasEvent } from '../../shared/types/CanvasEvent';

export class HistoryModule extends BaseModule {
    public readonly name = 'HistoryModule';

    // In a real app, this would use a database.
    // For this plugin demo, we store recent actions in memory.
    private recentActions: string[] = [];

    public async init(): Promise<void> {
        // 1. Listen passively to the Core EventBus
        this.eventBus.onEvent('ENTITY_CREATED', this.handleEntityCreated.bind(this));

        logger.info('[HistoryModule] Ready and passively listening to EventBus!');
    }

    private handleEntityCreated(data: { boardId: string, event: CanvasEvent }) {
        // 2. Do something completely independent of the main pipeline
        const entityType = data.event.payload.entity?.type || 'unknown object';
        const logStr = `Board ${data.boardId} -> Someone drew a ${entityType} at ${new Date().toLocaleTimeString()}`;

        this.recentActions.push(logStr);

        // Log it loudly to prove the plugin works independently!
        logger.info(`\n⭐⭐ [PLUGIN INTERCEPT] HistoryModule recorded: ${logStr}\n`);
    }

    public async destroy(): Promise<void> {
        this.recentActions = [];
        logger.info('[HistoryModule] Cleaned up.');
    }
}
