import { EventEmitter } from 'events';

export class BackendEventBus extends EventEmitter {
    constructor() {
        super();
        // Allow up to 50 listeners for modular architecture
        this.setMaxListeners(50);
    }

    // Typed emit and on can be added later as the system grows.
    emitEvent(eventName: string, payload: any) {
        this.emit(eventName, payload);
    }

    onEvent(eventName: string, listener: (...args: any[]) => void) {
        this.on(eventName, listener);
    }
}

export const eventBus = new BackendEventBus();
