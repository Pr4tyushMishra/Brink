import { v4 as uuidv4 } from 'uuid';
import type { Board } from '../../shared/types/CanvasEntity';
import { boardRepository } from './BoardRepository';
import { eventBus } from '../../core/event-bus/EventBus';
import { logger } from '../../core/logger/logger';

export class BoardService {
    async createBoard(name: string, ownerId: string): Promise<Board> {
        const timestamp = new Date().toISOString();

        const newBoard: Board = {
            id: uuidv4(),
            name,
            createdAt: timestamp,
            updatedAt: timestamp,
            entities: []
        };

        const savedBoard = await boardRepository.saveBoard(newBoard, ownerId);

        // Core tenet: Everything is an event
        logger.info(`Board created with ID: ${savedBoard.id} by User: ${ownerId}`);
        eventBus.emitEvent('BOARD_CREATED', { boardId: savedBoard.id, name, ownerId });

        return savedBoard;
    }

    async getBoardsForUser(userId: string): Promise<Board[]> {
        return await boardRepository.getBoardsByUserId(userId);
    }

    async getBoard(id: string, userId: string): Promise<Board | null> {
        // In the future this should check BoardShare too. For now just owner.
        const board = await boardRepository.getBoardById(id);
        if (board && board.ownerId !== userId) {
            // Check if they are in the BoardShare table
            const hasAccess = await boardRepository.checkUserAccess(id, userId);
            if (!hasAccess) return null;
        }
        return board;
    }

    async getSharesForBoard(boardId: string, userId: string) {
        const board = await boardRepository.getBoardById(boardId);
        if (!board || board.ownerId !== userId) {
            throw new Error("Unauthorized to view shares for this board");
        }
        return await boardRepository.getSharesForBoard(boardId);
    }

    async shareBoard(boardId: string, ownerId: string, targetEmail: string, role: 'VIEWER' | 'EDITOR') {
        const board = await boardRepository.getBoardById(boardId);
        if (!board || board.ownerId !== ownerId) {
            throw new Error("Unauthorized to share this board");
        }
        return await boardRepository.addShare(boardId, targetEmail, role);
    }

    async renameBoard(boardId: string, newName: string, userId: string) {
        const board = await boardRepository.getBoardById(boardId);
        if (!board) throw new Error("Board not found");

        // Ensure either the owner or an editor is doing the renaming
        if (board.ownerId !== userId) {
            const hasAccess = await boardRepository.checkUserAccess(boardId, userId);
            if (!hasAccess) throw new Error("Unauthorized to rename this board");
            // Optionally, check if role === 'EDITOR' if we want to limit renaming
        }

        await boardRepository.renameBoard(boardId, newName);

        logger.info(`Board ${boardId} renamed to ${newName} by User: ${userId}`);
        eventBus.emitEvent('BOARD_RENAMED', { boardId, name: newName, userId });
    }
}

export const boardService = new BoardService();
