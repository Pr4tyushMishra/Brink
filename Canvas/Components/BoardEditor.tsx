import React, { useEffect, useRef, useState } from 'react';
import { MousePointer2, Square, StickyNote, ZoomIn, ZoomOut, Maximize, Trash2, Type, Circle, Minus, Frame as FrameIcon, Triangle, Diamond, ArrowRight, Shapes, ArrowLeft, Download, Upload } from 'lucide-react';
import type { Board } from '../../types';
import type { ToolType } from '../CanvasEngine';
import { CanvasEngine } from '../CanvasEngine';
import { EVENTS } from '../EventBus';
import { ToolButton, MiniTool, PresetButton } from './ToolButton';

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

    // Inline Text Editing State
    const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const [editingPosition, setEditingPosition] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const [editingStyle, setEditingStyle] = useState({ fontSize: 16, color: '#000', textAlign: 'left', padding: '0px', lineHeight: 'normal' });

    const handleTextEditSave = () => {
        if (!editingEntityId || !engineRef.current) return;
        engineRef.current.scene.updateObject(editingEntityId, {
            props: { text: editingText }
        });
        engineRef.current.selectionModule.select(editingEntityId);
        setEditingEntityId(null);
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

        const handleTextEditRequest = (entityId: string) => {
            const entity = engine.scene.getObject(entityId);
            if (!entity) return;

            setEditingEntityId(entityId);
            setEditingText(entity.props.text || '');

            const zoom = engine.camera.zoom;
            // Get screen coordinates for the text box
            const screenPos = engine.camera.worldToScreen(entity.transform.x, entity.transform.y);

            // Calculate screen bounds so the textarea precisely overlays the shape text content
            let padding = '0px';
            let fontSize = 20 * zoom;
            let lh = '28px';

            if (entity.type === 'STICKY_NOTE') {
                const scale = entity.props.width / 200;
                fontSize = Math.max(16 * scale, 4) * zoom;
                padding = `${16 * scale * zoom}px`;
                lh = `${22 * scale * zoom}px`;
            } else if (entity.type === 'TEXT') {
                const scale = entity.props.width / 250;
                fontSize = Math.max(20 * scale, 4) * zoom;
                padding = `${8 * scale * zoom}px`;
                lh = `${28 * scale * zoom}px`;
            }

            setEditingPosition({
                x: screenPos.x,
                y: screenPos.y,
                w: entity.props.width * zoom,
                h: entity.props.height * zoom
            });

            setEditingStyle({
                fontSize: fontSize,
                color: entity.props.color || '#1e293b',
                textAlign: 'left',
                padding,
                lineHeight: lh
            });
        };
        engine.scene.events.on(EVENTS.REQUEST_TEXT_EDIT, handleTextEditRequest);

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

        const handleEscapeDown = (e: KeyboardEvent) => {
            const activeTag = document.activeElement?.tagName.toLowerCase();
            const isTyping = activeTag === 'input' || activeTag === 'textarea';
            if (!isTyping && (e.key === 'Backspace' || e.key === 'Delete')) {
                engine.selectionModule.deleteSelected();
            }
        };
        window.addEventListener('keydown', handleEscapeDown);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleEscapeDown);
            engine.scene.events.off(EVENTS.REQUEST_IMAGE_UPLOAD, handleImageRequest);
            engine.scene.events.off(EVENTS.REQUEST_TEXT_EDIT, handleTextEditRequest);
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
                        onClick={() => {
                            setShowFrameMenu(!showFrameMenu);
                            setShowShapeMenu(false);
                        }}
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
                        onClick={() => {
                            setShowShapeMenu(!showShapeMenu);
                            setShowFrameMenu(false);
                        }}
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
                {/* Fixed the inline engineRef usage to call a wrapper function if we want, or leave inline with optional chaining */}
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

            {/* Inline Text Editor Overlay */}
            {editingEntityId && (
                <textarea
                    autoFocus
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={handleTextEditSave}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') handleTextEditSave();
                        // Allow shift+enter for new lines, enter to submit
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleTextEditSave();
                        }
                    }}
                    style={{
                        position: 'absolute',
                        left: `${editingPosition.x}px`,
                        top: `${editingPosition.y}px`,
                        width: `${editingPosition.w}px`,
                        minHeight: `${editingPosition.h}px`,
                        background: 'transparent',
                        border: '2px solid #3b82f6',
                        outline: 'none',
                        resize: 'none',
                        padding: editingStyle.padding,
                        margin: 0,
                        fontSize: `${editingStyle.fontSize}px`,
                        fontFamily: '"Inter", sans-serif',
                        color: editingStyle.color,
                        lineHeight: editingStyle.lineHeight,
                        textAlign: editingStyle.textAlign as any,
                        zIndex: 100,
                        backdropFilter: 'blur(4px)',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                    }}
                />
            )}
        </div>
    );
}

// In InfiniteCanvasApp.tsx we will re-export BoardEditor
