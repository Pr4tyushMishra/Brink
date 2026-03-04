import type { BBox, AnchorPosition, CanvasEntity } from './types';
import { getAnchorPoint } from './types';
import type { Camera } from './Camera';
import type { ObjectTypeDefinition } from './SceneManager';
import { SceneManager } from './SceneManager';

export class Renderer {
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

        entities.forEach(entity => {
            if (!entity.visible) return;
            if (entity.parentId) {
                if (!childrenByParent.has(entity.parentId)) childrenByParent.set(entity.parentId, []);
                childrenByParent.get(entity.parentId)!.push(entity);
            } else {
                if (entity.type === 'FRAME') frames.push(entity);
                else if (entity.type === 'LINE' || entity.type === 'ARROW') lines.push(entity);
                else rootShapes.push(entity);
            }
        });

        const drawEntity = (entity: CanvasEntity) => {
            const typeDef = scene.getObjectType(entity.type);
            if (!typeDef) return;

            const bbox = typeDef.getBBox(entity);
            if (bbox.maxX < cameraBBox.minX || bbox.minX > cameraBBox.maxX ||
                bbox.maxY < cameraBBox.minY || bbox.minY > cameraBBox.maxY) return;

            typeDef.render(ctx, entity);
            if (entity.metadata.selected) selectedEntities.push({ entity, typeDef });
        };

        frames.forEach(frame => {
            drawEntity(frame);
            const children = childrenByParent.get(frame.id) || [];
            children.forEach(child => drawEntity(child));
        });

        lines.forEach(line => drawEntity(line));
        rootShapes.forEach(shape => drawEntity(shape));

        // Draw HUD/Overlays
        selectedEntities.forEach(({ entity, typeDef }) => {
            const bbox = typeDef.getBBox(entity);
            if (entity.type !== 'LINE' && entity.type !== 'ARROW') {
                Renderer.drawSelectionHandles(ctx, bbox, camera.zoom);
                Renderer.drawConnectionAnchors(ctx, bbox, camera.zoom, state.hoveredId === entity.id ? state.hoveredAnchor : null);
            }
        });

        // Hovered connections
        if (state.hoveredId && state.hoveredAnchor) {
            const hoveredEntity = scene.getObject(state.hoveredId);
            if (hoveredEntity && !hoveredEntity.metadata.selected && hoveredEntity.type !== 'LINE' && hoveredEntity.type !== 'ARROW') {
                const typeDef = scene.getObjectType(hoveredEntity.type);
                if (typeDef) Renderer.drawConnectionAnchors(ctx, typeDef.getBBox(hoveredEntity), camera.zoom, state.hoveredAnchor);
            }
        }

        ctx.restore();
    }
}
