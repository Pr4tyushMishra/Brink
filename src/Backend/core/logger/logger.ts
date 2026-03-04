export const logger = {
    info: (message: any, ...args: any[]) => {
        console.log(`[INFO] ${new Date().toISOString()}:`, message, ...args);
    },
    error: (message: any, ...args: any[]) => {
        console.error(`[ERROR] ${new Date().toISOString()}:`, message, ...args);
    },
    warn: (message: any, ...args: any[]) => {
        console.warn(`[WARN] ${new Date().toISOString()}:`, message, ...args);
    },
    debug: (message: any, ...args: any[]) => {
        console.debug(`[DEBUG] ${new Date().toISOString()}:`, message, ...args);
    }
};
