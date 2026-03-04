import { useState, useEffect } from 'react';
import { Shapes, Folder, Trash2, Plus, LayoutDashboard, Frame as FrameIcon, MoreVertical, Clock, LogOut } from 'lucide-react';
import BoardEditor from './InfiniteCanvasApp';
import type { Project, Board } from './types';
import { useAuth } from './contexts/AuthContext';

export default function BrinkDashboard() {
    const { user, token, logout } = useAuth();
    const [currentView, setCurrentView] = useState<'landing' | 'board'>('landing');
    const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
    const [activeBoardMenu, setActiveBoardMenu] = useState<string | null>(null);

    // Core State for Brink
    const [projects, setProjects] = useState<Project[]>([]);
    const [boards, setBoards] = useState<Board[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

    // Fetch boards from the actual database on mount
    useEffect(() => {
        const fetchBoards = async () => {
            if (!token) return;
            try {
                const response = await fetch('http://localhost:3000/api/boards', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();

                // We fake a single active default Project ID for Phase 8 since the backend 
                // schema doesn't have a Project table yet, only Boards.
                const FAKE_DEFAULT_PROJECT_ID = 'default-project-123';

                setProjects([{ id: FAKE_DEFAULT_PROJECT_ID, name: 'My Workspace' }]);
                setActiveProjectId(FAKE_DEFAULT_PROJECT_ID);

                // Map the backend Prisma Board array into our UI type
                const boardList = Array.isArray(data) ? data : (data.boards || []);
                const formattedBoards = boardList.map((b: any) => ({
                    id: b.id,
                    projectId: b.projectId || FAKE_DEFAULT_PROJECT_ID,
                    name: b.name,
                    lastEdited: new Date(b.updatedAt).toLocaleString(),
                    ownerId: b.ownerId,
                    entities: b.entities || []
                }));

                setBoards(formattedBoards);
            } catch (error) {
                console.error('Failed to fetch boards from backend:', error);
            }
        };

        fetchBoards();
    }, []);

    const createProject = () => {
        // ... (Keep existing fake project creation)
        const newProj = { id: crypto.randomUUID(), name: `New Project ${projects.length + 1}` };
        setProjects([...projects, newProj]);
        setActiveProjectId(newProj.id);
    };

    const deleteProject = (id: string) => {
        const updatedProjects = projects.filter(p => p.id !== id);
        setProjects(updatedProjects);
        setBoards(boards.filter(b => b.projectId !== id));
        if (activeProjectId === id) {
            setActiveProjectId(updatedProjects.length > 0 ? updatedProjects[0].id : null);
        }
    };

    const createBoard = async () => {
        if (!activeProjectId || !token) return;

        try {
            const response = await fetch('http://localhost:3000/api/boards', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: 'Untitled Board' })
            });
            const newBoardData = await response.json();

            const newBoard = {
                id: newBoardData.id,
                projectId: activeProjectId,
                name: newBoardData.name,
                lastEdited: 'Just now'
            };

            setBoards([newBoard, ...boards]);
            openBoard(newBoard.id);
        } catch (error) {
            console.error('Failed to create board:', error);
        }
    };

    const openBoard = (id: string) => {
        setActiveBoardId(id);
        setCurrentView('board');
    };

    const deleteBoard = (id: string) => {
        setBoards(boards.filter(b => b.id !== id));
        setActiveBoardMenu(null);
    };

    const activeProjectBoards = boards.filter(b => b.projectId === activeProjectId);
    const activeBoard = boards.find(b => b.id === activeBoardId);

    if (currentView === 'board' && activeBoard) {
        return (
            <BoardEditor
                board={activeBoard}
                onBack={async () => {
                    setCurrentView('landing');
                    setActiveBoardId(null);
                    // Re-fetch boards to ensure we have the latest names in case other collaborators renamed them
                    if (token) {
                        try {
                            const response = await fetch('http://localhost:3000/api/boards', {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            const data = await response.json();
                            const boardList = Array.isArray(data) ? data : (data.boards || []);
                            const FAKE_DEFAULT_PROJECT_ID = 'default-project-123';
                            setBoards(boardList.map((b: any) => ({
                                id: b.id,
                                projectId: b.projectId || FAKE_DEFAULT_PROJECT_ID,
                                name: b.name,
                                lastEdited: new Date(b.updatedAt).toLocaleString(),
                                ownerId: b.ownerId,
                                entities: b.entities || []
                            })));
                        } catch (error) {
                            console.error('Failed to refresh boards on back:', error);
                        }
                    }
                }}
                onRename={(newName) => {
                    setBoards(boards.map(b => b.id === activeBoard.id ? { ...b, name: newName } : b));
                }}
            />
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-screen bg-slate-50 font-sans text-slate-900">

            {/* SIDEBAR */}
            <div className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0 max-h-[40vh] md:max-h-screen">
                <div className="p-6 flex items-center gap-3 border-b border-slate-100">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner">
                        <Shapes size={16} className="text-white" />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-800">Brink</h1>
                </div>

                <div className="flex-1 overflow-y-auto p-4 shrink-0">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">Projects</div>
                    <div className="flex md:flex-col gap-2 md:gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                        {projects.map(proj => (
                            <div
                                key={proj.id}
                                className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors shrink-0 md:shrink border md:border-transparent ${activeProjectId === proj.id
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-slate-600 hover:bg-slate-100'
                                    }`}
                            >
                                <button
                                    onClick={() => setActiveProjectId(proj.id)}
                                    className="flex items-center gap-3 flex-1 truncate"
                                >
                                    <Folder size={16} className={activeProjectId === proj.id ? 'text-blue-600' : 'text-slate-400'} />
                                    <span className="truncate">{proj.name}</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteProject(proj.id); }}
                                    title="Delete Project"
                                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={createProject}
                        className="w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 transition-colors border border-dashed border-slate-300"
                    >
                        <Plus size={16} />
                        <span>New Project</span>
                    </button>
                </div>

                <div className="p-4 border-t border-slate-200">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-600 uppercase">
                            {user?.name?.[0] || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{user?.name || 'Loading...'}</div>
                            <div className="text-xs text-slate-500 truncate">{user?.email || ''}</div>
                        </div>
                        <button
                            onClick={logout}
                            className="text-slate-400 hover:text-red-500 transition-colors p-2"
                            title="Log Out"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex flex-col min-h-0">
                {/* Header */}
                <header className="h-16 px-4 md:px-8 flex items-center justify-between border-b border-slate-200 bg-white shrink-0">
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <LayoutDashboard size={20} className="text-slate-400" />
                        {activeProjectId ? (projects.find(p => p.id === activeProjectId)?.name || 'Project') : 'Select a Project'}
                    </h2>
                    <div className="flex gap-3">
                        <button
                            onClick={createBoard}
                            disabled={!activeProjectId}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={16} />
                            New Board
                        </button>
                    </div>
                </header>

                {/* Dashboard Grid */}
                <div className="flex-1 overflow-y-auto p-8 relative">

                    {/* Overlay to close board menus when clicking outside */}
                    {activeBoardMenu && (
                        <div className="fixed inset-0 z-40" onClick={() => setActiveBoardMenu(null)} />
                    )}

                    {!activeProjectId ? (
                        <div className="h-full flex flex-col items-center justify-center text-center relative z-0">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <Folder size={24} className="text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-2">No Project Selected</h3>
                            <p className="text-slate-500 max-w-sm mb-6">Select a project from the sidebar or create a new one to start working on boards.</p>
                        </div>
                    ) : activeProjectBoards.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center relative z-0">
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                                <FrameIcon size={24} className="text-blue-500" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-2">No boards here yet</h3>
                            <p className="text-slate-500 max-w-sm mb-6">Create your first infinite canvas board to start brainstorming, wiring flows, or designing systems.</p>
                            <button onClick={createBoard} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm">
                                Create First Board
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

                            {/* Add New Board Card */}
                            <button
                                onClick={createBoard}
                                className="group flex flex-col items-center justify-center h-40 md:h-48 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-blue-400 transition-all text-slate-500 hover:text-blue-600 cursor-pointer"
                            >
                                <div className="w-10 h-10 rounded-full bg-slate-200 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                                    <Plus size={20} />
                                </div>
                                <span className="font-medium">Blank Board</span>
                            </button>

                            {/* Board Cards */}
                            {activeProjectBoards.map(board => (
                                <div
                                    key={board.id}
                                    onClick={() => openBoard(board.id)}
                                    className={`group relative bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-blue-300 cursor-pointer transition-all flex flex-col ${activeBoardMenu === board.id ? 'z-50' : 'z-0'}`}
                                >
                                    <div className="h-32 bg-slate-100 relative w-full overflow-hidden rounded-t-xl border-b border-slate-100 flex items-center justify-center">
                                        {/* Mock thumbnail representation based on board name */}
                                        <div className="w-full h-full opacity-30 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]"></div>
                                        {board.ownerId && user && board.ownerId !== user.id && (
                                            <div className="absolute top-3 right-3 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-10 border border-blue-200">
                                                Shared
                                            </div>
                                        )}
                                        {board.name.includes('UI') || board.name.includes('Landing') ? (
                                            <div className="absolute w-24 h-32 bg-white rounded-t-lg shadow-sm border border-slate-200 top-4 left-1/2 -translate-x-1/2"></div>
                                        ) : (
                                            <div className="absolute flex gap-2">
                                                <div className="w-12 h-12 bg-yellow-200 shadow-sm transform -rotate-6"></div>
                                                <div className="w-16 h-12 bg-blue-200 shadow-sm rounded"></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4 flex-1 flex flex-col justify-between">
                                        <div className="flex items-start justify-between relative">
                                            <h3 className="font-semibold text-slate-800 truncate pr-2 group-hover:text-blue-600 transition-colors">{board.name}</h3>
                                            <div className="relative z-50">
                                                <button
                                                    className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-md hover:bg-slate-100"
                                                    onClick={(e) => { e.stopPropagation(); setActiveBoardMenu(activeBoardMenu === board.id ? null : board.id); }}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                                {activeBoardMenu === board.id && (
                                                    <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-xl border border-slate-200 py-1 animate-in fade-in zoom-in-95 duration-100">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }}
                                                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3">
                                            <Clock size={12} />
                                            <span>Edited {board.lastEdited}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}