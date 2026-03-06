import type { CanvasEntity } from '../../shared/types/CanvasEntity';
import { prisma } from '../../core/database/prisma';

export class EntityRepository {
    async saveEntity(boardId: string, entity: CanvasEntity): Promise<CanvasEntity> {
        const metadata = entity.metadata ? { ...(entity.metadata as any) } : {};
        delete metadata.selected; // Never persist ephemeral selection state

        const entityData = {
            id: entity.id,
            boardId: boardId,
            type: entity.type,
            transform: entity.transform as any,
            props: entity.props ? (entity.props as any) : {},
            metadata: metadata,
            visible: entity.visible,
            parentId: entity.parentId
        };

        const { id, ...updateData } = entityData;

        await prisma.entity.upsert({
            where: { id: entity.id },
            update: updateData,
            create: entityData
        });
        return entity;
    }

    async getEntitiesForBoard(boardId: string): Promise<CanvasEntity[]> {
        const docs = await prisma.entity.findMany({
            where: { boardId: boardId }
        });

        return docs.map((e: any) => {
            const metadata = (e.metadata as any) || {};
            delete metadata.selected; // Strip from existing DB records

            return {
                id: e.id,
                type: e.type,
                transform: e.transform as any,
                props: (e.props as any) || {},
                metadata: metadata,
                visible: e.visible,
                parentId: e.parentId || undefined
            };
        });
    }

    async updateEntity(entityId: string, updates: Partial<CanvasEntity>): Promise<CanvasEntity | null> {
        let existing = await prisma.entity.findUnique({ where: { id: entityId } });

        // Handle Race Condition: If an update arrives before the create finishes, wait and retry once.
        if (!existing) {
            await new Promise(resolve => setTimeout(resolve, 500));
            existing = await prisma.entity.findUnique({ where: { id: entityId } });
            if (!existing) return null; // Still not found, drop it
        }

        let newTransform = existing.transform as any;
        if (updates.transform) {
            newTransform = { ...newTransform, ...updates.transform };
        }

        let newMetadata = updates.metadata !== undefined ? { ...(existing.metadata as any), ...(updates.metadata as any) } : existing.metadata;
        if (newMetadata && newMetadata.selected !== undefined) {
            newMetadata = { ...newMetadata };
            delete newMetadata.selected;
        }

        const updated = await this.retryOnConflict(() => prisma.entity.update({
            where: { id: entityId },
            data: {
                transform: newTransform,
                props: updates.props !== undefined ? { ...(existing.props as any), ...(updates.props as any) } : existing.props,
                metadata: newMetadata,
                visible: updates.visible !== undefined ? updates.visible : existing.visible,
                parentId: updates.parentId !== undefined ? updates.parentId : existing.parentId
            }
        }));

        const returnedMetadata = (updated.metadata as any) || {};
        delete returnedMetadata.selected;

        return {
            id: updated.id,
            type: updated.type,
            transform: updated.transform as any,
            props: (updated.props as any) || {},
            metadata: returnedMetadata,
            visible: updated.visible,
            parentId: updated.parentId || undefined
        };
    }

    /**
     * Retry a Prisma operation on P2034 write conflict/deadlock errors.
     * MongoDB can throw these when multiple entity updates land simultaneously.
     */
    private async retryOnConflict<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error: any) {
                if (error.code === 'P2034' && attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                    continue;
                }
                throw error;
            }
        }
        throw new Error('retryOnConflict: unreachable');
    }

    async deleteEntity(entityId: string): Promise<void> {
        try {
            await prisma.entity.delete({ where: { id: entityId } });
        } catch (e) {
            // Usually simply means it was already deleted, we can ignore
        }
    }
}

export const entityRepository = new EntityRepository();
