import type { Socket } from 'socket.io-client';

export interface LockInfo {
    userId: string;
    socketId: string;
    userName: string;
}

/**
 * LockModule — Manages ephemeral object-level locks for collaborative editing.
 *
 * Fully standalone: does NOT depend on SelectionModule. If this module crashes,
 * the rest of the canvas continues to work — objects just won't show lock indicators.
 */
export class LockModule {
    /** entityId → lock holder info */
    private locks = new Map<string, LockInfo>();
    private socket: Socket | null = null;
    private mySocketId: string | null = null;
    private boardId: string = '';
    private onDirty: (() => void) | null = null;

    /**
     * Initialize with a live socket connection.
     * Safe to call multiple times (idempotent).
     */
    attach(socket: Socket, boardId: string, onDirty: () => void) {
        this.socket = socket;
        this.boardId = boardId;
        this.mySocketId = socket.id ?? null;
        this.onDirty = onDirty;

        // Update our socket ID once connected (socket.id may be null before connect)
        socket.on('connect', () => {
            this.mySocketId = socket.id ?? null;
        });
    }

    /**
     * Lock a set of entity IDs for the current user.
     * Automatically unlocks any previously held locks first.
     */
    lockEntities(entityIds: string[], userName: string) {
        if (!this.socket || !this.mySocketId) return;

        try {
            // Release any previous locks we held
            this.unlockAll();

            if (entityIds.length === 0) return;

            // Set local locks
            entityIds.forEach(id => {
                this.locks.set(id, {
                    userId: '',
                    socketId: this.mySocketId!,
                    userName
                });
            });

            // Broadcast to other users
            this.socket.emit('ENTITY_LOCK', {
                boardId: this.boardId,
                entityIds,
                userName
            });
        } catch (e) {
            console.error('[LockModule] Error locking entities:', e);
        }
    }

    /**
     * Unlock all entities held by the current user.
     */
    unlockAll() {
        if (!this.socket || !this.mySocketId) return;

        try {
            const myLockedIds: string[] = [];
            this.locks.forEach((lock, entityId) => {
                if (lock.socketId === this.mySocketId) {
                    myLockedIds.push(entityId);
                }
            });

            if (myLockedIds.length === 0) return;

            // Remove local locks
            myLockedIds.forEach(id => this.locks.delete(id));

            // Broadcast unlock
            this.socket.emit('ENTITY_UNLOCK', {
                boardId: this.boardId,
                entityIds: myLockedIds
            });

            this.markDirty();
        } catch (e) {
            console.error('[LockModule] Error unlocking entities:', e);
        }
    }

    /**
     * Handle incoming lock event from another user.
     */
    handleRemoteLock(data: { entityIds: string[], socketId: string, userName: string }) {
        try {
            if (data.socketId === this.mySocketId) return; // Ignore our own echoed events

            data.entityIds.forEach(id => {
                this.locks.set(id, {
                    userId: '',
                    socketId: data.socketId,
                    userName: data.userName
                });
            });
            this.markDirty();
        } catch (e) {
            console.error('[LockModule] Error handling remote lock:', e);
        }
    }

    /**
     * Handle incoming unlock event from another user.
     */
    handleRemoteUnlock(data: { entityIds: string[], socketId: string }) {
        try {
            if (data.socketId === this.mySocketId) return;

            data.entityIds.forEach(id => {
                const lock = this.locks.get(id);
                if (lock && lock.socketId === data.socketId) {
                    this.locks.delete(id);
                }
            });
            this.markDirty();
        } catch (e) {
            console.error('[LockModule] Error handling remote unlock:', e);
        }
    }

    /**
     * Check if an entity is locked by someone OTHER than the current user.
     */
    isLockedByOther(entityId: string): boolean {
        const lock = this.locks.get(entityId);
        if (!lock) return false;
        return lock.socketId !== this.mySocketId;
    }

    /**
     * Get lock info for an entity (returns null if not locked by another user).
     */
    getLockInfo(entityId: string): LockInfo | null {
        const lock = this.locks.get(entityId);
        if (!lock || lock.socketId === this.mySocketId) return null;
        return lock;
    }

    /**
     * Get all entities locked by other users (for rendering).
     */
    getRemoteLocks(): Map<string, LockInfo> {
        const result = new Map<string, LockInfo>();
        this.locks.forEach((lock, entityId) => {
            if (lock.socketId !== this.mySocketId) {
                result.set(entityId, lock);
            }
        });
        return result;
    }

    /**
     * Clean up on destroy.
     */
    destroy() {
        this.unlockAll();
        this.locks.clear();
        this.socket = null;
        this.onDirty = null;
    }

    private markDirty() {
        if (this.onDirty) {
            try { this.onDirty(); } catch (_) { /* swallow */ }
        }
    }
}
