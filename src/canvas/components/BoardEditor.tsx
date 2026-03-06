import React, { useEffect, useRef, useState } from 'react';
import { MousePointer2, Square, StickyNote, ZoomIn, ZoomOut, Maximize, Trash2, Type, Circle, Minus, Frame as FrameIcon, Triangle, Diamond, ArrowRight, Shapes, ArrowLeft, Download, Upload, ImagePlus } from 'lucide-react';
import type { Board } from '../types';
import type { ToolType } from '../CanvasEngine';
import { CanvasEngine } from '../CanvasEngine';
import { EVENTS } from '../EventBus';
import { ToolButton, MiniTool, PresetButton } from './ToolButton';
import { ShareModal } from './ShareModal';
import { useAuth } from '../../contexts/AuthContext';

export function BoardEditor({ board, onBack, onRename }: { board: Board, onBack: () => void, onRename?: (newName: string) => void }) {
    const { token, user } = useAuth();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<CanvasEngine | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const targetFrameRef = useRef<string | null>(null);

    const [activeTool, setActiveTool] = useState<ToolType>('SELECT');
    const [zoomLevel, setZoomLevel] = useState(1);
    const [showShapeMenu, setShowShapeMenu] = useState(false);
    const [showFrameMenu, setShowFrameMenu] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showCollaboratorsMenu, setShowCollaboratorsMenu] = useState(false);
    const [userRole, setUserRole] = useState<'OWNER' | 'EDITOR' | 'VIEWER'>('VIEWER');
    const [collaborators, setCollaborators] = useState<{ id: string, name: string, email: string, role: string }[]>([]);

    const [isEditingName, setIsEditingName] = useState(false);
    const [boardName, setBoardName] = useState(board.name);
    const [isPresenting, setIsPresenting] = useState(false);

    useEffect(() => {
        setBoardName(board.name);
    }, [board.name]);

    const handleRenameSubmit = async () => {
        setIsEditingName(false);
        const newName = boardName.trim();

        if (newName !== '' && newName !== board.name) {
            try {
                const res = await fetch(`http://localhost:3000/api/boards/${board.id}/rename`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: newName })
                });

                if (res.ok) {
                    if (onRename) onRename(newName);
                } else {
                    setBoardName(board.name); // revert if failed
                }
            } catch (err) {
                console.error("Failed to rename board", err);
                setBoardName(board.name); // revert
            }
        } else {
            setBoardName(board.name); // revert if empty or unchanged
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
        if (!canvasRef.current || !token) return;
        const engine = new CanvasEngine(canvasRef.current, board.id, token);
        engineRef.current = engine;

        engine.onToolChange = (tool) => setActiveTool(tool as any);
        engine.onZoomChange = (z) => setZoomLevel(z);
        engine.onRoleAssigned = (role) => setUserRole(role as any);
        engine.lockUserName = user?.name || user?.email || 'User';

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

            let textColor = '#1e293b';
            if (entity.type === 'TEXT') {
                textColor = entity.props.color || '#1e293b';
            }

            setEditingStyle({
                fontSize: fontSize,
                color: textColor,
                textAlign: 'center',
                padding,
                lineHeight: lh
            });
        };
        engine.scene.events.on(EVENTS.REQUEST_TEXT_EDIT, handleTextEditRequest);

        // Fetch existing entities from the database
        fetch(`http://localhost:3000/api/boards/${board.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data && data.entities && data.entities.length > 0) {
                    // If the backend has entities saved, load them directly!
                    engine.scene.loadData(data.entities);
                    engine.isDirty = true;

                    // Clear any selections immediately after load
                    engine.selectionModule.clearSelection();

                    // Redraw connections for any newly loaded lines
                    const objects = engine.scene.getAllObjects();
                    objects.forEach(obj => {
                        if (obj.type === 'LINE' || obj.type === 'ARROW') {
                            engine.connectionModule.updateLineConnections(obj);
                        }
                    });
                } else {
                    // Only inject default content for the original mock boards if they are empty
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
                }
            })
            .catch(err => console.error("Failed to load generic board data for " + board.id, err));

        // Fetch shared collaborators (this endpoint now returns the owner + all shared members)
        fetch(`http://localhost:3000/api/boards/${board.id}/shares`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Filter out the current user — they're already shown as "(You)" at the top
                    setCollaborators(data.filter((c: any) => c.id !== user?.id));
                }
            })
            .catch(err => console.error("Failed to load collaborators", err));

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
    }, [board.id, token]);

    const setTool = (tool: ToolType, preset: string | null = null) => {
        setActiveTool(tool);
        if (engineRef.current) engineRef.current.switchTool(tool, preset);
        setShowShapeMenu(false);
        setShowFrameMenu(false);
        setShowCollaboratorsMenu(false);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const formData = new FormData();
            formData.append('file', file);

            // Need to pass the JWT token for backend authentication
            const response = await fetch('http://localhost:3000/api/assets/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                console.error('Failed to upload image', await response.text());
                return;
            }

            const data = await response.json();

            // The backend gives us a clean, static URL like /uploads/images/xxx.png
            // We create the image entity using this URL instead of a massive base64 string
            const assetUrl = `http://localhost:3000${data.url}`;
            engineRef.current?.addImage(assetUrl, targetFrameRef.current || undefined);

        } catch (error) {
            console.error('Error uploading image:', error);
        } finally {
            targetFrameRef.current = null;
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
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
                            onClick={() => { if (userRole !== 'VIEWER') setIsEditingName(true); }}
                            className={`text-base md:text-lg font-bold text-slate-800 tracking-tight transition-colors truncate max-w-[100px] sm:max-w-[150px] md:max-w-[200px] ${userRole !== 'VIEWER' ? 'cursor-text hover:text-blue-600' : 'cursor-default'}`}
                            title={userRole !== 'VIEWER' ? "Click to rename" : ""}
                        >
                            {board.name}
                        </h1>
                    )}
                    {userRole === 'VIEWER' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md ml-1 tracking-wider uppercase">
                            View Only
                        </span>
                    )}
                </div>
            </div>

            {/* Top Right Action Bar */}
            <div className="absolute top-6 right-6 z-10 flex bg-white rounded-xl shadow-sm border border-slate-200 p-1.5 items-center gap-2 pr-2">
                {/* Placeholder Communication Icons */}
                <div className="flex items-center gap-1 px-2 text-slate-500 border-r border-slate-200 pr-3 mr-1">
                    <button className="p-1.5 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors" title="Activity">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
                    </button>
                    <button className="p-1.5 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors" title="Comments">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    </button>
                    <button className="p-1.5 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors" title="Video Call">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                    </button>
                </div>

                {/* Active Users Group */}
                <div className="flex items-center gap-1">
                    <div className="relative">
                        <div
                            className="group cursor-pointer flex justify-center items-center hover:bg-slate-50 p-1 rounded-lg transition-colors"
                            onClick={() => setShowCollaboratorsMenu(!showCollaboratorsMenu)}
                        >
                            <div className="flex -space-x-2">
                                {/* Current User Avatar — color reflects actual role */}
                                <div
                                    className={`w-8 h-8 rounded-full border-2 border-white text-white flex items-center justify-center font-bold text-sm z-30 shadow-sm ${userRole === 'OWNER' ? 'bg-blue-600' : userRole === 'EDITOR' ? 'bg-emerald-500' : 'bg-slate-400'
                                        }`}
                                    title={`${user?.name || 'You'} (${userRole === 'OWNER' ? 'Host' : userRole})`}
                                >
                                    {user?.name?.[0]?.toUpperCase() || 'U'}
                                </div>
                                {/* Other collaborators — colored by their role */}
                                {collaborators.map((collab, index) => (
                                    <div
                                        key={collab.id}
                                        className={`w-8 h-8 rounded-full border-2 border-white text-white flex items-center justify-center font-bold text-sm shadow-sm ${collab.role === 'OWNER' ? 'bg-blue-600' : collab.role === 'EDITOR' ? 'bg-emerald-500' : 'bg-slate-400'
                                            }`}
                                        style={{ zIndex: 20 - index }}
                                        title={`${collab.name || collab.email} (${collab.role === 'OWNER' ? 'Host' : collab.role})`}
                                    >
                                        {(collab.name || collab.email || '?')[0].toUpperCase()}
                                    </div>
                                ))}
                            </div>
                            <div className="ml-1 text-slate-400 group-hover:text-slate-600">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                            </div>
                        </div>

                        {/* Collaborators Dropdown Menu */}
                        {showCollaboratorsMenu && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                                <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Members</span>
                                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{collaborators.length + 1}</span>
                                </div>

                                <div className="max-h-[300px] overflow-y-auto">
                                    {/* Current User — shows their actual role */}
                                    <div className="px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-sm shrink-0 ${userRole === 'OWNER' ? 'bg-blue-600' : userRole === 'EDITOR' ? 'bg-emerald-500' : 'bg-slate-400'
                                            }`}>
                                            {user?.name?.[0]?.toUpperCase() || 'U'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-800 truncate">
                                                {user?.name || 'You'} <span className="text-xs font-normal text-slate-500 ml-1">(You)</span>
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">{user?.email || ''}</div>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide ${userRole === 'OWNER'
                                            ? 'bg-blue-100 text-blue-700'
                                            : userRole === 'EDITOR'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-100 text-slate-500'
                                            }`}>
                                            {userRole === 'OWNER' ? 'Host' : userRole}
                                        </span>
                                    </div>

                                    {/* Other Members — each with their actual role */}
                                    {collaborators.map((collab) => (
                                        <div key={collab.id} className="px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 border-t border-slate-50">
                                            <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-sm shrink-0 ${collab.role === 'OWNER' ? 'bg-blue-600' : collab.role === 'EDITOR' ? 'bg-emerald-500' : 'bg-slate-400'
                                                }`}>
                                                {(collab.name || collab.email || '?')[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-slate-800 truncate">{collab.name || collab.email.split('@')[0]}</div>
                                                <div className="text-xs text-slate-500 truncate">{collab.email}</div>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide ${collab.role === 'OWNER'
                                                ? 'bg-blue-100 text-blue-700'
                                                : collab.role === 'EDITOR'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                {collab.role === 'OWNER' ? 'Host' : collab.role}
                                            </span>
                                        </div>
                                    ))}

                                    {collaborators.length === 0 && (
                                        <div className="px-4 py-4 text-center text-sm text-slate-500">
                                            No one else is here right now.
                                        </div>
                                    )}
                                </div>

                                {/* Only show Invite button for Host or Editor */}
                                {(userRole === 'OWNER' || userRole === 'EDITOR') && (
                                    <div className="px-4 pt-2 mt-2 border-t border-slate-100">
                                        <button
                                            onClick={() => {
                                                setShowCollaboratorsMenu(false);
                                                setShowShareModal(true);
                                            }}
                                            className="w-full py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                                            Invite People
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <button
                    onClick={() => {
                        const newState = !isPresenting;
                        setIsPresenting(newState);
                        if (engineRef.current) engineRef.current.setPresenting(newState);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 font-medium rounded-lg transition-colors ml-1 ${isPresenting ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    {isPresenting ? 'Presenting...' : 'Present'}
                </button>
                <button
                    onClick={() => setShowShareModal(true)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                    Share
                </button>

                {/* File Utility Dropdown / Extras */}
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={handleExportBoard} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors" title="Export JSON"><Download size={18} /></button>
                <button onClick={() => importInputRef.current?.click()} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors" title="Import JSON"><Upload size={18} /></button>
            </div>

            {/* Main Floating Toolbar - Only show for Editors/Owners */}
            {userRole !== 'VIEWER' && (
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

                    <ToolButton
                        icon={<ImagePlus size={20} />}
                        label="Add Image"
                        active={false}
                        onClick={() => {
                            targetFrameRef.current = null;
                            fileInputRef.current?.click();
                        }}
                    />

                    <div className="w-px h-auto md:w-full md:h-px bg-slate-100 mx-1 md:my-1 md:mx-0 shrink-0"></div>
                    <ToolButton icon={<Trash2 size={20} className="text-red-500" />} label="Delete Selected" active={false} onClick={() => engineRef.current?.selectionModule.deleteSelected()} />
                </div>
            )}

            {(showShapeMenu || showFrameMenu || showCollaboratorsMenu) && (
                <div className="fixed inset-0 z-0" onClick={() => { setShowShapeMenu(false); setShowFrameMenu(false); setShowCollaboratorsMenu(false); }} />
            )}

            {/* Zoom Controls */}
            <div className="absolute top-[80px] right-6 md:top-auto md:bottom-6 md:right-6 bg-white rounded-lg shadow-sm md:shadow-lg border border-slate-200 p-1 flex items-center gap-1 z-10 select-none">
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
            {/* Share Modal */}
            {showShareModal && (
                <ShareModal board={board} onClose={() => setShowShareModal(false)} />
            )}
        </div>
    );
}

// In InfiniteCanvasApp.tsx we will re-export BoardEditor
