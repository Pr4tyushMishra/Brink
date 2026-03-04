export type Point = { x: number; y: number };
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };
export type HandleType = 'tl' | 'tr' | 'bl' | 'br';
export type AnchorPosition = 't' | 'r' | 'b' | 'l' | 'c';

export const FRAME_PRESETS: Record<string, { w: number, h: number }> = {
    'A4': { w: 595, h: 842 },
    'Letter': { w: 612, h: 792 },
    '16:9': { w: 1920, h: 1080 },
    '4:3': { w: 1024, h: 768 },
    '1:1': { w: 1080, h: 1080 },
    'Mobile': { w: 390, h: 844 },
    'Tablet': { w: 834, h: 1194 },
    'Desktop': { w: 1440, h: 1024 }
};

export interface Transform {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
}

export interface CanvasEntity {
    id: string;
    type: string;
    transform: Transform;
    props: Record<string, any>;
    metadata: Record<string, any>;
    visible: boolean;
    parentId?: string; // Links this entity to a container frame
}

export const getAnchorPoint = (bbox: BBox, pos: AnchorPosition): Point => {
    switch (pos) {
        case 't': return { x: (bbox.minX + bbox.maxX) / 2, y: bbox.minY };
        case 'r': return { x: bbox.maxX, y: (bbox.minY + bbox.maxY) / 2 };
        case 'b': return { x: (bbox.minX + bbox.maxX) / 2, y: bbox.maxY };
        case 'l': return { x: bbox.minX, y: (bbox.minY + bbox.maxY) / 2 };
        case 'c': return { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
    }
};
