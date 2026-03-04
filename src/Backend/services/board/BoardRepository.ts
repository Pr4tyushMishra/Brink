import type { Board } from '../../shared/types/CanvasEntity';
import { prisma } from '../../core/database/prisma';

export class BoardRepository {
    async saveBoard(board: Board, ownerId?: string): Promise<Board> {
        const saved = await prisma.board.create({
            data: {
                id: board.id,
                name: board.name,
                projectId: board.projectId || null,
                ownerId: ownerId || null,
                createdAt: board.createdAt,
                updatedAt: board.updatedAt
            }
        });
        return { ...board, ownerId: saved.ownerId || undefined } as any; // Type hack for now
    }

    async getBoardById(id: string): Promise<Board | null> {
        const boardDoc = await prisma.board.findUnique({
            where: { id },
            include: { entities: true }
        });

        if (!boardDoc) return null;

        const board: Board = {
            id: boardDoc.id,
            name: boardDoc.name,
            projectId: boardDoc.projectId || undefined,
            ownerId: boardDoc.ownerId || undefined,
            createdAt: boardDoc.createdAt,
            updatedAt: boardDoc.updatedAt,
            entities: boardDoc.entities.map(e => ({
                id: e.id,
                type: e.type,
                transform: e.transform as any,
                props: (e.props as any) || {},
                metadata: (e.metadata as any) || {},
                visible: e.visible,
                parentId: e.parentId || undefined
            }))
        };

        return board as any; // Type hack for now until we update the interface
    }

    async getBoardsByUserId(userId: string): Promise<Board[]> {
        const boards = await prisma.board.findMany({
            where: {
                OR: [
                    { ownerId: userId },
                    { shares: { some: { userId } } }
                ]
            },
            orderBy: { createdAt: 'desc' }
        });

        return boards.map(b => ({
            id: b.id,
            name: b.name,
            projectId: b.projectId || undefined,
            ownerId: b.ownerId || undefined,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
            entities: []
        })) as any[];
    }

    async checkUserAccess(boardId: string, userId: string): Promise<boolean> {
        const share = await prisma.boardShare.findUnique({
            where: { boardId_userId: { boardId, userId } }
        });
        return !!share;
    }

    async getSharesForBoard(boardId: string) {
        return await prisma.boardShare.findMany({
            where: { boardId },
            include: {
                user: {
                    select: { id: true, email: true }
                }
            }
        });
    }

    async addShare(boardId: string, email: string, role: 'VIEWER' | 'EDITOR') {
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            throw new Error(`User with email ${email} not found`);
        }

        return await prisma.boardShare.upsert({
            where: {
                boardId_userId: { boardId, userId: user.id }
            },
            update: {
                role
            },
            create: {
                boardId,
                userId: user.id,
                role
            },
            include: {
                user: { select: { id: true, email: true } }
            }
        });
    }

    async renameBoard(id: string, name: string): Promise<void> {
        await prisma.board.update({
            where: { id },
            data: {
                name,
                updatedAt: new Date().toISOString()
            }
        });
    }
}

export const boardRepository = new BoardRepository();
