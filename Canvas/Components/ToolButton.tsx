import React from 'react';

export function ToolButton({ icon, active, onClick, label }: { icon: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
    return (
        <button onClick={onClick} title={label} className={`p-3 rounded-lg transition-all duration-200 shrink-0 ${active ? 'bg-blue-50 text-blue-600 shadow-sm border border-blue-200' : 'text-slate-600 hover:bg-slate-100 border border-transparent hover:text-slate-900'}`}>
            {icon}
        </button>
    );
}

export function MiniTool({ icon, active, onClick, title }: { icon: React.ReactNode, active: boolean, onClick: () => void, title: string }) {
    return (
        <button onClick={onClick} title={title} className={`p-2 rounded-md flex justify-center items-center transition-colors ${active ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`}>
            {icon}
        </button>
    );
}

export function PresetButton({ label, onClick }: { label: string, onClick: () => void }) {
    return (
        <button onClick={onClick} className="text-left px-3 py-1.5 text-sm hover:bg-slate-100 rounded-md text-slate-700 transition-colors">
            {label}
        </button>
    );
}

