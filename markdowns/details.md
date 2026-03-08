# Brink: Professional Real-Time Collaborative Canvas

Brink is a high-performance, infinite canvas platform designed for real-time visual collaboration. Built with a focus on modularity, scalability, and fluid user experience, Brink provides a robust foundation for whiteboarding, diagramming, and collaborative asset management.

## 🚀 Key Capabilities

### 🎨 Custom-Built Infinite Canvas
At the heart of Brink is a bespoke **Canvas Engine** that bypasses heavy third-party libraries for direct-to-canvas rendering.
- **Micro-Kernel Architecture**: Features are decoupled into specialized modules (Selection, Connection, Locking, etc.).
- **Smooth Interaction**: High-frequency 60fps local rendering with 20fps network synchronization.
- **Smart Viewport**: Advanced camera management with support for translation, zooming, and screen-to-world coordinate mapping.

### 🌐 Real-Time Collaboration
- **Socket.io Integration**: Low-latency bidirectional communication for instant synchronization across all connected clients.
- **Ephemeral Syncing**: Drag and resize operations use a "Zero-Write" database strategy—broadcasting 20fps updates to collaborators while only saving the final state to the database, drastically reducing backend load.
- **Presence Tracking**: Real-time visibility of collaborator viewports and active marquee selections.

### 📦 Optimized Asset Pipeline
- **Binary Storage Layer**: Dedicated asset management system that handles binary image uploads via a secure multipart API.
- **Static Delivery**: Images are served via an optimized static file layer rather than being embedded in event history.
- **Database Integrity**: Decouples heavy assets from the event stream, ensuring the MongoDB event-source remains lightweight and performant.

### 🔒 Enterprise-Grade Security
- **JWT Authentication**: Secure, token-based user verification for all API and WebSocket connections.
- **Object-Level Locking**: Prevents editing conflicts by implementing a real-time locking mechanism that grants exclusive access during active manipulation.
- **AuthGuard Middleware**: Robust route protection on the Fastify gateway.

---

## 🏗️ Project Architecture

### Frontend Strategy
The frontend is built with **React**, **TypeScript**, and **Vite**, utilizing a centralized `CanvasEngine` that manages the heavy lifting of the rendering loop.

```text
src/canvas/
├── modules/           # Feature-specific logic (Selection, Connections, Locks)
├── components/        # React UI overlays (BoardEditor, ShareModal)
├── CanvasEngine.ts    # The core rendering & sync orchestrator
├── Renderer.ts        # Pure Drawing / Context2D management
├── SceneManager.ts    # Entity state and spatial indexing
└── ObjectTypes.ts     # Definitions for Shapes, Lines, Frames, and Images
```

### Backend Strategy
The backend uses a **Fastify** gateway designed for high throughput, utilizing **Prisma** as the ORM to interface with **MongoDB**.

```text
src/Backend/
├── apps/api-gateway/  # Fastify server entry and plugin registrations
├── services/          # Core Domain Logic
│   ├── auth/          # JWT & User Management
│   ├── board/         # Board meta-data and sharing logic
│   ├── assets/        # File upload and static asset serving
│   ├── entity/        # Canvas object persistence (Prisma/MongoDB)
│   └── realtime/      # Socket.io SocketManager and event broadcasting
└── prisma/            # Database schema and migrations
```

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Tailwind CSS, Lucide Icons |
| **Canvas** | HTML5 Canvas API (Custom Engine) |
| **Backend** | Node.js, Fastify, TypeScript |
| **Real-time** | Socket.io |
| **Database** | MongoDB (Atlas), Prisma ORM |
| **Storage** | Local Binary Storage (Mountable to S3/Cloudfront) |
| **Auth** | JWT (JSON Web Tokens), bcrypt |

---

## 🚦 Getting Started

1. **Clone the Repo**
2. **Environment Setup**: Copy `.env.example` to `.env` in both the root and `src/Backend/` directories.
3. **Install Dependencies**: `npm install` in both directories.
4. **Database Sync**: `npx prisma db push` (within the Backend folder).
5. **Run Development Mode**: `npm run dev` for frontend and `npm start` for backend.
