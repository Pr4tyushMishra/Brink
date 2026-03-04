import { BaseModule } from './BaseModule';
import { logger } from '../logger/logger';

export class ModuleLoader {
    private modules: Map<string, BaseModule> = new Map();

    async register(module: BaseModule): Promise<void> {
        if (this.modules.has(module.name)) {
            logger.warn(`ModuleLoader: Module ${module.name} is already registered.`);
            return;
        }

        try {
            logger.info(`ModuleLoader: Initializing module [${module.name}]...`);
            await module.init();
            this.modules.set(module.name, module);
            logger.info(`ModuleLoader: Successfully loaded module [${module.name}]`);
        } catch (error) {
            // THE CRITICAL KERNEL FEATURE: 
            // If a module fails to initialize, the core server survives!
            logger.error(`ModuleLoader: FAILED to initialize module [${module.name}]:`, error);
        }
    }

    async destroyAll(): Promise<void> {
        for (const [name, module] of this.modules) {
            try {
                await module.destroy();
                logger.info(`ModuleLoader: Destroyed module [${name}]`);
            } catch (error) {
                logger.error(`ModuleLoader: Error destroying module [${name}]:`, error);
            }
        }
        this.modules.clear();
    }
}

export const moduleLoader = new ModuleLoader();
