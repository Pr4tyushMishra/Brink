import { Camera } from './Camera';
import { SceneManager } from './SceneManager';
import type { Point, HandleType, AnchorPosition, BBox, CanvasEntity } from './types';
import { FRAME_PRESETS, getAnchorPoint } from './types';
import { RectangleType, StickyNoteType, TextType, EllipseType, TriangleType, DiamondType, LineType, ArrowType, FrameType, ImageType } from './ObjectTypes';
import { SelectionModule } from './modules/SelectionModule';
import { ConnectionModule } from './modules/ConnectionModule';
import { LockModule } from './modules/LockModule';
import { EVENTS } from './EventBus';
import { Renderer } from './Renderer';
import { io, Socket } from 'socket.io-client';

export type ToolType = 'SELECT' | 'RECT' | 'STICKY' | 'TEXT' | 'ELLIPSE' | 'TRIANGLE' | 'DIAMOND' | 'LINE' | 'ARROW' | 'FRAME';

export class CanvasEngine {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    camera = new Camera();
    scene = new SceneManager();

    isDirty = true;
    isReadOnly = false;
    isPresenting = false;
    activeTool: ToolType = 'SELECT';
    animationFrameId = 0;
    width = 0; height = 0;

    isPanning = false;
    lastMouse: Point = { x: 0, y: 0 };
    draggedEntityId: string | null = null;
    draggedChildrenIds: string[] = [];
    dragOffset: Point = { x: 0, y: 0 };

    // Marquee selection state
    isMarqueeSelecting = false;
    marqueeStart: Point | null = null;
    marqueeEnd: Point | null = null;

    // Multi-selection drag state
    isMultiDragging = false;
    multiDragOffsets: Map<string, Point> = new Map();

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
    onRoleAssigned?: (role: string) => void;
    selectionModule: SelectionModule;
    connectionModule: ConnectionModule;
    lockModule: LockModule;
    lockUserName: string = 'User';

    socket: Socket;
    boardId: string;
    token: string;

    private networkFlushTimer = 0;
    private pendingNetworkUpdates = new Map<string, CanvasEntity>();

    remoteMarquees = new Map<string, { rect: { minX: number, minY: number, maxX: number, maxY: number }, userName: string }>();
    private lastMarqueeBroadcast = false;

    constructor(canvas: HTMLCanvasElement, boardId: string, token: string) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.boardId = boardId;
        this.token = token;

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

        this.lockModule = new LockModule();

        // 1. Initialize Network Socket
        this.socket = io('http://localhost:3000', {
            auth: { token: this.token }
        });

        this.socket.on('connect', () => {
            console.log('[CanvasEngine] Connected to Backend WebSocket');
            this.socket.emit('JOIN_BOARD', this.boardId);
            // Attach lock module to socket once connected
            try { this.lockModule.attach(this.socket, this.boardId, () => { this.isDirty = true; }); } catch (_) { }
        });

        this.socket.on('ROLE_ASSIGNED', (role: string) => {
            console.log(`[CanvasEngine] Role Assigned: ${role}`);
            this.isReadOnly = role === 'VIEWER';
            if (this.onRoleAssigned) this.onRoleAssigned(role);
        });

        // 2. Local Event Bus -> Network Broadcast
        const markDirty = () => { this.isDirty = true; };

        this.scene.events.on(EVENTS.ENTITY_CREATED, (entity: CanvasEntity) => {
            markDirty();
            this.socket.emit('CANVAS_EVENT', { boardId: this.boardId, type: 'ENTITY_CREATED', payload: { entity } });
        });

        this.scene.events.on(EVENTS.ENTITY_UPDATED, (data: { old: CanvasEntity, new: CanvasEntity }) => {
            markDirty();
            // Throttle network updates: Store the latest state to be flushed by the render loop
            this.pendingNetworkUpdates.set(data.new.id, data.new);
        });

        this.scene.events.on(EVENTS.ENTITY_DELETED, (entity: CanvasEntity) => {
            markDirty();
            this.socket.emit('CANVAS_EVENT', { boardId: this.boardId, type: 'ENTITY_DELETED', payload: { entityId: entity.id } });
        });

        // 3. Network Broadcast -> Local State
        this.socket.on('SYNC_EVENT', (event: any) => {
            // Drop network events if we originated them
            if (event.payload?.senderId === this.socket.id) return;

            try {
                if (event.type === 'ENTITY_CREATED') {
                    if (!this.scene.getObject(event.payload.entity.id)) {
                        const e = event.payload.entity;
                        this.scene.createObject(e.type, e.props, e.transform, e.metadata, e.parentId, true);
                        markDirty();
                    }
                } else if (event.type === 'ENTITY_UPDATED' || event.type === 'ENTITY_DRAGGING') {
                    // Support both new lightweight format (entityId + updates) and legacy (entity)
                    const entityId = event.payload.entityId || event.payload.entity?.id;
                    const updates = event.payload.updates || {
                        transform: event.payload.entity?.transform,
                        props: event.payload.entity?.props
                    };
                    if (entityId) {
                        this.scene.updateObject(entityId, updates, true);
                    }
                    markDirty();
                } else if (event.type === 'ENTITY_DELETED') {
                    this.scene.deleteObject(event.payload.entityId, true);
                    markDirty();
                } else if (event.type === 'VIEWPORT_UPDATE') {
                    // Force the camera to jump to the presenter's view
                    this.camera.x = event.payload.x;
                    this.camera.y = event.payload.y;
                    this.camera.zoom = event.payload.zoom;
                    if (this.onZoomChange) this.onZoomChange(this.camera.zoom);
                    markDirty();
                } else if (event.type === 'MARQUEE_UPDATE') {
                    const senderId = event.payload.senderId;
                    if (event.payload.rect) {
                        this.remoteMarquees.set(senderId, { rect: event.payload.rect, userName: event.payload.userName });
                    } else {
                        this.remoteMarquees.delete(senderId);
                    }
                    markDirty();
                } else if (event.type === 'ENTITY_LOCKED') {
                    try { this.lockModule.handleRemoteLock(event.payload); } catch (_) { }
                } else if (event.type === 'ENTITY_UNLOCKED') {
                    try { this.lockModule.handleRemoteUnlock(event.payload); } catch (_) { }
                }
            } catch (e) {
                console.error("Error handling SYNC_EVENT", e);
            }
        });

        this.scene.events.on(EVENTS.SELECTION_CHANGED, (selectedIds: string[]) => {
            markDirty();
            // Emit lock/unlock based on selection changes
            try {
                const userName = 'User'; // Will be overridden by BoardEditor if available
                if (selectedIds.length > 0) {
                    this.lockModule.lockEntities(selectedIds, this.lockUserName || userName);
                } else {
                    this.lockModule.unlockAll();
                }
            } catch (_) { }
        });
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

        try { this.lockModule.destroy(); } catch (_) { }

        if (this.socket) {
            this.socket.disconnect();
        }
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

        // Always allow panning (middle click or shift + left click)
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) { this.isPanning = true; return; }

        // If Read-Only, abort any other interaction!
        if (this.isReadOnly) return;

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

            // Assign Fallback Dimensions IMMEDIATELY so WebSocket doesn't receive 0-width entities
            const fallbacks: Record<string, { w: number, h: number }> = {
                'STICKY_NOTE': { w: 200, h: 200 }, 'RECTANGLE': { w: 100, h: 100 },
                'ELLIPSE': { w: 100, h: 100 }, 'TRIANGLE': { w: 100, h: 100 }, 'DIAMOND': { w: 100, h: 100 },
                'LINE': { w: 100, h: 100 }, 'ARROW': { w: 100, h: 100 },
                'FRAME': this.framePreset && FRAME_PRESETS[this.framePreset] ? FRAME_PRESETS[this.framePreset] : { w: 400, h: 300 },
                'TEXT': { w: 250, h: 50 }
            };
            const fb = fallbacks[type] || { w: 100, h: 100 };

            const defaultProps: Record<string, any> = { width: fb.w, height: fb.h };
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
                // Block selection of entities locked by other users
                try {
                    if (this.lockModule.isLockedByOther(hit.id)) {
                        this.canvas.style.cursor = 'not-allowed';
                        // Reset selection/drag states so Marquee doesn't accidentally start
                        this.isMarqueeSelecting = false;
                        this.marqueeStart = null;
                        this.marqueeEnd = null;
                        this.selectionModule.clearSelection();
                        return;
                    }
                } catch (_) { }

                // Check if the hit entity is already part of a multi-selection
                const currentlySelected = this.selectionModule.getSelectedIds();
                const hitIsSelected = currentlySelected.includes(hit.id);

                if (hitIsSelected && currentlySelected.length > 1) {
                    // Start multi-drag: move ALL selected entities together
                    this.isMultiDragging = true;
                    this.multiDragOffsets.clear();
                    currentlySelected.forEach(id => {
                        const obj = this.scene.getObject(id);
                        if (obj) {
                            this.multiDragOffsets.set(id, { x: w.x - obj.transform.x, y: w.y - obj.transform.y });
                        }
                    });
                } else {
                    // Single entity select + drag
                    this.selectionModule.select(hit.id);

                    const isLineOrArrow = hit.type === 'LINE' || hit.type === 'ARROW';
                    if (!isLineOrArrow) {
                        this.draggedEntityId = hit.id;
                        this.dragOffset = { x: w.x - hit.transform.x, y: w.y - hit.transform.y };

                        // GROUP DRAGGING (frames drag their children)
                        if (hit.type === 'FRAME') {
                            const isDevice = ['Mobile', 'Tablet', 'Desktop'].includes(hit.props.name);

                            if (isDevice) {
                                this.draggedChildrenIds = this.scene.getAllObjects().filter(o => o.parentId === hit.id).map(o => o.id);
                            } else {
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
                }
            } else {
                // Empty space click — start marquee selection
                this.selectionModule.clearSelection();
                this.isMarqueeSelecting = true;
                this.marqueeStart = { x: w.x, y: w.y };
                this.marqueeEnd = { x: w.x, y: w.y };
            }
        }
    };

    private onDoubleClick = (e: MouseEvent) => {
        if (this.isReadOnly) return;
        const w = this.camera.screenToWorld(e.clientX, e.clientY);
        const hit = this.hitTestGlobal(w.x, w.y);

        if (hit) {
            const textEditableTypes = ['TEXT', 'STICKY_NOTE', 'RECTANGLE', 'ELLIPSE', 'TRIANGLE', 'DIAMOND'];
            if (textEditableTypes.includes(hit.type)) {
                this.scene.events.emit(EVENTS.REQUEST_TEXT_EDIT, hit.id);
            }
        }
    };

    private onPointerMove = (e: PointerEvent) => {
        const w = this.camera.screenToWorld(e.clientX, e.clientY);

        if (!this.isPanning && !this.draggedEntityId && !this.isResizing && !this.isMarqueeSelecting && !this.isMultiDragging) {
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

        // Marquee drag — update end point
        if (this.isMarqueeSelecting && this.marqueeStart) {
            this.marqueeEnd = { x: w.x, y: w.y };
            this.isDirty = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            return;
        }

        // Multi-selection drag — move all selected entities
        if (this.isMultiDragging && this.multiDragOffsets.size > 0) {
            this.multiDragOffsets.forEach((offset, id) => {
                const obj = this.scene.getObject(id);
                if (obj) {
                    this.scene.updateObject(id, {
                        transform: { x: w.x - offset.x, y: w.y - offset.y }
                    });
                }
            });
            this.isDirty = true;
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
        // --- EPHEMERAL DRAGGING PHASE 2 ---
        // If we just finished a drag or resize, we must send ONE final permanent update to the database.
        // During the drag, the 50ms network flush will have been sending 'ENTITY_DRAGGING' (which skips DB).
        if (this.draggedEntityId || this.isResizing || this.isMultiDragging) {
            const idsToSave = new Set<string>();
            if (this.draggedEntityId) idsToSave.add(this.draggedEntityId);
            this.draggedChildrenIds.forEach(id => idsToSave.add(id));
            if (this.isMultiDragging) this.multiDragOffsets.forEach((_, id) => idsToSave.add(id));

            idsToSave.forEach(id => {
                const entity = this.scene.getObject(id);
                if (entity) {
                    const lightProps = { ...entity.props };
                    delete lightProps.src;

                    this.socket.emit('CANVAS_EVENT', {
                        boardId: this.boardId,
                        type: 'ENTITY_UPDATED',
                        payload: {
                            entityId: entity.id,
                            updates: {
                                transform: entity.transform,
                                props: lightProps,
                                metadata: entity.metadata,
                                visible: entity.visible,
                                parentId: entity.parentId
                            }
                        }
                    });
                    // Remove from pending so the interval flush doesn't send it again
                    this.pendingNetworkUpdates.delete(id);
                }
            });
        }

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

        // Finish marquee selection — select all entities within the marquee box
        if (this.isMarqueeSelecting && this.marqueeStart && this.marqueeEnd) {
            const minX = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
            const minY = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
            const maxX = Math.max(this.marqueeStart.x, this.marqueeEnd.x);
            const maxY = Math.max(this.marqueeStart.y, this.marqueeEnd.y);

            // Only select if the marquee was meaningful (not a simple click)
            if (maxX - minX > 5 || maxY - minY > 5) {
                const marqueeBBox: BBox = { minX, minY, maxX, maxY };
                const entities = this.scene.getAllObjects();
                const hitIds: string[] = [];

                entities.forEach(entity => {
                    if (!entity.visible) return;
                    const typeDef = this.scene.getObjectType(entity.type);
                    if (!typeDef) return;
                    const bbox = typeDef.getBBox(entity);
                    // Entity is selected if its bbox overlaps with the marquee box
                    if (bbox.minX < marqueeBBox.maxX && bbox.maxX > marqueeBBox.minX &&
                        bbox.minY < marqueeBBox.maxY && bbox.maxY > marqueeBBox.minY) {
                        hitIds.push(entity.id);
                    }
                });

                if (hitIds.length > 0) {
                    this.selectionModule.selectMultiple(hitIds);
                }
            }
        }

        this.isMarqueeSelecting = false;
        this.marqueeStart = null;
        this.marqueeEnd = null;
        this.isMultiDragging = false;
        this.multiDragOffsets.clear();

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

    setPresenting(state: boolean) {
        this.isPresenting = state;
        if (state) {
            this.socket.emit('CANVAS_EVENT', {
                boardId: this.boardId,
                type: 'VIEWPORT_UPDATE',
                payload: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom }
            });
        }
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

            const id = this.scene.createObject('IMAGE', { src, width: w, height: h }, { x: wx - w / 2, y: wy - h / 2 }, {}, parentId);
            this.selectionModule.select(id);
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
                hoveredAnchor: this.hoveredAnchor,
                marqueeRect: this.isMarqueeSelecting && this.marqueeStart && this.marqueeEnd ? {
                    minX: Math.min(this.marqueeStart.x, this.marqueeEnd.x),
                    minY: Math.min(this.marqueeStart.y, this.marqueeEnd.y),
                    maxX: Math.max(this.marqueeStart.x, this.marqueeEnd.x),
                    maxY: Math.max(this.marqueeStart.y, this.marqueeEnd.y)
                } : null,
                remoteLocks: (() => { try { return this.lockModule.getRemoteLocks(); } catch (_) { return new Map(); } })(),
                remoteMarquees: this.remoteMarquees
            });
            this.ctx.restore();
            this.isDirty = false;

            if (this.isPresenting) {
                this.socket.emit('CANVAS_EVENT', {
                    boardId: this.boardId,
                    type: 'VIEWPORT_UPDATE',
                    payload: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom }
                });
            }
        }

        // 20FPS WebSocket Network Flush (50ms interval)
        const now = Date.now();
        if (now - this.networkFlushTimer > 50) {
            this.networkFlushTimer = now;
            if (this.pendingNetworkUpdates.size > 0 && this.socket.connected) {
                this.pendingNetworkUpdates.forEach(entity => {
                    // Send lightweight updates: strip large immutable fields like image src
                    const lightProps = { ...entity.props };
                    delete lightProps.src; // src never changes during move/resize

                    // --- EPHEMERAL DRAGGING PHASE 2 ---
                    // Determine if this entity is actively being dragged/resized by the local user.
                    // If so, emit as ENTITY_DRAGGING to skip DB saves.
                    const isEphemeralDrag =
                        this.draggedEntityId === entity.id ||
                        this.draggedChildrenIds.includes(entity.id) ||
                        (this.isMultiDragging && this.multiDragOffsets.has(entity.id)) ||
                        (this.isResizing && this.draggedEntityId === entity.id);

                    const broadcastType = isEphemeralDrag ? 'ENTITY_DRAGGING' : 'ENTITY_UPDATED';

                    this.socket.emit('CANVAS_EVENT', {
                        boardId: this.boardId,
                        type: broadcastType,
                        payload: {
                            entityId: entity.id,
                            updates: {
                                transform: entity.transform,
                                props: lightProps,
                                metadata: entity.metadata,
                                visible: entity.visible,
                                parentId: entity.parentId
                            }
                        }
                    });
                });
                this.pendingNetworkUpdates.clear();
            }

            const isMarqueeActive = this.isMarqueeSelecting && this.marqueeStart && this.marqueeEnd;
            if (isMarqueeActive) {
                this.socket.emit('CANVAS_EVENT', {
                    boardId: this.boardId, type: 'MARQUEE_UPDATE', payload: {
                        userName: this.lockUserName,
                        rect: {
                            minX: Math.min(this.marqueeStart!.x, this.marqueeEnd!.x),
                            minY: Math.min(this.marqueeStart!.y, this.marqueeEnd!.y),
                            maxX: Math.max(this.marqueeStart!.x, this.marqueeEnd!.x),
                            maxY: Math.max(this.marqueeStart!.y, this.marqueeEnd!.y)
                        }
                    }
                });
                this.lastMarqueeBroadcast = true;
            } else if (this.lastMarqueeBroadcast) {
                this.socket.emit('CANVAS_EVENT', { boardId: this.boardId, type: 'MARQUEE_UPDATE', payload: { rect: null } });
                this.lastMarqueeBroadcast = false;
            }
        }

        this.animationFrameId = requestAnimationFrame(this.startLoop);
    };
}
