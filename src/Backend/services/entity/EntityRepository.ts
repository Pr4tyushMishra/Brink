import type { CanvasEntity } from '../../shared/types/CanvasEntity';
import { prisma } from '../../core/database/prisma';

export class EntityRepository {
    async saveEntity(boardId: string, entity: CanvasEntity): Promise<CanvasEntity> {
        const entityData = {
            id: entity.id,
            boardId: boardId,
            type: entity.type,
            transform: entity.transform as any,
            props: entity.props ? (entity.props as any) : {},
            metadata: entity.metadata ? (entity.metadata as any) : {},
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

        return docs.map((e: any) => ({
            id: e.id,
            type: e.type,
            transform: e.transform as any,
            props: (e.props as any) || {},
            metadata: (e.metadata as any) || {},
            visible: e.visible,
            parentId: e.parentId || undefined
        }));
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

        const updated = await prisma.entity.update({
            where: { id: entityId },
            data: {
                transform: newTransform,
                props: updates.props !== undefined ? { ...(existing.props as any), ...(updates.props as any) } : existing.props,
                metadata: updates.metadata !== undefined ? { ...(existing.metadata as any), ...(updates.metadata as any) } : existing.metadata,
                visible: updates.visible !== undefined ? updates.visible : existing.visible,
                parentId: updates.parentId !== undefined ? updates.parentId : existing.parentId
            }
        });

        return {
            id: updated.id,
            type: updated.type,
            transform: updated.transform as any,
            props: (updated.props as any) || {},
            metadata: (updated.metadata as any) || {},
            visible: updated.visible,
            parentId: updated.parentId || undefined
        };
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
