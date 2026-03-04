export interface CanvasEntity {
    id: string;
    type: string;
    transform: {
        x: number;
        y: number;
        scaleX: number;
        scaleY: number;
        rotation: number;
    };
    props: Record<string, any>;
    metadata: Record<string, any>;
    visible: boolean;
    parentId?: string;
}

export interface Board {
    id: string;
    projectId?: string;
    ownerId?: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    // In a real DB, entities wouldn't be fetched like this directly, 
    // but for the mock it's helpful.
    entities?: CanvasEntity[];
}
