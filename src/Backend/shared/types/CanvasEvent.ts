export interface CanvasEvent {
    id: string;
    boardId: string;
    type: string;
    payload: Record<string, any>;
    createdAt: string;
}
