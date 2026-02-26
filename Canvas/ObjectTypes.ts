import type { ObjectTypeDefinition } from './SceneManager';
import type { CanvasEntity, Point, AnchorPosition } from './types';

// ============================================================================
// HELPERS
// ============================================================================

export const getCurvePoints = (s: Point, e: Point, sAnchor?: AnchorPosition, eAnchor?: AnchorPosition) => {
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

export const getStartEnd = (e: CanvasEntity) => {
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

// ============================================================================
// OBJECT TYPE DEFINITIONS
// ============================================================================

export const RectangleType: ObjectTypeDefinition = {
    type: 'RECTANGLE',
    getBBox: (e) => ({
        minX: e.transform.x, minY: e.transform.y,
        maxX: e.transform.x + e.props.width, maxY: e.transform.y + e.props.height,
    }),
    hitTest: (e, wx, wy) => {
        const p = 10; // 10px selection padding
        return wx >= e.transform.x - p && wx <= e.transform.x + e.props.width + p &&
            wy >= e.transform.y - p && wy <= e.transform.y + e.props.height + p;
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
export const ImageType: ObjectTypeDefinition = {
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

export const StickyNoteType: ObjectTypeDefinition = {
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

export const TextType: ObjectTypeDefinition = {
    type: 'TEXT',
    getBBox: RectangleType.getBBox,
    hitTest: RectangleType.hitTest,
    render: (ctx, e) => {
        const scale = e.props.width / 250;
        const fontSize = Math.max(20 * scale, 4);
        const padding = 8 * scale;
        const lineHeight = 28 * scale;

        ctx.fillStyle = e.props.color || '#1e293b';
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

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.transform.x, e.transform.y, e.props.width, e.props.height);

        if (e.metadata.selected) {
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(e.transform.x, e.transform.y, e.props.width, e.props.height);
            ctx.setLineDash([]);
        }
    }
};

export const EllipseType: ObjectTypeDefinition = {
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

export const TriangleType: ObjectTypeDefinition = {
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

export const DiamondType: ObjectTypeDefinition = {
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


export const LineType: ObjectTypeDefinition = {
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

export const ArrowType: ObjectTypeDefinition = {
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

export const FrameType: ObjectTypeDefinition = {
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
