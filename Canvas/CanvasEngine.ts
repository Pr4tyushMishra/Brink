import { Camera } from './Camera';
import { SceneManager } from './SceneManager';
import type { Point, HandleType, AnchorPosition, BBox, CanvasEntity } from './types';
import { FRAME_PRESETS, getAnchorPoint } from './types';
import { RectangleType, StickyNoteType, TextType, EllipseType, TriangleType, DiamondType, LineType, ArrowType, FrameType, ImageType } from './ObjectTypes';
import { SelectionModule } from './modules/SelectionModule';
import { ConnectionModule } from './modules/ConnectionModule';
import { EVENTS } from './EventBus';
import { Renderer } from './Renderer';

export type ToolType = 'SELECT' | 'RECT' | 'STICKY' | 'TEXT' | 'ELLIPSE' | 'TRIANGLE' | 'DIAMOND' | 'LINE' | 'ARROW' | 'FRAME';

export class CanvasEngine {
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
        this.canvas.addEventListener('dblclick', this.onDoubleClick);
        window.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    }

    destroy() {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('dblclick', this.onDoubleClick);
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
        if (document.activeElement instanceof HTMLElement && document.activeElement !== this.canvas) {
            document.activeElement.blur();
        }
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

    private onDoubleClick = (e: MouseEvent) => {
        const w = this.camera.screenToWorld(e.clientX, e.clientY);
        const hit = this.hitTestGlobal(w.x, w.y);

        if (hit && (hit.type === 'TEXT' || hit.type === 'STICKY_NOTE')) {
            this.scene.events.emit(EVENTS.REQUEST_TEXT_EDIT, hit.id);
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

    private onPointerUp = () => {
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
