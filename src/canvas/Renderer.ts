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

    static render(ctx: CanvasRenderingContext2D, width: number, height: number, camera: Camera, scene: SceneManager, state: { hoveredId: string | null, hoveredAnchor: AnchorPosition | null, marqueeRect?: { minX: number, minY: number, maxX: number, maxY: number } | null, remoteLocks?: Map<string, { userName: string }>, remoteMarquees?: Map<string, { rect: { minX: number, minY: number, maxX: number, maxY: number }, userName: string }> }) {
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

        // Draw lock indicators on entities locked by other users
        if (state.remoteLocks && state.remoteLocks.size > 0) {
            state.remoteLocks.forEach((lockInfo, entityId) => {
                const entity = scene.getObject(entityId);
                if (!entity || !entity.visible) return;
                const typeDef = scene.getObjectType(entity.type);
                if (!typeDef) return;
                const bbox = typeDef.getBBox(entity);

                // Skip if off-screen
                if (bbox.maxX < cameraBBox.minX || bbox.minX > cameraBBox.maxX ||
                    bbox.maxY < cameraBBox.minY || bbox.minY > cameraBBox.maxY) return;

                const pad = 4 / camera.zoom;
                const bw = (bbox.maxX - bbox.minX) + pad * 2;
                const bh = (bbox.maxY - bbox.minY) + pad * 2;

                // Dashed red-orange border
                ctx.strokeStyle = 'rgba(249, 115, 22, 0.7)';
                ctx.lineWidth = 2 / camera.zoom;
                ctx.setLineDash([6 / camera.zoom, 3 / camera.zoom]);
                ctx.strokeRect(bbox.minX - pad, bbox.minY - pad, bw, bh);
                ctx.setLineDash([]);

                // User badge
                const badgeH = 18 / camera.zoom;
                const initial = (lockInfo.userName || '?')[0].toUpperCase();
                const label = `${initial} editing`;
                const fontSize = 11 / camera.zoom;
                ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                const textW = ctx.measureText(label).width;
                const badgeW = textW + 10 / camera.zoom;
                const badgeX = bbox.minX - pad;
                const badgeY = bbox.minY - pad - badgeH - 2 / camera.zoom;

                // Badge background
                ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
                const radius = 4 / camera.zoom;
                ctx.beginPath();
                ctx.moveTo(badgeX + radius, badgeY);
                ctx.lineTo(badgeX + badgeW - radius, badgeY);
                ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + radius);
                ctx.lineTo(badgeX + badgeW, badgeY + badgeH - radius);
                ctx.quadraticCurveTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - radius, badgeY + badgeH);
                ctx.lineTo(badgeX + radius, badgeY + badgeH);
                ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - radius);
                ctx.lineTo(badgeX, badgeY + radius);
                ctx.quadraticCurveTo(badgeX, badgeY, badgeX + radius, badgeY);
                ctx.fill();

                // Badge text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, badgeX + 5 / camera.zoom, badgeY + badgeH - 5 / camera.zoom);
            });
        }

        // Draw HUD/Overlays
        selectedEntities.forEach(({ entity, typeDef }) => {
            const bbox = typeDef.getBBox(entity);
            if (entity.type !== 'LINE' && entity.type !== 'ARROW') {
                Renderer.drawSelectionHandles(ctx, bbox, camera.zoom);
                Renderer.drawConnectionAnchors(ctx, bbox, camera.zoom, state.hoveredId === entity.id ? state.hoveredAnchor : null);
            }
        });

        // Draw persistent group bounding box when multiple entities are selected
        if (selectedEntities.length > 1) {
            let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
            selectedEntities.forEach(({ entity, typeDef }) => {
                const bbox = typeDef.getBBox(entity);
                if (bbox.minX < gMinX) gMinX = bbox.minX;
                if (bbox.minY < gMinY) gMinY = bbox.minY;
                if (bbox.maxX > gMaxX) gMaxX = bbox.maxX;
                if (bbox.maxY > gMaxY) gMaxY = bbox.maxY;
            });

            const pad = 6 / camera.zoom;
            gMinX -= pad; gMinY -= pad; gMaxX += pad; gMaxY += pad;

            ctx.fillStyle = 'rgba(59, 130, 246, 0.04)';
            ctx.fillRect(gMinX, gMinY, gMaxX - gMinX, gMaxY - gMinY);

            ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
            ctx.lineWidth = 1.5 / camera.zoom;
            ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
            ctx.strokeRect(gMinX, gMinY, gMaxX - gMinX, gMaxY - gMinY);
            ctx.setLineDash([]);
        }

        // Hovered connections
        if (state.hoveredId && state.hoveredAnchor) {
            const hoveredEntity = scene.getObject(state.hoveredId);
            if (hoveredEntity && !hoveredEntity.metadata.selected && hoveredEntity.type !== 'LINE' && hoveredEntity.type !== 'ARROW') {
                const typeDef = scene.getObjectType(hoveredEntity.type);
                if (typeDef) Renderer.drawConnectionAnchors(ctx, typeDef.getBBox(hoveredEntity), camera.zoom, state.hoveredAnchor);
            }
        }

        // Draw marquee selection rectangle (during active drag)
        if (state.marqueeRect) {
            const m = state.marqueeRect;
            const mw = m.maxX - m.minX;
            const mh = m.maxY - m.minY;

            ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
            ctx.fillRect(m.minX, m.minY, mw, mh);

            ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
            ctx.lineWidth = 1.5 / camera.zoom;
            ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
            ctx.strokeRect(m.minX, m.minY, mw, mh);
            ctx.setLineDash([]);
        }

        // Draw remote Marquees
        if (state.remoteMarquees && state.remoteMarquees.size > 0) {
            state.remoteMarquees.forEach((marquee, _socketId) => {
                const m = marquee.rect;
                const mw = m.maxX - m.minX;
                const mh = m.maxY - m.minY;

                ctx.fillStyle = 'rgba(249, 115, 22, 0.05)'; // slight orange tint
                ctx.fillRect(m.minX, m.minY, mw, mh);

                ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
                ctx.lineWidth = 1.5 / camera.zoom;
                ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
                ctx.strokeRect(m.minX, m.minY, mw, mh);
                ctx.setLineDash([]);

                // Add small badge
                const label = `${(marquee.userName || '?')[0].toUpperCase()} selecting`;
                const fontSize = 11 / camera.zoom;
                ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                const textW = ctx.measureText(label).width;
                const badgeW = textW + 10 / camera.zoom;
                const badgeH = 18 / camera.zoom;

                const badgeX = m.minX;
                const badgeY = m.minY - badgeH - 2 / camera.zoom;

                // Badge background
                ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
                const radius = 4 / camera.zoom;
                ctx.beginPath();
                ctx.moveTo(badgeX + radius, badgeY);
                ctx.lineTo(badgeX + badgeW - radius, badgeY);
                ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + radius);
                ctx.lineTo(badgeX + badgeW, badgeY + badgeH - radius);
                ctx.quadraticCurveTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - radius, badgeY + badgeH);
                ctx.lineTo(badgeX + radius, badgeY + badgeH);
                ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - radius);
                ctx.lineTo(badgeX, badgeY + radius);
                ctx.quadraticCurveTo(badgeX, badgeY, badgeX + radius, badgeY);
                ctx.fill();

                // Badge text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, badgeX + 5 / camera.zoom, badgeY + badgeH - 5 / camera.zoom);
            });
        }

        ctx.restore();
    }
}
