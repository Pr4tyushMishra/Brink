import React, { useEffect, useRef, useState } from 'react';
import { MousePointer2, Square, StickyNote, ZoomIn, ZoomOut, Maximize, Trash2, Type, Circle, Minus, Frame as FrameIcon, Triangle, Diamond, ArrowRight, Shapes, ArrowLeft, Download, Upload } from 'lucide-react';
import type { Board } from './types';

// ============================================================================
// CORE TYPES & MATH
// ============================================================================

type Point = { x: number; y: number };
type BBox = { minX: number; minY: number; maxX: number; maxY: number };
type HandleType = 'tl' | 'tr' | 'bl' | 'br';
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

interface Transform {
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

// ============================================================================
// ARCHITECTURE: EVENT BUS
// ============================================================================
type EventCallback = (payload: any) => void;

class EventBus {
    private listeners = new Map<string, Set<EventCallback>>();

    on(event: string, callback: EventCallback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
    }

    off(event: string, callback: EventCallback) {
        this.listeners.get(event)?.delete(callback);
    }

    emit(event: string, payload?: any) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach((cb) => {
                try { cb(payload); }
                catch (error) { console.error(`[EventBus] Error in listener for event '${event}':`, error); }
            });
        }
    }
}

export const EVENTS = {
    ENTITY_CREATED: 'entity:created',
    ENTITY_UPDATED: 'entity:updated',
    ENTITY_DELETED: 'entity:deleted',
    SCENE_CLEARED: 'scene:cleared',
    SELECTION_CHANGED: 'selection:changed',
    TOOL_CHANGED: 'tool:changed',
    REQUEST_IMAGE_UPLOAD: 'request:image:upload'
};

// ============================================================================
// ARCHITECTURE: PLUGGABLE REGISTRIES
// ============================================================================

export interface ObjectTypeDefinition {
    type: string;
    render: (ctx: CanvasRenderingContext2D, entity: CanvasEntity) => void;
    hitTest: (entity: CanvasEntity, wx: number, wy: number) => boolean;
    getBBox: (entity: CanvasEntity) => BBox;
}

export interface FeatureModule {
    name: string;
    init: (sceneManager: SceneManager, eventBus: EventBus) => void;
    destroy: () => void;
}

// ============================================================================
// ARCHITECTURE: SCENE MANAGER
// ============================================================================
class SceneManager {
    private entities = new Map<string, CanvasEntity>();
    private objectTypes = new Map<string, ObjectTypeDefinition>();
    private modules = new Map<string, FeatureModule>();
    public events = new EventBus();

    registerObjectType(def: ObjectTypeDefinition) {
        this.objectTypes.set(def.type, def);
    }

    getObjectType(type: string): ObjectTypeDefinition | undefined {
        return this.objectTypes.get(type);
    }

    registerFeatureModule(module: FeatureModule) {
        if (this.modules.has(module.name)) return;
        try {
            module.init(this, this.events);
            this.modules.set(module.name, module);
        } catch (error) {
            console.error(`Failed to initialize module ${module.name}:`, error);
        }
    }

    unregisterFeatureModule(moduleName: string) {
        const module = this.modules.get(moduleName);
        if (module) {
            try { module.destroy(); } catch (error) { }
            this.modules.delete(moduleName);
        }
    }

    createObject(type: string, props: Record<string, any> = {}, transform?: Partial<Transform>, metadata: Record<string, any> = {}, parentId?: string): string {
        const id = crypto.randomUUID();
        const entity: CanvasEntity = {
            id, type,
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...transform },
            props, metadata, visible: true, parentId
        };

        this.entities.set(id, entity);
        this.events.emit(EVENTS.ENTITY_CREATED, entity);
        return id;
    }

    updateObject(id: string, updates: Partial<Pick<CanvasEntity, 'props' | 'metadata' | 'visible' | 'parentId'>> & { transform?: Partial<Transform> }) {
        const entity = this.entities.get(id);
        if (!entity) return;

        const updatedEntity = {
            ...entity, ...updates,
            transform: updates.transform ? { ...entity.transform, ...updates.transform } : entity.transform,
            props: updates.props ? { ...entity.props, ...updates.props } : entity.props,
            metadata: updates.metadata ? { ...entity.metadata, ...updates.metadata } : entity.metadata,
        };

        this.entities.set(id, updatedEntity);
        this.events.emit(EVENTS.ENTITY_UPDATED, { old: entity, new: updatedEntity });
    }

    deleteObject(id: string) {
        const entity = this.entities.get(id);
        if (entity) {
            this.entities.delete(id);
            this.events.emit(EVENTS.ENTITY_DELETED, entity);
        }
    }

    getObject(id: string): CanvasEntity | undefined {
        return this.entities.get(id);
    }

    getAllObjects(): CanvasEntity[] {
        return Array.from(this.entities.values());
    }

    loadData(objects: CanvasEntity[]) {
        this.entities.clear();
        objects.forEach(obj => this.entities.set(obj.id, obj));
    }
}

// ============================================================================
// FEATURE MODULES
// ============================================================================

class SelectionModule implements FeatureModule {
    name = 'SelectionModule';
    private sceneManager!: SceneManager;
    private eventBus!: EventBus;
    private selectedIds = new Set<string>();

    init(sceneManager: SceneManager, eventBus: EventBus) {
        this.sceneManager = sceneManager;
        this.eventBus = eventBus;
        this.eventBus.on(EVENTS.ENTITY_DELETED, this.onEntityDeleted);
    }

    destroy() {
        this.eventBus.off(EVENTS.ENTITY_DELETED, this.onEntityDeleted);
        this.selectedIds.clear();
    }

    private onEntityDeleted = (entity: CanvasEntity) => {
        if (this.selectedIds.has(entity.id)) {
            this.selectedIds.delete(entity.id);
            this.broadcastSelection();
        }
    };

    select(id: string, multi = false) {
        if (!multi) {
            this.selectedIds.forEach(sid => this.sceneManager.updateObject(sid, { metadata: { selected: false } }));
            this.selectedIds.clear();
        }
        this.selectedIds.add(id);
        this.sceneManager.updateObject(id, { metadata: { selected: true } });
        this.broadcastSelection();
    }

    clearSelection() {
        this.selectedIds.forEach(sid => this.sceneManager.updateObject(sid, { metadata: { selected: false } }));
        this.selectedIds.clear();
        this.broadcastSelection();
    }

    deleteSelected() {
        Array.from(this.selectedIds).forEach(id => this.sceneManager.deleteObject(id));
        this.clearSelection();
    }

    getSelectedIds(): string[] {
        return Array.from(this.selectedIds);
    }

    private broadcastSelection() {
        this.eventBus.emit(EVENTS.SELECTION_CHANGED, this.getSelectedIds());
    }
}

class ConnectionModule implements FeatureModule {
    name = 'ConnectionModule';
    private sceneManager!: SceneManager;
    private eventBus!: EventBus;

    init(sceneManager: SceneManager, eventBus: EventBus) {
        this.sceneManager = sceneManager;
        this.eventBus = eventBus;
        this.eventBus.on(EVENTS.ENTITY_UPDATED, this.onEntityUpdated);
    }

    destroy() {
        this.eventBus.off(EVENTS.ENTITY_UPDATED, this.onEntityUpdated);
    }

    private onEntityUpdated = ({ old, new: entity }: { old: CanvasEntity, new: CanvasEntity }) => {
        if (entity.type !== 'LINE' && entity.type !== 'ARROW') {
            const lines = this.sceneManager.getAllObjects().filter(o =>
                (o.type === 'LINE' || o.type === 'ARROW') &&
                (o.props.startConnectedId === entity.id || o.props.endConnectedId === entity.id)
            );
            lines.forEach(line => this.updateLineConnections(line));
        }
    };

    public updateLineConnections(line: CanvasEntity) {
        let s = line.props.start || { x: line.transform.x, y: line.transform.y };
        let e = line.props.end || { x: line.transform.x + line.props.width, y: line.transform.y + line.props.height };

        if (line.props.startConnectedId) {
            const startObj = this.sceneManager.getObject(line.props.startConnectedId);
            const typeDef = startObj ? this.sceneManager.getObjectType(startObj.type) : null;
            if (startObj && typeDef) {
                s = getAnchorPoint(typeDef.getBBox(startObj), line.props.startAnchor || 'c');
            }
        }
        if (line.props.endConnectedId) {
            const endObj = this.sceneManager.getObject(line.props.endConnectedId);
            const typeDef = endObj ? this.sceneManager.getObjectType(endObj.type) : null;
            if (endObj && typeDef) {
                e = getAnchorPoint(typeDef.getBBox(endObj), line.props.endAnchor || 'c');
            }
        }

        const minX = Math.min(s.x, e.x);
        const minY = Math.min(s.y, e.y);
        const width = Math.abs(e.x - s.x);
        const height = Math.abs(e.y - s.y);

        this.sceneManager.updateObject(line.id, {
            transform: { x: minX, y: minY },
            props: { ...line.props, width, height, start: s, end: e }
        });
    }
}

// ============================================================================
// OBJECT TYPE DEFINITIONS
// ============================================================================

const RectangleType: ObjectTypeDefinition = {
    type: 'RECTANGLE',
    getBBox: (e) => ({
        minX: e.transform.x, minY: e.transform.y,
        maxX: e.transform.x + e.props.width, maxY: e.transform.y + e.props.height,
    }),
    hitTest: (e, wx, wy) => {
        return wx >= e.transform.x && wx <= e.transform.x + e.props.width &&
            wy >= e.transform.y && wy <= e.transform.y + e.props.height;
    },
    render: (ctx, e) => {
        ctx.fillStyle = e.props.color || '#60a5fa';
        ctx.beginPath();
        ctx.roundRect(e.transform.x, e.transform.y, e.props.width, e.props.height, 12);
        ctx.fill();

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
};

const ImageCache = new Map<string, HTMLImageElement>();
const ImageType: ObjectTypeDefinition = {
    type: 'IMAGE',
    getBBox: RectangleType.getBBox,
    hitTest: RectangleType.hitTest,
    render: (ctx, e) => {
        const src = e.props.src;
        if (!src) return;
        let img = ImageCache.get(src);
        if (!img) {
            img = new Image();
            img.src = src;
            img.onload = () => { window.dispatchEvent(new Event('canvas-dirty')); };
            ImageCache.set(src, img);
        }

        if (img.complete) {
            ctx.drawImage(img, e.transform.x, e.transform.y, e.props.width, e.props.height);
        } else {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
            ctx.fillStyle = '#64748b';
            ctx.font = '14px sans-serif';
            ctx.fillText("Loading...", e.transform.x + 10, e.transform.y + 20);
        }

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
        }
    }
};

const StickyNoteType: ObjectTypeDefinition = {
    type: 'STICKY_NOTE',
    getBBox: RectangleType.getBBox,
    hitTest: RectangleType.hitTest,
    render: (ctx, e) => {
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;

        ctx.fillStyle = e.props.color || '#fef08a';
        ctx.fillRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
        ctx.shadowColor = 'transparent';

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
        }

        const scale = e.props.width / 200;
        const fontSize = Math.max(16 * scale, 4);
        const padding = 16 * scale;
        const lineHeight = 22 * scale;

        ctx.fillStyle = '#1f2937';
        ctx.font = `${fontSize}px "Inter", sans-serif`;
        ctx.textBaseline = 'top';
        const maxWidth = e.props.width - padding * 2;

        const text = e.props.text || '';
        const lines = text.split('\n');
        let currentY = e.transform.y + padding;

        for (const line of lines) {
            const words = line.split(' ');
            let currentLine = '';
            for (let n = 0; n < words.length; n++) {
                const testLine = currentLine + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && n > 0) {
                    ctx.fillText(currentLine, e.transform.x + padding, currentY);
                    currentLine = words[n] + ' ';
                    currentY += lineHeight;
                } else {
                    currentLine = testLine;
                }
            }
            ctx.fillText(currentLine, e.transform.x + padding, currentY);
            currentY += lineHeight;
        }
    }
};

const TextType: ObjectTypeDefinition = {
    type: 'TEXT',
    getBBox: RectangleType.getBBox,
    hitTest: RectangleType.hitTest,
    render: (ctx, e) => {
        ctx.fillStyle = e.props.color || '#1e293b';
        ctx.font = `20px "Inter", sans-serif`;
        ctx.textBaseline = 'top';

        const padding = 8;
        const lineHeight = 28;
        const maxWidth = e.props.width - padding * 2;
        const text = e.props.text || '';
        const lines = text.split('\n');
        let currentY = e.transform.x + padding;

        for (const line of lines) {
            const words = line.split(' ');
            let currentLine = '';
            for (let n = 0; n < words.length; n++) {
                const testLine = currentLine + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && n > 0) {
                    ctx.fillText(currentLine, e.transform.x + padding, currentY);
                    currentLine = words[n] + ' ';
                    currentY += lineHeight;
                } else {
                    currentLine = testLine;
                }
            }
            ctx.fillText(currentLine, e.transform.x + padding, currentY);
            currentY += lineHeight;
        }

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
            ctx.setLineDash([]);
        }
    }
};

const EllipseType: ObjectTypeDefinition = {
    type: 'ELLIPSE',
    getBBox: RectangleType.getBBox,
    hitTest: RectangleType.hitTest,
    render: (ctx, e) => {
        const rx = e.props.width / 2;
        const ry = e.props.height / 2;
        const cx = e.transform.x + rx;
        const cy = e.transform.y + ry;

        ctx.fillStyle = e.props.color || '#fca5a5';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.fill();

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
};

const TriangleType: ObjectTypeDefinition = {
    type: 'TRIANGLE',
    getBBox: RectangleType.getBBox,
    hitTest: RectangleType.hitTest,
    render: (ctx, e) => {
        ctx.fillStyle = e.props.color || '#86efac';
        ctx.beginPath();
        ctx.moveTo(e.transform.x + e.props.width / 2, e.transform.y);
        ctx.lineTo(e.transform.x + e.props.width, e.transform.y + e.props.height);
        ctx.lineTo(e.transform.x, e.transform.y + e.props.height);
        ctx.closePath();
        ctx.fill();

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
};

const DiamondType: ObjectTypeDefinition = {
    type: 'DIAMOND',
    getBBox: RectangleType.getBBox,
    hitTest: RectangleType.hitTest,
    render: (ctx, e) => {
        ctx.fillStyle = e.props.color || '#d8b4fe';
        ctx.beginPath();
        ctx.moveTo(e.transform.x + e.props.width / 2, e.transform.y);
        ctx.lineTo(e.transform.x + e.props.width, e.transform.y + e.props.height / 2);
        ctx.lineTo(e.transform.x + e.props.width / 2, e.transform.y + e.props.height);
        ctx.lineTo(e.transform.x, e.transform.y + e.props.height / 2);
        ctx.closePath();
        ctx.fill();

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
};

const getCurvePoints = (s: Point, e: Point, sAnchor?: AnchorPosition, eAnchor?: AnchorPosition) => {
    const dx = Math.abs(e.x - s.x);
    const dy = Math.abs(e.y - s.y);
    const dist = Math.max(dx, dy) * 0.5 + 20;

    const getCP = (pt: Point, anchor?: AnchorPosition, isStart = true) => {
        if (!anchor || anchor === 'c') {
            if (isStart) return Math.abs(e.x - s.x) > Math.abs(e.y - s.y) ? { x: pt.x + (e.x - s.x) * 0.5, y: pt.y } : { x: pt.x, y: pt.y + (e.y - s.y) * 0.5 };
            else return Math.abs(e.x - s.x) > Math.abs(e.y - s.y) ? { x: pt.x - (e.x - s.x) * 0.5, y: pt.y } : { x: pt.x, y: pt.y - (e.y - s.y) * 0.5 };
        }
        switch (anchor) {
            case 't': return { x: pt.x, y: pt.y - dist };
            case 'r': return { x: pt.x + dist, y: pt.y };
            case 'b': return { x: pt.x, y: pt.y + dist };
            case 'l': return { x: pt.x - dist, y: pt.y };
        }
    };

    const cp1 = getCP(s, sAnchor, true);
    const cp2 = getCP(e, eAnchor, false);

    return { cp1x: cp1.x, cp1y: cp1.y, cp2x: cp2.x, cp2y: cp2.y };
};

const getStartEnd = (e: CanvasEntity) => {
    if (e.props.start && e.props.end) return { s: e.props.start, e_pt: e.props.end };
    let s, e_pt;
    if (e.props.direction === 'sw-ne') {
        s = { x: e.transform.x, y: e.transform.y + e.props.height };
        e_pt = { x: e.transform.x + e.props.width, y: e.transform.y };
    } else {
        s = { x: e.transform.x, y: e.transform.y };
        e_pt = { x: e.transform.x + e.props.width, y: e.transform.y + e.props.height };
    }
    return { s, e_pt };
};

const LineType: ObjectTypeDefinition = {
    type: 'LINE',
    getBBox: RectangleType.getBBox,
    hitTest: (e, wx, wy) => {
        return wx >= e.transform.x - 10 && wx <= e.transform.x + e.props.width + 10 &&
            wy >= e.transform.y - 10 && wy <= e.transform.y + e.props.height + 10;
    },
    render: (ctx, e) => {
        ctx.strokeStyle = e.props.color || '#64748b';
        ctx.lineWidth = 4;

        const { s, e_pt } = getStartEnd(e);
        const cp = getCurvePoints(s, e_pt, e.props.startAnchor, e.props.endAnchor);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.bezierCurveTo(cp.cp1x, cp.cp1y, cp.cp2x, cp.cp2y, e_pt.x, e_pt.y);
        ctx.stroke();

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
            ctx.setLineDash([]);
        }
    }
};

const ArrowType: ObjectTypeDefinition = {
    type: 'ARROW',
    getBBox: RectangleType.getBBox,
    hitTest: LineType.hitTest,
    render: (ctx, e) => {
        ctx.strokeStyle = e.props.color || '#64748b';
        ctx.fillStyle = e.props.color || '#64748b';
        ctx.lineWidth = 4;

        const { s, e_pt } = getStartEnd(e);
        const cp = getCurvePoints(s, e_pt, e.props.startAnchor, e.props.endAnchor);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.bezierCurveTo(cp.cp1x, cp.cp1y, cp.cp2x, cp.cp2y, e_pt.x, e_pt.y);
        ctx.stroke();

        let dx = e_pt.x - cp.cp2x;
        let dy = e_pt.y - cp.cp2y;
        if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) { dx = e_pt.x - s.x; dy = e_pt.y - s.y; }

        const angle = Math.atan2(dy, dx);
        const headlen = 15;
        ctx.beginPath();
        ctx.moveTo(e_pt.x, e_pt.y);
        ctx.lineTo(e_pt.x - headlen * Math.cos(angle - Math.PI / 6), e_pt.y - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(e_pt.x - headlen * Math.cos(angle + Math.PI / 6), e_pt.y - headlen * Math.sin(angle + Math.PI / 6));
        ctx.fill();

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
            ctx.setLineDash([]);
        }
    }
};

const FrameType: ObjectTypeDefinition = {
    type: 'FRAME',
    getBBox: RectangleType.getBBox,
    hitTest: RectangleType.hitTest,
    render: (ctx, e) => {
        const isDevice = ['Mobile', 'Tablet', 'Desktop'].includes(e.props.name);

        if (isDevice) {
            // Device Bezel Rendering
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            const radius = e.props.name === 'Desktop' ? 12 : 36;
            ctx.roundRect(e.transform.x, e.transform.y, e.props.width, e.props.height, radius);
            ctx.fill();

            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Inner Screen Area Base
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.roundRect(e.transform.x + 4, e.transform.y + 4, e.props.width - 8, e.props.height - 8, radius > 8 ? radius - 4 : 0);
            ctx.fill();

            // Top Action Bar for Text and Images
            ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
            ctx.beginPath();
            ctx.roundRect(e.transform.x + 4, e.transform.y + 4, e.props.width - 8, 40, radius > 8 ? [radius - 4, radius - 4, 0, 0] : 0);
            ctx.fill();

            const btnY = e.transform.y + 12;
            const txtBtnX = e.transform.x + 12;
            const imgBtnX = e.transform.x + 86;

            ctx.fillStyle = '#ffffff';
            ctx.roundRect(txtBtnX, btnY, 66, 24, 4);
            ctx.roundRect(imgBtnX, btnY, 66, 24, 4);
            ctx.fill();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = '#475569';
            ctx.font = '12px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+ Text', txtBtnX + 33, btnY + 13);
            ctx.fillText('+ Image', imgBtnX + 33, btnY + 13);
            ctx.textAlign = 'left';

            // Mobile Notch
            if (e.props.name === 'Mobile') {
                ctx.fillStyle = '#e2e8f0';
                ctx.beginPath();
                ctx.roundRect(e.transform.x + e.props.width / 2 - 40, e.transform.y + 8, 80, 20, 10);
                ctx.fill();
            }

            ctx.fillStyle = '#94a3b8';
            ctx.font = '500 12px "Inter", sans-serif';
            ctx.textBaseline = 'bottom';
            ctx.fillText(e.props.name, e.transform.x, e.transform.y - 8);

        } else {
            // Standard Frame Rendering
            ctx.fillStyle = '#64748b';
            ctx.font = '600 14px "Inter", sans-serif';
            ctx.textBaseline = 'bottom';
            ctx.fillText(e.props.name || 'Frame', e.transform.x, e.transform.y - 6);

            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.strokeRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
            ctx.setLineDash([]);
        }

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2;
            ctx.strokeRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
        }
    }
};

// ============================================================================
// ARCHITECTURE: CAMERA & RENDERER
// ============================================================================

class Camera {
    x = 0; y = 0; zoom = 1;
    screenToWorld(sx: number, sy: number): Point { return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y }; }
    worldToScreen(wx: number, wy: number): Point { return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom }; }
}

class Renderer {
    static drawSelectionHandles(ctx: CanvasRenderingContext2D, bbox: BBox, zoom: number) {
        const handleSize = 10 / zoom;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2 / zoom;

        const drawHandle = (x: number, y: number) => {
            ctx.beginPath();
            ctx.rect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
            ctx.fill(); ctx.stroke();
        };

        drawHandle(bbox.minX, bbox.minY);
        drawHandle(bbox.maxX, bbox.minY);
        drawHandle(bbox.minX, bbox.maxY);
        drawHandle(bbox.maxX, bbox.maxY);
    }

    static drawConnectionAnchors(ctx: CanvasRenderingContext2D, bbox: BBox, zoom: number, hoveredAnchor: AnchorPosition | null) {
        const radius = 5 / zoom;
        const drawA = (pos: AnchorPosition) => {
            const p = getAnchorPoint(bbox, pos);
            ctx.fillStyle = pos === hoveredAnchor ? '#3b82f6' : '#ffffff';
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        };
        drawA('t'); drawA('r'); drawA('b'); drawA('l');
    }

    static drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, camera: Camera) {
        const scaledGridSize = 40 * camera.zoom;
        if (scaledGridSize < 8) return;
        const startX = -((camera.x * camera.zoom) % scaledGridSize);
        const startY = -((camera.y * camera.zoom) % scaledGridSize);
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = startX; x < width; x += scaledGridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = startY; y < height; y += scaledGridSize) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke();
    }

    static render(ctx: CanvasRenderingContext2D, width: number, height: number, camera: Camera, scene: SceneManager, state: { hoveredId: string | null, hoveredAnchor: AnchorPosition | null }) {
        const cameraBBox: BBox = {
            minX: camera.screenToWorld(0, 0).x, minY: camera.screenToWorld(0, 0).y,
            maxX: camera.screenToWorld(width, height).x, maxY: camera.screenToWorld(width, height).y
        };

        ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, width, height);
        Renderer.drawGrid(ctx, width, height, camera);

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        const entities = scene.getAllObjects();
        const selectedEntities: { entity: CanvasEntity; typeDef: ObjectTypeDefinition }[] = [];

        // Z-Index Sorting logic & Parent-Child grouping
        const frames: CanvasEntity[] = [];
        const lines: CanvasEntity[] = [];
        const rootShapes: CanvasEntity[] = [];
        const childrenByParent = new Map<string, CanvasEntity[]>();

        for (const entity of entities) {
            if (!entity.visible) continue;

            if (entity.parentId) {
                if (!childrenByParent.has(entity.parentId)) childrenByParent.set(entity.parentId, []);
                childrenByParent.get(entity.parentId)!.push(entity);
            } else if (entity.type === 'FRAME') {
                frames.push(entity);
            } else if (entity.type === 'LINE' || entity.type === 'ARROW') {
                lines.push(entity);
            } else {
                rootShapes.push(entity);
            }
        }

        const drawEntity = (entity: CanvasEntity) => {
            const typeDef = scene.getObjectType(entity.type);
            if (!typeDef) return;
            const box = typeDef.getBBox(entity);
            if (box.maxX < cameraBBox.minX || box.minX > cameraBBox.maxX || box.maxY < cameraBBox.minY || box.minY > cameraBBox.maxY) return;

            try { typeDef.render(ctx, entity); } catch (err) { }

            if (entity.metadata.selected) selectedEntities.push({ entity, typeDef });

            if (entity.id === state.hoveredId && entity.type !== 'LINE' && entity.type !== 'ARROW' && entity.type !== 'FRAME') {
                Renderer.drawConnectionAnchors(ctx, box, camera.zoom, state.hoveredAnchor);
            }
        };

        // Render Frames and precisely clip their explicitly added children
        for (const frame of frames) {
            drawEntity(frame);

            const children = childrenByParent.get(frame.id);
            if (children && children.length > 0) {
                ctx.save();
                const isDevice = ['Mobile', 'Tablet', 'Desktop'].includes(frame.props.name);
                ctx.beginPath();
                if (isDevice) {
                    const radius = frame.props.name === 'Desktop' ? 12 : 36;
                    ctx.roundRect(frame.transform.x + 4, frame.transform.y + 4, frame.props.width - 8, frame.props.height - 8, radius > 8 ? radius - 4 : 0);
                } else {
                    ctx.rect(frame.transform.x, frame.transform.y, frame.props.width, frame.props.height);
                }
                ctx.clip(); // Mask applied

                children.forEach(drawEntity);
                ctx.restore();
            }
        }

        lines.forEach(drawEntity);
        rootShapes.forEach(drawEntity);

        for (const { entity, typeDef } of selectedEntities) {
            if (entity.type !== 'LINE' && entity.type !== 'ARROW') {
                try { Renderer.drawSelectionHandles(ctx, typeDef.getBBox(entity), camera.zoom); } catch (err) { }
                if (entity.type !== 'FRAME') {
                    Renderer.drawConnectionAnchors(ctx, typeDef.getBBox(entity), camera.zoom, state.hoveredAnchor);
                }
            }
        }
        ctx.restore();
    }
}

// ============================================================================
// ARCHITECTURE: ENGINE GLUE
// ============================================================================
export type ToolType = 'SELECT' | 'RECT' | 'STICKY' | 'TEXT' | 'ELLIPSE' | 'TRIANGLE' | 'DIAMOND' | 'LINE' | 'ARROW' | 'FRAME';

class CanvasEngine {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    camera = new Camera();
    scene = new SceneManager();

    isDirty = true;
    activeTool: ToolType = 'SELECT';
    animationFrameId = 0;
    width = 0; height = 0;

    isPanning = false;
    lastMouse: Point = { x: 0, y: 0 };
    draggedEntityId: string | null = null;
    draggedChildrenIds: string[] = [];
    dragOffset: Point = { x: 0, y: 0 };

    creatingEntityId: string | null = null;
    createStartPoint: Point | null = null;

    isResizing = false;
    resizeHandle: HandleType | null = null;
    resizeOriginal: { x: number, y: number, w: number, h: number } | null = null;

    framePreset: string | null = null;

    hoveredEntityId: string | null = null;
    hoveredAnchor: AnchorPosition | null = null;

    onToolChange?: (tool: string) => void;
    onZoomChange?: (zoom: number) => void;
    selectionModule: SelectionModule;
    connectionModule: ConnectionModule;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;

        this.scene.registerObjectType(RectangleType);
        this.scene.registerObjectType(StickyNoteType);
        this.scene.registerObjectType(TextType);
        this.scene.registerObjectType(EllipseType);
        this.scene.registerObjectType(TriangleType);
        this.scene.registerObjectType(DiamondType);
        this.scene.registerObjectType(LineType);
        this.scene.registerObjectType(ArrowType);
        this.scene.registerObjectType(FrameType);
        this.scene.registerObjectType(ImageType);

        this.selectionModule = new SelectionModule();
        this.scene.registerFeatureModule(this.selectionModule);

        this.connectionModule = new ConnectionModule();
        this.scene.registerFeatureModule(this.connectionModule);

        const markDirty = () => { this.isDirty = true; };
        this.scene.events.on(EVENTS.ENTITY_CREATED, markDirty);
        this.scene.events.on(EVENTS.ENTITY_UPDATED, markDirty);
        this.scene.events.on(EVENTS.ENTITY_DELETED, markDirty);
        this.scene.events.on(EVENTS.SELECTION_CHANGED, markDirty);
        window.addEventListener('canvas-dirty', markDirty);

        this.setupEvents();
        this.startLoop();
    }

    resize() {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        this.isDirty = true;
    }

    private setupEvents() {
        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    }

    destroy() {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('wheel', this.onWheel);
        window.removeEventListener('canvas-dirty', () => { this.isDirty = true; });
        cancelAnimationFrame(this.animationFrameId);
    }

    private getResizeHandleAt(bbox: BBox, wx: number, wy: number, zoom: number): HandleType | null {
        const hs = (16 / zoom) / 2;
        const hit = (hx: number, hy: number) => wx >= hx - hs && wx <= hx + hs && wy >= hy - hs && wy <= hy + hs;
        if (hit(bbox.minX, bbox.minY)) return 'tl';
        if (hit(bbox.maxX, bbox.minY)) return 'tr';
        if (hit(bbox.minX, bbox.maxY)) return 'bl';
        if (hit(bbox.maxX, bbox.maxY)) return 'br';
        return null;
    }

    private getAnchorAt(bbox: BBox, wx: number, wy: number, zoom: number): AnchorPosition | null {
        const hs = (16 / zoom) / 2;
        const hit = (p: Point) => wx >= p.x - hs && wx <= p.x + hs && wy >= p.y - hs && wy <= p.y + hs;
        if (hit(getAnchorPoint(bbox, 't'))) return 't';
        if (hit(getAnchorPoint(bbox, 'r'))) return 'r';
        if (hit(getAnchorPoint(bbox, 'b'))) return 'b';
        if (hit(getAnchorPoint(bbox, 'l'))) return 'l';
        return null;
    }

    private hitTestGlobal(wx: number, wy: number): CanvasEntity | null {
        const entities = this.scene.getAllObjects();
        for (let i = entities.length - 1; i >= 0; i--) {
            const entity = entities[i];
            const typeDef = this.scene.getObjectType(entity.type);
            if (typeDef && typeDef.hitTest(entity, wx, wy)) return entity;
        }
        return null;
    }

    private hitTestShapes(wx: number, wy: number): CanvasEntity | null {
        const entities = this.scene.getAllObjects();
        for (let i = entities.length - 1; i >= 0; i--) {
            const entity = entities[i];
            if (entity.type === 'LINE' || entity.type === 'ARROW' || entity.type === 'FRAME') continue;
            const typeDef = this.scene.getObjectType(entity.type);
            if (typeDef && typeDef.hitTest(entity, wx, wy)) return entity;
        }
        return null;
    }

    private onPointerDown = (e: PointerEvent) => {
        e.preventDefault();
        this.lastMouse = { x: e.clientX, y: e.clientY };
        const w = this.camera.screenToWorld(e.clientX, e.clientY);

        if (e.button === 1 || (e.button === 0 && e.shiftKey)) { this.isPanning = true; return; }
        if (e.button !== 0) return;

        // 1. Check if clicking Inner Buttons inside a Device Frame
        let buttonHandled = false;
        const deviceFrames = this.scene.getAllObjects().filter(o => o.type === 'FRAME' && ['Mobile', 'Tablet', 'Desktop'].includes(o.props.name));
        for (const frame of deviceFrames) {
            const btnY = frame.transform.y + 12;
            const txtBtnX = frame.transform.x + 12;
            const imgBtnX = frame.transform.x + 86;

            if (w.x >= txtBtnX && w.x <= txtBtnX + 66 && w.y >= btnY && w.y <= btnY + 24) {
                this.scene.createObject('TEXT', { text: "Device Text", color: '#1e293b', width: frame.props.width - 24, height: 50 }, { x: frame.transform.x + 12, y: frame.transform.y + 60 }, {}, frame.id);
                buttonHandled = true;
                break;
            }
            if (w.x >= imgBtnX && w.x <= imgBtnX + 66 && w.y >= btnY && w.y <= btnY + 24) {
                this.scene.events.emit(EVENTS.REQUEST_IMAGE_UPLOAD, frame.id);
                buttonHandled = true;
                break;
            }
        }
        if (buttonHandled) {
            this.isDirty = true;
            this.activeTool = 'SELECT';
            return;
        }

        // 2. Line Anchors Setup
        if (this.hoveredEntityId && this.hoveredAnchor) {
            const hoverObj = this.scene.getObject(this.hoveredEntityId);
            if (hoverObj) {
                const typeDef = this.scene.getObjectType(hoverObj.type);
                this.createStartPoint = getAnchorPoint(typeDef!.getBBox(hoverObj), this.hoveredAnchor);

                const type = (this.activeTool === 'LINE' || this.activeTool === 'ARROW') ? this.activeTool : 'ARROW';

                this.creatingEntityId = this.scene.createObject(type, {
                    color: '#64748b', direction: 'nw-se',
                    startConnectedId: hoverObj.id,
                    startAnchor: this.hoveredAnchor,
                    start: this.createStartPoint
                }, { x: this.createStartPoint.x, y: this.createStartPoint.y });
                return;
            }
        }

        const toolToType: Record<string, string> = {
            'RECT': 'RECTANGLE', 'STICKY': 'STICKY_NOTE', 'ELLIPSE': 'ELLIPSE',
            'TRIANGLE': 'TRIANGLE', 'DIAMOND': 'DIAMOND', 'LINE': 'LINE', 'ARROW': 'ARROW',
            'FRAME': 'FRAME', 'TEXT': 'TEXT'
        };

        if (toolToType[this.activeTool]) {
            this.createStartPoint = { x: w.x, y: w.y };
            const type = toolToType[this.activeTool];

            const defaultProps: Record<string, any> = { width: 0, height: 0 };
            if (type === 'RECTANGLE') defaultProps.color = '#60a5fa';
            if (type === 'STICKY_NOTE') { defaultProps.color = '#fef08a'; defaultProps.text = "New Idea!"; }
            if (type === 'ELLIPSE') defaultProps.color = '#fca5a5';
            if (type === 'TRIANGLE') defaultProps.color = '#86efac';
            if (type === 'DIAMOND') defaultProps.color = '#d8b4fe';
            if (type === 'LINE' || type === 'ARROW') {
                defaultProps.color = '#64748b';
                defaultProps.direction = 'nw-se';
            }
            if (type === 'FRAME') defaultProps.name = this.framePreset ? this.framePreset : ("Section " + Math.floor(Math.random() * 100));
            if (type === 'TEXT') { defaultProps.text = "Double click to edit"; defaultProps.color = '#1e293b'; }

            this.creatingEntityId = this.scene.createObject(type, defaultProps, { x: this.createStartPoint.x, y: this.createStartPoint.y });
            return;
        }

        if (this.activeTool === 'SELECT') {
            const selectedIds = this.selectionModule.getSelectedIds();
            if (selectedIds.length === 1) {
                const entity = this.scene.getObject(selectedIds[0]);
                if (entity && entity.type !== 'LINE' && entity.type !== 'ARROW') {
                    const typeDef = this.scene.getObjectType(entity.type);
                    if (typeDef) {
                        const handle = this.getResizeHandleAt(typeDef.getBBox(entity), w.x, w.y, this.camera.zoom);
                        if (handle) {
                            this.isResizing = true; this.resizeHandle = handle; this.draggedEntityId = entity.id;
                            this.resizeOriginal = { x: entity.transform.x, y: entity.transform.y, w: entity.props.width, h: entity.props.height };
                            return;
                        }
                    }
                }
            }

            const hit = this.hitTestGlobal(w.x, w.y);
            if (hit) {
                this.selectionModule.select(hit.id);

                const isLineOrArrow = hit.type === 'LINE' || hit.type === 'ARROW';
                if (!isLineOrArrow) {
                    this.draggedEntityId = hit.id;
                    this.dragOffset = { x: w.x - hit.transform.x, y: w.y - hit.transform.y };

                    // GROUP DRAGGING
                    if (hit.type === 'FRAME') {
                        const isDevice = ['Mobile', 'Tablet', 'Desktop'].includes(hit.props.name);

                        if (isDevice) {
                            // Device frames explicitly move constrained children
                            this.draggedChildrenIds = this.scene.getAllObjects().filter(o => o.parentId === hit.id).map(o => o.id);
                        } else {
                            // Standard frames spatially contain objects
                            const frameBox = this.scene.getObjectType('FRAME')!.getBBox(hit);
                            this.draggedChildrenIds = this.scene.getAllObjects().filter(o => {
                                if (o.id === hit.id) return false;
                                if (o.parentId === hit.id) return true;
                                if (o.parentId) return false;
                                if ((o.type === 'LINE' || o.type === 'ARROW') && (o.props.startConnectedId || o.props.endConnectedId)) return false;
                                const def = this.scene.getObjectType(o.type);
                                if (!def) return false;
                                const box = def.getBBox(o);
                                return box.minX >= frameBox.minX && box.maxX <= frameBox.maxX &&
                                    box.minY >= frameBox.minY && box.maxY <= frameBox.maxY;
                            }).map(o => o.id);
                        }
                    } else {
                        this.draggedChildrenIds = [];
                    }
                }
            } else {
                this.selectionModule.clearSelection();
                this.isPanning = true;
            }
        }
    };

    private onPointerMove = (e: PointerEvent) => {
        const w = this.camera.screenToWorld(e.clientX, e.clientY);

        if (!this.isPanning && !this.draggedEntityId && !this.isResizing) {
            let cursor = 'default';
            let newHoverId: string | null = null;
            let newHoverAnchor: AnchorPosition | null = null;

            const selectedIds = this.selectionModule.getSelectedIds();
            for (const sid of selectedIds) {
                const obj = this.scene.getObject(sid);
                const def = obj ? this.scene.getObjectType(obj.type) : null;
                if (obj && def && obj.type !== 'LINE' && obj.type !== 'ARROW' && obj.type !== 'FRAME') {
                    const anchor = this.getAnchorAt(def.getBBox(obj), w.x, w.y, this.camera.zoom);
                    if (anchor) { newHoverId = obj.id; newHoverAnchor = anchor; break; }
                }
            }

            if (!newHoverId) {
                const hit = this.hitTestShapes(w.x, w.y);
                if (hit) {
                    newHoverId = hit.id;
                    const typeDef = this.scene.getObjectType(hit.type);
                    if (typeDef) newHoverAnchor = this.getAnchorAt(typeDef.getBBox(hit), w.x, w.y, this.camera.zoom);
                }
            }

            if (this.hoveredEntityId !== newHoverId || this.hoveredAnchor !== newHoverAnchor) {
                this.hoveredEntityId = newHoverId;
                this.hoveredAnchor = newHoverAnchor;
                this.isDirty = true;
            }

            if (newHoverAnchor) {
                cursor = 'crosshair';
            } else if (this.activeTool === 'SELECT') {
                if (selectedIds.length === 1) {
                    const entity = this.scene.getObject(selectedIds[0]);
                    if (entity && entity.type !== 'LINE' && entity.type !== 'ARROW') {
                        const handle = this.getResizeHandleAt(this.scene.getObjectType(entity.type)!.getBBox(entity), w.x, w.y, this.camera.zoom);
                        if (handle === 'tl' || handle === 'br') cursor = 'nwse-resize';
                        else if (handle === 'tr' || handle === 'bl') cursor = 'nesw-resize';
                    }
                }
                if (cursor === 'default') {
                    const hit = this.hitTestGlobal(w.x, w.y);
                    if (hit) {
                        const isLineOrArrow = hit.type === 'LINE' || hit.type === 'ARROW';
                        cursor = isLineOrArrow ? 'pointer' : 'move';
                    }
                }
            } else {
                cursor = 'crosshair';
            }

            // Check device frame inner buttons for hover cursor
            const deviceFrames = this.scene.getAllObjects().filter(o => o.type === 'FRAME' && ['Mobile', 'Tablet', 'Desktop'].includes(o.props.name));
            for (const frame of deviceFrames) {
                const btnY = frame.transform.y + 12;
                const txtBtnX = frame.transform.x + 12;
                const imgBtnX = frame.transform.x + 86;
                if ((w.x >= txtBtnX && w.x <= txtBtnX + 66 && w.y >= btnY && w.y <= btnY + 24) ||
                    (w.x >= imgBtnX && w.x <= imgBtnX + 66 && w.y >= btnY && w.y <= btnY + 24)) {
                    cursor = 'pointer';
                    break;
                }
            }

            this.canvas.style.cursor = cursor;
        }

        if (this.creatingEntityId && this.createStartPoint) {
            const entity = this.scene.getObject(this.creatingEntityId);
            let targetW = w;
            let endConnectedId = null;
            let endAnchor: AnchorPosition | null = null;

            if (entity && (entity.type === 'LINE' || entity.type === 'ARROW')) {
                if (this.hoveredEntityId && this.hoveredEntityId !== this.creatingEntityId) {
                    const hoverObj = this.scene.getObject(this.hoveredEntityId);
                    const typeDef = hoverObj && this.scene.getObjectType(hoverObj.type);
                    if (hoverObj && typeDef) {
                        const anchor = this.hoveredAnchor || 'c';
                        targetW = getAnchorPoint(typeDef.getBBox(hoverObj), anchor);
                        endConnectedId = hoverObj.id;
                        endAnchor = anchor;
                    }
                }
            }

            const minX = Math.min(this.createStartPoint.x, targetW.x);
            const minY = Math.min(this.createStartPoint.y, targetW.y);
            const width = Math.abs(targetW.x - this.createStartPoint.x);
            const height = Math.abs(targetW.y - this.createStartPoint.y);

            const extraProps: any = {};
            if (entity?.type === 'LINE' || entity?.type === 'ARROW') {
                const isNwSe = (targetW.x >= this.createStartPoint.x) === (targetW.y >= this.createStartPoint.y);
                extraProps.direction = isNwSe ? 'nw-se' : 'sw-ne';
                extraProps.end = targetW;
                extraProps.endConnectedId = endConnectedId;
                extraProps.endAnchor = endAnchor;
            }

            this.scene.updateObject(this.creatingEntityId, {
                transform: { x: minX, y: minY },
                props: { width, height, ...extraProps }
            });
            this.lastMouse = { x: e.clientX, y: e.clientY };
            return;
        }

        if (this.isResizing && this.resizeHandle && this.draggedEntityId && this.resizeOriginal) {
            let { x, y, w: width, h: height } = this.resizeOriginal;
            const minSize = 20;

            switch (this.resizeHandle) {
                case 'tl':
                    width = (x + width) - w.x; height = (y + height) - w.y;
                    if (width >= minSize) x = w.x; else width = minSize;
                    if (height >= minSize) y = w.y; else height = minSize;
                    break;
                case 'tr':
                    width = w.x - x; height = (y + height) - w.y;
                    if (width < minSize) width = minSize;
                    if (height >= minSize) y = w.y; else height = minSize;
                    break;
                case 'bl':
                    width = (x + width) - w.x; height = w.y - y;
                    if (width >= minSize) x = w.x; else width = minSize;
                    if (height < minSize) height = minSize;
                    break;
                case 'br':
                    width = w.x - x; height = w.y - y;
                    if (width < minSize) width = minSize;
                    if (height < minSize) height = minSize;
                    break;
            }

            this.scene.updateObject(this.draggedEntityId, { transform: { x, y }, props: { width, height } });
            this.lastMouse = { x: e.clientX, y: e.clientY };
            return;
        }

        if (!this.isPanning && !this.draggedEntityId) return;

        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;

        if (this.isPanning) {
            this.camera.x -= dx / this.camera.zoom; this.camera.y -= dy / this.camera.zoom;
            this.isDirty = true;
        } else if (this.draggedEntityId) {
            const newX = w.x - this.dragOffset.x;
            const newY = w.y - this.dragOffset.y;

            const entity = this.scene.getObject(this.draggedEntityId);
            const updates: any = { transform: { x: newX, y: newY } };

            const deltaX = newX - entity!.transform.x;
            const deltaY = newY - entity!.transform.y;

            this.scene.updateObject(this.draggedEntityId, updates);

            if (this.draggedChildrenIds.length > 0) {
                this.draggedChildrenIds.forEach(childId => {
                    const child = this.scene.getObject(childId);
                    if (child) {
                        this.scene.updateObject(childId, {
                            transform: { x: child.transform.x + deltaX, y: child.transform.y + deltaY }
                        });
                    }
                });
            }
        }
        this.lastMouse = { x: e.clientX, y: e.clientY };
    };

    private onPointerUp = (e: PointerEvent) => {
        if (this.creatingEntityId) {
            const entity = this.scene.getObject(this.creatingEntityId);

            if (entity && (entity.props.width < 10 || entity.props.height < 10)) {
                if (!((entity.type === 'LINE' || entity.type === 'ARROW') && entity.props.endConnectedId)) {
                    const fallbacks: Record<string, { w: number, h: number }> = {
                        'STICKY_NOTE': { w: 200, h: 200 }, 'RECTANGLE': { w: 100, h: 100 },
                        'ELLIPSE': { w: 100, h: 100 }, 'TRIANGLE': { w: 100, h: 100 }, 'DIAMOND': { w: 100, h: 100 },
                        'LINE': { w: 100, h: 100 }, 'ARROW': { w: 100, h: 100 },
                        'FRAME': this.framePreset && FRAME_PRESETS[this.framePreset] ? FRAME_PRESETS[this.framePreset] : { w: 400, h: 300 },
                        'TEXT': { w: 250, h: 50 }
                    };
                    const fb = fallbacks[entity.type] || { w: 100, h: 100 };

                    const propsToUpdate: Record<string, any> = { ...entity.props, width: fb.w, height: fb.h };
                    if (entity.type === 'LINE' || entity.type === 'ARROW') {
                        propsToUpdate.end = { x: entity.transform.x + fb.w, y: entity.transform.y + fb.h };
                    }

                    this.scene.updateObject(this.creatingEntityId, { props: propsToUpdate });
                }
            }

            this.selectionModule.select(this.creatingEntityId);
            this.creatingEntityId = null; this.createStartPoint = null;
            this.switchTool('SELECT');
        }

        this.isPanning = false; this.isResizing = false;
        this.resizeHandle = null; this.resizeOriginal = null;
        this.draggedEntityId = null;
        this.draggedChildrenIds = [];
    };

    private onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (e.ctrlKey) {
            const delta = -e.deltaY * 0.01;
            const newZoom = Math.min(Math.max(this.camera.zoom * (1 + delta), 0.1), 5);
            const wx = e.clientX / this.camera.zoom + this.camera.x;
            const wy = e.clientY / this.camera.zoom + this.camera.y;

            this.camera.zoom = newZoom;
            this.camera.x = wx - e.clientX / this.camera.zoom;
            this.camera.y = wy - e.clientY / this.camera.zoom;
        } else {
            this.camera.x += e.deltaX / this.camera.zoom;
            this.camera.y += e.deltaY / this.camera.zoom;
        }
        if (this.onZoomChange) this.onZoomChange(this.camera.zoom);
        this.isDirty = true;
    };

    switchTool(tool: ToolType, preset: string | null = null) {
        if (tool === 'FRAME' && preset && FRAME_PRESETS[preset]) {
            const { w, h } = FRAME_PRESETS[preset];
            const cx = this.width / 2;
            const cy = this.height / 2;
            const wx = cx / this.camera.zoom + this.camera.x;
            const wy = cy / this.camera.zoom + this.camera.y;

            const id = this.scene.createObject('FRAME',
                { width: w, height: h, name: preset },
                { x: wx - w / 2, y: wy - h / 2 }
            );
            this.selectionModule.select(id);
            this.isDirty = true;
            tool = 'SELECT';
            preset = null;
        }

        this.activeTool = tool;
        this.framePreset = preset;
        this.canvas.style.cursor = tool === 'SELECT' ? 'default' : 'crosshair';
        if (this.onToolChange) this.onToolChange(tool);
        this.scene.events.emit(EVENTS.TOOL_CHANGED, tool);
    }

    addImage(src: string, targetFrameId?: string) {
        const img = new Image();
        img.onload = () => {
            let w = img.width;
            let h = img.height;
            let cx = this.width / 2;
            let cy = this.height / 2;
            let wx = cx / this.camera.zoom + this.camera.x;
            let wy = cy / this.camera.zoom + this.camera.y;
            let parentId = undefined;

            if (targetFrameId) {
                const frame = this.scene.getObject(targetFrameId);
                if (frame) {
                    wx = frame.transform.x + frame.props.width / 2;
                    wy = frame.transform.y + frame.props.height / 2 + 10;

                    const padding = 20;
                    const scaleX = (frame.props.width - padding) / w;
                    const scaleY = (frame.props.height - padding - 40) / h;
                    const scale = Math.min(scaleX, scaleY, 1);
                    w *= scale;
                    h *= scale;
                    parentId = frame.id;
                }
            }

            this.scene.createObject('IMAGE', { src, width: w, height: h }, { x: wx - w / 2, y: wy - h / 2 }, {}, parentId);
            this.isDirty = true;
            window.dispatchEvent(new Event('canvas-dirty'));
        };
        img.src = src;
    }

    exportData(): string {
        return JSON.stringify(this.scene.getAllObjects(), null, 2);
    }

    importData(data: string) {
        try {
            const objects = JSON.parse(data) as CanvasEntity[];
            if (Array.isArray(objects)) {
                this.scene.loadData(objects);
                this.selectionModule.clearSelection();
                this.isDirty = true;
                window.dispatchEvent(new Event('canvas-dirty'));
            }
        } catch (e) {
            console.error("Failed to parse board data", e);
        }
    }

    zoomTo(zoom: number) {
        const cx = this.width / 2; const cy = this.height / 2;
        const wx = cx / this.camera.zoom + this.camera.x;
        const wy = cy / this.camera.zoom + this.camera.y;
        this.camera.zoom = zoom;
        this.camera.x = wx - cx / this.camera.zoom;
        this.camera.y = wy - cy / this.camera.zoom;
        if (this.onZoomChange) this.onZoomChange(this.camera.zoom);
        this.isDirty = true;
    }

    private startLoop = () => {
        if (this.isDirty) {
            const dpr = window.devicePixelRatio || 1;
            this.ctx.save();
            this.ctx.scale(dpr, dpr);
            Renderer.render(this.ctx, this.width, this.height, this.camera, this.scene, {
                hoveredId: this.hoveredEntityId,
                hoveredAnchor: this.hoveredAnchor
            });
            this.ctx.restore();
            this.isDirty = false;
        }
        this.animationFrameId = requestAnimationFrame(this.startLoop);
    };
}

// ============================================================================
// CANVAS EDITOR COMPONENT (Re-packaged as BoardView)
// ============================================================================
export function BoardEditor({ board, onBack, onRename }: { board: Board, onBack: () => void, onRename?: (newName: string) => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<CanvasEngine | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const targetFrameRef = useRef<string | null>(null);

    const [activeTool, setActiveTool] = useState<ToolType>('SELECT');
    const [zoomLevel, setZoomLevel] = useState(1);
    const [showShapeMenu, setShowShapeMenu] = useState(false);
    const [showFrameMenu, setShowFrameMenu] = useState(false);

    // Board renaming state
    const [isEditingName, setIsEditingName] = useState(false);
    const [boardName, setBoardName] = useState(board.name);

    useEffect(() => {
        setBoardName(board.name);
    }, [board.name]);

    const handleRenameSubmit = () => {
        setIsEditingName(false);
        if (boardName.trim() !== '' && boardName !== board.name) {
            if (onRename) onRename(boardName.trim());
        } else {
            setBoardName(board.name); // revert if empty
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleRenameSubmit();
        if (e.key === 'Escape') {
            setBoardName(board.name);
            setIsEditingName(false);
        }
    };

    useEffect(() => {
        if (!canvasRef.current) return;
        const engine = new CanvasEngine(canvasRef.current);
        engineRef.current = engine;

        engine.onToolChange = (tool) => setActiveTool(tool as any);
        engine.onZoomChange = (z) => setZoomLevel(z);

        const handleImageRequest = (frameId: string) => {
            targetFrameRef.current = frameId;
            fileInputRef.current?.click();
        };
        engine.scene.events.on(EVENTS.REQUEST_IMAGE_UPLOAD, handleImageRequest);

        // Only inject default content for the original mock boards.
        // Newly created boards (with random UUIDs) will be completely blank!
        if (board.id === 'b1') {
            engine.scene.createObject('STICKY_NOTE', { width: 250, height: 180, text: `Welcome to ${board.name}!\n\nUse the sidebar to add frames, shapes, and notes.`, color: '#bbf7d0' }, { x: 0, y: 0 });
        } else if (board.id === 'b2') {
            const frameId = engine.scene.createObject('FRAME', { width: 390, height: 844, name: 'Mobile' }, { x: -50, y: -50 });
            engine.scene.createObject('TEXT', { text: "Mobile Landing Mockup", color: '#1e293b', width: 350, height: 50 }, { x: -30, y: 100 }, {}, frameId);
        } else if (board.id === 'b3') {
            engine.scene.createObject('RECTANGLE', { width: 250, height: 150, color: '#e2e8f0' }, { x: -100, y: -50 });
            engine.scene.createObject('ELLIPSE', { width: 150, height: 150, color: '#fca5a5' }, { x: 250, y: -50 });
            engine.scene.createObject('ARROW', { width: 100, height: 0, color: '#64748b', direction: 'nw-se', startConnectedId: engine.scene.getAllObjects()[0].id, endConnectedId: engine.scene.getAllObjects()[1].id, startAnchor: 'r', endAnchor: 'l' }, { x: 0, y: 0 });
            engine.connectionModule.updateLineConnections(engine.scene.getAllObjects().find(o => o.type === 'ARROW')!);
        }

        engine.isDirty = true;

        const handleResize = () => engine.resize();
        window.addEventListener('resize', handleResize);
        handleResize();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                engine.selectionModule.deleteSelected();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            engine.scene.events.off(EVENTS.REQUEST_IMAGE_UPLOAD, handleImageRequest);
            engine.destroy();
        };
    }, [board.id]);

    const setTool = (tool: ToolType, preset: string | null = null) => {
        setActiveTool(tool);
        if (engineRef.current) engineRef.current.switchTool(tool, preset);
        setShowShapeMenu(false);
        setShowFrameMenu(false);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const src = event.target?.result as string;
            engineRef.current?.addImage(src, targetFrameRef.current || undefined);
            targetFrameRef.current = null;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleExportBoard = () => {
        if (!engineRef.current) return;
        const data = engineRef.current.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${board.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportBoard = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !engineRef.current) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = event.target?.result as string;
            engineRef.current?.importData(data);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const isShapeOrLineActive = ['RECT', 'ELLIPSE', 'TRIANGLE', 'DIAMOND', 'LINE', 'ARROW'].includes(activeTool);

    return (
        <div className="w-full h-screen relative overflow-hidden bg-slate-50 text-slate-900 font-sans flex-1">
            <canvas ref={canvasRef} className="absolute inset-0 z-0 touch-none outline-none" />

            {/* Hidden File Input for Container Images */}
            <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />

            {/* Hidden File Input for Board Import */}
            <input type="file" ref={importInputRef} accept=".json,application/json" className="hidden" onChange={handleImportBoard} />

            {/* Header with Back Button */}
            <div className="absolute top-6 left-6 z-10 flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2.5 bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600 flex items-center justify-center"
                    title="Back to Brink Dashboard"
                >
                    <ArrowLeft size={18} strokeWidth={2.5} />
                </button>

                {/* Floating Container Bar for Board Name */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-2 md:px-3 py-1.5 md:py-2 flex items-center gap-2 md:gap-3 transition-colors hover:border-slate-300">
                    <div className="hidden sm:block w-4 h-4 md:w-5 md:h-5 bg-blue-600 rounded-md shrink-0"></div>
                    {isEditingName ? (
                        <input
                            autoFocus
                            value={boardName}
                            onChange={(e) => setBoardName(e.target.value)}
                            onBlur={handleRenameSubmit}
                            onKeyDown={handleKeyDown}
                            className="text-base md:text-lg font-bold text-slate-800 bg-transparent outline-none w-24 sm:w-32 md:w-48 border-b-2 border-blue-500 rounded-none px-0 py-0"
                        />
                    ) : (
                        <h1
                            onClick={() => setIsEditingName(true)}
                            className="text-base md:text-lg font-bold text-slate-800 tracking-tight cursor-text hover:text-blue-600 transition-colors truncate max-w-[100px] sm:max-w-[150px] md:max-w-[200px]"
                            title="Click to rename"
                        >
                            {board.name}
                        </h1>
                    )}
                </div>

                <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
                    <button
                        onClick={handleExportBoard}
                        className="p-1.5 sm:p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Export Board"
                    >
                        <Download size={18} />
                    </button>
                    <button
                        onClick={() => importInputRef.current?.click()}
                        className="p-1.5 sm:p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Import Board"
                    >
                        <Upload size={18} />
                    </button>
                </div>
            </div>

            {/* Main Floating Toolbar */}
            <div className="absolute left-1/2 bottom-8 -translate-x-1/2 md:left-6 md:top-1/2 md:bottom-auto md:translate-x-0 md:-translate-y-1/2 bg-white rounded-xl shadow-xl border border-slate-200 p-2 flex flex-row md:flex-col gap-2 z-10 overflow-x-auto max-w-[95vw] md:max-w-none md:overflow-visible touch-pan-x">
                <ToolButton icon={<MousePointer2 size={20} />} label="Select & Move (V)" active={activeTool === 'SELECT'} onClick={() => setTool('SELECT')} />
                <div className="w-px h-auto md:w-full md:h-px bg-slate-100 mx-1 md:my-1 md:mx-0 shrink-0"></div>

                <div className="relative">
                    <ToolButton
                        icon={<FrameIcon size={20} />}
                        label="Frame (F)"
                        active={activeTool === 'FRAME' || showFrameMenu}
                        onClick={() => setShowFrameMenu(!showFrameMenu)}
                    />

                    {showFrameMenu && (
                        <div className="absolute bottom-full mb-2 md:bottom-auto md:mb-0 md:left-full md:ml-4 md:top-0 bg-white rounded-xl shadow-xl border border-slate-200 p-2 w-48 z-50 animate-in fade-in zoom-in-95 duration-100 origin-bottom md:origin-left">
                            <div className="text-[10px] font-bold text-slate-400 mb-1 px-2 uppercase tracking-widest">Presets</div>
                            <div className="flex flex-col">
                                <PresetButton label="Custom Frame" onClick={() => setTool('FRAME', null)} />
                                <PresetButton label="16:9 (Desktop)" onClick={() => setTool('FRAME', '16:9')} />
                                <PresetButton label="4:3 (Presentation)" onClick={() => setTool('FRAME', '4:3')} />
                                <PresetButton label="1:1 (Square)" onClick={() => setTool('FRAME', '1:1')} />
                                <PresetButton label="A4" onClick={() => setTool('FRAME', 'A4')} />
                                <PresetButton label="Letter" onClick={() => setTool('FRAME', 'Letter')} />
                                <PresetButton label="Mobile (Phone)" onClick={() => setTool('FRAME', 'Mobile')} />
                                <PresetButton label="Tablet" onClick={() => setTool('FRAME', 'Tablet')} />
                                <PresetButton label="Desktop (MacBook)" onClick={() => setTool('FRAME', 'Desktop')} />
                            </div>
                        </div>
                    )}
                </div>

                <ToolButton icon={<Type size={20} />} label="Text (T)" active={activeTool === 'TEXT'} onClick={() => setTool('TEXT')} />
                <ToolButton icon={<StickyNote size={20} />} label="Sticky Note (N)" active={activeTool === 'STICKY'} onClick={() => setTool('STICKY')} />

                <div className="relative">
                    <ToolButton
                        icon={<Shapes size={20} />}
                        label="Shapes & Lines"
                        active={isShapeOrLineActive || showShapeMenu}
                        onClick={() => setShowShapeMenu(!showShapeMenu)}
                    />

                    {showShapeMenu && (
                        <div className="absolute bottom-full mb-2 md:bottom-auto md:mb-0 md:left-full md:ml-4 md:top-0 bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-48 z-50 animate-in fade-in zoom-in-95 duration-100 origin-bottom md:origin-left">
                            <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Shapes</div>
                            <div className="grid grid-cols-4 gap-2 mb-4">
                                <MiniTool icon={<Square size={18} />} onClick={() => setTool('RECT')} active={activeTool === 'RECT'} title="Rectangle" />
                                <MiniTool icon={<Circle size={18} />} onClick={() => setTool('ELLIPSE')} active={activeTool === 'ELLIPSE'} title="Ellipse" />
                                <MiniTool icon={<Triangle size={18} />} onClick={() => setTool('TRIANGLE')} active={activeTool === 'TRIANGLE'} title="Triangle" />
                                <MiniTool icon={<Diamond size={18} />} onClick={() => setTool('DIAMOND')} active={activeTool === 'DIAMOND'} title="Diamond" />
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Lines & Arrows</div>
                            <div className="grid grid-cols-4 gap-2">
                                <MiniTool icon={<Minus size={18} className="rotate-45" />} onClick={() => setTool('LINE')} active={activeTool === 'LINE'} title="Line" />
                                <MiniTool icon={<ArrowRight size={18} className="-rotate-45" />} onClick={() => setTool('ARROW')} active={activeTool === 'ARROW'} title="Arrow" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-px h-auto md:w-full md:h-px bg-slate-100 mx-1 md:my-1 md:mx-0 shrink-0"></div>
                <ToolButton icon={<Trash2 size={20} className="text-red-500" />} label="Delete Selected" active={false} onClick={() => engineRef.current?.selectionModule.deleteSelected()} />
            </div>

            {(showShapeMenu || showFrameMenu) && (
                <div className="fixed inset-0 z-0" onClick={() => { setShowShapeMenu(false); setShowFrameMenu(false); }} />
            )}

            {/* Zoom Controls */}
            <div className="absolute top-6 right-6 md:top-auto md:bottom-6 md:right-6 bg-white rounded-lg shadow-sm md:shadow-lg border border-slate-200 p-1 flex items-center gap-1 z-10 select-none">
                <button onClick={() => engineRef.current?.zoomTo(Math.min(Math.max(zoomLevel * 0.8, 0.1), 5))} className="p-2 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Zoom Out"><ZoomOut size={18} /></button>
                <div className="px-3 text-sm font-medium w-16 text-center text-slate-700">{Math.round(zoomLevel * 100)}%</div>
                <button onClick={() => engineRef.current?.zoomTo(Math.min(Math.max(zoomLevel * 1.2, 0.1), 5))} className="p-2 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Zoom In"><ZoomIn size={18} /></button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={() => engineRef.current?.zoomTo(1)} className="p-2 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Zoom to 100%"><Maximize size={18} /></button>
            </div>
        </div>
    );
}

function ToolButton({ icon, active, onClick, label }: { icon: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
    return (
        <button onClick={onClick} title={label} className={`p-3 rounded-lg transition-all duration-200 shrink-0 ${active ? 'bg-blue-50 text-blue-600 shadow-sm border border-blue-200' : 'text-slate-600 hover:bg-slate-100 border border-transparent hover:text-slate-900'}`}>
            {icon}
        </button>
    );
}

function MiniTool({ icon, active, onClick, title }: { icon: React.ReactNode, active: boolean, onClick: () => void, title: string }) {
    return (
        <button onClick={onClick} title={title} className={`p-2 rounded-md flex justify-center items-center transition-colors ${active ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`}>
            {icon}
        </button>
    );
}

function PresetButton({ label, onClick }: { label: string, onClick: () => void }) {
    return (
        <button onClick={onClick} className="text-left px-3 py-1.5 text-sm hover:bg-slate-100 rounded-md text-slate-700 transition-colors">
            {label}
        </button>
    );
}
