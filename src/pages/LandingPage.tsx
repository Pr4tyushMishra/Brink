import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, MoveRight, ExternalLink } from 'lucide-react';
import { TubesBackground } from '../components/ui/neon-flow';
import { RadialScrollGallery } from '../components/ui/portfolio-and-image-gallery';
import { AvatarWithName } from '../components/ui/avatar-with-name';
import { Badge } from '../components/ui/badge';

export const LandingPage: React.FC = () => {
    const navigate = useNavigate();

    // Features Data for the Radial Scroll
    const features = [
        {
            id: 1,
            title: "Phase 9 Collaborative",
            cat: "Team Sync",
            img: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=400&q=80",
            desc: "Full multi-tenant Board Sharing with Editors and Viewers.",
        },
        {
            id: 2,
            title: "Realtime WebSocket",
            cat: "Engine",
            img: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80",
            desc: "Sub-10ms syncing powered by Node, Fastify & Socket.io.",
        },
        {
            id: 3,
            title: "Microkernel Arch",
            cat: "Systems",
            img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80",
            desc: "Core engine only routes events. Features are isolated plugins.",
        },
        {
            id: 4,
            title: "MongoDB Prisma",
            cat: "Scale",
            img: "https://images.unsplash.com/photo-1555680202-c86f0e12f086?auto=format&fit=crop&w=400&q=80",
            desc: "Data is flawlessly serialized into a MongoDB Atlas Instance.",
        },
        {
            id: 5,
            title: "Infinite Canvas",
            cat: "Design",
            img: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?auto=format&fit=crop&w=400&q=80",
            desc: "Zoom, pan, and draw limitlessly in a unified graphical plane.",
        },
    ];

    return (
        <div className="bg-white text-black font-sans overflow-x-hidden selection:bg-black selection:text-white">

            {/* Header Navigation */}
            <nav className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-8 py-6 mix-blend-difference text-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mix-blend-screen shadow-lg">
                        <Layers className="text-black w-6 h-6" />
                    </div>
                    <span className="text-2xl font-bold tracking-tight">
                        Brink
                    </span>
                </div>
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => navigate('/auth')}
                        className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold backdrop-blur-md transition-all duration-300 flex items-center gap-2 hover:scale-105"
                    >
                        Start Drawing <MoveRight className="w-4 h-4" />
                    </button>
                </div>
            </nav>

            {/* Section 1: Hero (Neon Tubes Interaction) */}
            <section className="relative w-full h-screen bg-black">
                <TubesBackground className="bg-[#050505]">
                    <div className="flex flex-col items-center justify-center w-full h-full text-center px-4 relative z-10 pointer-events-none">
                        <h1 className="text-5xl md:text-8xl font-serif tracking-tight text-white drop-shadow-[0_4px_40px_rgba(255,255,255,0.4)] max-w-5xl leading-tight">
                            The Infinite Canvas For Infinite Ideas.
                        </h1>
                        <p className="mt-8 text-xl text-white/50 font-light max-w-2xl tracking-wide">
                            Experience real-time, zero-latency collaboration. Design workflows, map out system architectures, and visually brainstorm with your team anywhere on an endless digital whiteboard.
                        </p>
                    </div>
                </TubesBackground>
            </section>

            {/* Section 2: Features (Radial Scroll Gallery) */}
            <section className="relative w-full bg-zinc-50 pt-32 pb-48 text-black shadow-[inset_0_20px_50px_rgba(0,0,0,0.05)] border-t border-zinc-200">
                <div className="text-center mb-16 px-4">
                    <h2 className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase mb-4">Core Architecture</h2>
                    <h3 className="text-4xl md:text-5xl font-bold tracking-tighter">Engineered For Scale.</h3>
                    <p className="mt-4 text-zinc-500 max-w-md mx-auto">Scroll to explore the microscopic components that power the macro experience.</p>
                </div>

                <div className="max-w-7xl mx-auto">
                    <RadialScrollGallery
                        className="!min-h-[700px]"
                        baseRadius={500}
                        mobileRadius={280}
                        visiblePercentage={50}
                        scrollDuration={3000}
                    >
                        {(hoveredIndex) =>
                            features.map((feature, index) => {
                                const isActive = hoveredIndex === index;
                                return (
                                    <div
                                        key={feature.id}
                                        className="group relative w-[220px] h-[300px] sm:w-[280px] sm:h-[400px] overflow-hidden rounded-2xl bg-white border border-zinc-200 shadow-xl"
                                    >
                                        <div className="absolute inset-0 overflow-hidden bg-black">
                                            <img
                                                src={feature.img}
                                                alt={feature.title}
                                                className={`h-full w-full object-cover opacity-80 transition-transform duration-700 ease-out ${isActive ? 'scale-110 blur-0 grayscale-0' : 'scale-100 blur-[2px] grayscale-[80%]'
                                                    }`}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                                        </div>

                                        <div className="absolute inset-0 flex flex-col justify-between p-6">
                                            <div className="flex justify-between items-start">
                                                <Badge className="bg-white/90 text-black backdrop-blur-md rounded-md hover:bg-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1">
                                                    {feature.cat}
                                                </Badge>
                                                <div className={`w-8 h-8 rounded-full bg-white text-black flex items-center justify-center transition-all duration-500 shadow-lg ${isActive ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-45 scale-75'}`}>
                                                    <ExternalLink size={14} />
                                                </div>
                                            </div>

                                            <div className={`transition-all duration-500 text-white ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-50'}`}>
                                                <h3 className="text-2xl font-bold leading-tight mb-2 tracking-tight drop-shadow-md">{feature.title}</h3>
                                                <p className="text-xs font-medium text-white/80 leading-relaxed max-w-[90%]">{feature.desc}</p>
                                                <div className={`h-[2px] bg-white mt-4 transition-all duration-500 ${isActive ? 'w-full opacity-100' : 'w-0 opacity-0'}`} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        }
                    </RadialScrollGallery>
                </div>
            </section>

            {/* Section 3: Developer / About */}
            <section className="relative w-full bg-black text-white py-32 flex flex-col items-center justify-center text-center px-4">
                <div className="max-w-2xl mx-auto space-y-8">
                    <h2 className="text-3xl font-serif mb-8 text-white/90">"A demonstration of Full-Stack Architecture. Built from scratch using modern scalable paradigms."</h2>

                    <div className="flex flex-col items-center justify-center gap-4">
                        <AvatarWithName
                            name="Pratyush Mishra"
                            src="/profilebrink.jpeg"
                            fallback="PM"
                            direction="top"
                            size="lg"
                        />
                        <div>
                            <p className="text-xs tracking-[0.2em] font-bold text-white/40 uppercase mt-4">Platform Architect</p>
                            <a href="https://github.com/Pr4tyushMishra" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 text-sm mt-2 font-medium transition-colors">
                                View Source on GitHub
                            </a>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-8 text-xs text-white/20 font-light tracking-widest uppercase">
                    © 2026 Brink System
                </div>
            </section>

        </div>
    );
};
