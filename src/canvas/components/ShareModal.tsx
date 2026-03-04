import React, { useState, useEffect } from 'react';
import { X, Users, Mail, Copy, Check, Globe } from 'lucide-react';
import type { Board } from '../../types';

interface ShareModalProps {
    board: Board;
    onClose: () => void;
}

import { useAuth } from '../../contexts/AuthContext';

export function ShareModal({ board, onClose }: ShareModalProps) {
    const { token, user } = useAuth();
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'VIEWER' | 'EDITOR'>('VIEWER');
    const [copied, setCopied] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [collaborators, setCollaborators] = useState<any[]>([]);

    useEffect(() => {
        if (!token) return;
        fetch(`http://localhost:3000/api/boards/${board.id}/shares`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    let updatedCollaborators = data;
                    // If the current user is the board owner and not already in the shares list, add them
                    // Since the Frontend 'Board' type doesn't expose ownerId yet from the API by default unless we updated BrinkDashboard,
                    // we'll just check if the array is empty and add the user optimistically as OWNER if so for Phase 9 prototype.
                    if (user && !data.some((col: any) => col.id === user.id)) {
                        updatedCollaborators = [{
                            id: user.id,
                            email: user.email,
                            name: user.name,
                            role: 'OWNER'
                        }, ...data];
                    }
                    setCollaborators(updatedCollaborators);
                }
            })
            .catch(err => console.error("Failed to load shares", err));
    }, [board.id, token, user]);

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail || !token) return;

        setIsSubmitting(true);
        try {
            const response = await fetch(`http://localhost:3000/api/boards/${board.id}/share`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole })
            });
            const data = await response.json();

            if (response.ok) {
                // Fetch latest shares to update UI
                const sharesRes = await fetch(`http://localhost:3000/api/boards/${board.id}/shares`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const sharesData = await sharesRes.json();
                if (Array.isArray(sharesData)) setCollaborators(sharesData);
                setInviteEmail('');
            } else {
                alert(data.error || "Failed to invite user. Have they registered?");
            }
        } catch (error) {
            console.error(error);
            alert("Network error inviting user.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <Users size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Share Board</h2>
                            <p className="text-xs text-slate-500 font-medium truncate max-w-[200px]">"{board.name}"</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-6">
                    {/* Invite Form */}
                    <form onSubmit={handleInvite} className="flex flex-col gap-3">
                        <label className="text-sm font-semibold text-slate-700">Invite Collaborators</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="friend@example.com"
                                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                />
                            </div>
                            <select
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value as 'VIEWER' | 'EDITOR')}
                                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer outline-none"
                            >
                                <option value="VIEWER">Viewer</option>
                                <option value="EDITOR">Editor</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            disabled={!inviteEmail || isSubmitting}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-xl transition-colors text-sm"
                        >
                            {isSubmitting ? 'Sending Invite...' : 'Send Invite'}
                        </button>
                    </form>

                    {/* Copy Link Section */}
                    <div className="flex flex-col gap-3">
                        <label className="text-sm font-semibold text-slate-700">Share Link</label>
                        <div className="flex items-center gap-2 p-1 pl-3 bg-slate-50 border border-slate-200 rounded-xl">
                            <Globe size={16} className="text-slate-400 shrink-0" />
                            <input
                                type="text"
                                readOnly
                                value={window.location.href}
                                className="bg-transparent text-sm text-slate-600 flex-1 min-w-0 outline-none truncate"
                            />
                            <button
                                onClick={copyLink}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors shrink-0
                                    ${copied ? 'bg-green-100 text-green-700' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                            >
                                {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
                            </button>
                        </div>
                    </div>

                    {/* Current Members */}
                    <div className="flex flex-col gap-3">
                        <label className="text-sm font-semibold text-slate-700">Members ({collaborators.length})</label>
                        <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                            {collaborators.map(user => (
                                <div key={user.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm uppercase">
                                            {user.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-slate-800 leading-tight">{user.name || user.email.split('@')[0]}</span>
                                            <span className="text-xs text-slate-500">{user.email}</span>
                                        </div>
                                    </div>
                                    <span className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded-md">
                                        {user.role}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
