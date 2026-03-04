import { BackendEventBus } from '../event-bus/EventBus';

export abstract class BaseModule {
    public abstract readonly name: string;
    protected eventBus: BackendEventBus;

    constructor(eventBus: BackendEventBus) {
        this.eventBus = eventBus;
    }

    /**
     * Called by the ModuleLoader when the module is registered.
     * This is where the module should set up its event listeners.
     */
    public abstract init(): Promise<void>;

    /**
     * Called by the ModuleLoader when the server shuts down.
     */
    public abstract destroy(): Promise<void>;
}
