export type EventCallback = (payload: any) => void;

export class EventBus {
    private listeners = new Map<string, Set<EventCallback>>();

    on(event: string, callback: EventCallback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
    }

    off(event: string, callback: EventCallback) {
        this.listeners.get(event)?.delete(callback);
    }

    emit(event: string, payload?: any) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach((cb) => {
                try { cb(payload); }
                catch (error) { console.error(`[EventBus] Error in listener for event '${event}':`, error); }
            });
        }
    }
}

export const EVENTS = {
    ENTITY_CREATED: 'entity:created',
    ENTITY_UPDATED: 'entity:updated',
    ENTITY_DELETED: 'entity:deleted',
    SCENE_CLEARED: 'scene:cleared',
    SELECTION_CHANGED: 'selection:changed',
    TOOL_CHANGED: 'tool:changed',
    REQUEST_IMAGE_UPLOAD: 'request:image:upload',
    REQUEST_TEXT_EDIT: 'request:text:edit'
};
