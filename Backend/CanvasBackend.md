BRINK — COMPLETE BACKEND SYSTEM DESIGN

Version

v1.0 — Infinite Canvas Engine Backend Architecture

⸻

1. Introduction

Brink is an infinite canvas platform built around a modular scene engine. The backend is designed not as a traditional REST server, but as a:

Distributed Event‑Driven Scene Management System

The backend mirrors the frontend architecture to maintain consistency, scalability, and extensibility.

⸻

Core Goals
	•	Modular architecture
	•	Crash isolation between components
	•	Real‑time synchronization
	•	Incremental state updates
	•	Plugin‑based feature expansion
	•	Future‑ready collaboration support
	•	High scalability

⸻

2. System Philosophy

Traditional apps:

Client → CRUD API → Database

Brink architecture:

Client Engine → Events → Backend Engine → Event Store → Modules

Backend acts as a scene coordinator, not just storage.

⸻

3. Core Concepts

3.1 Board

A board represents one infinite canvas workspace.

Contains:
	•	metadata
	•	entities
	•	event history
	•	assets

⸻

3.2 Entity (Core Data Unit)

All canvas objects are entities.

CanvasEntity {
  id: string
  type: string
  transform: {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
  }
  props: Record<string, any>
  metadata: Record<string, any>
  visible: boolean
  parentId?: string
}

Examples:
	•	Rectangle
	•	Sticky note
	•	Frame
	•	Arrow
	•	Image

⸻

3.3 Event‑Based State

Backend stores actions, not only final state.

Example:

{
  "type": "ENTITY_UPDATED",
  "entityId": "abc",
  "changes": { "x": 300 }
}

Benefits
	•	Undo / Redo
	•	Version history
	•	Collaboration sync
	•	Debug replay
	•	Analytics

⸻

4. High‑Level Architecture

                    API Gateway
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
 Board Service     Realtime Service     Asset Service
     │                   │                   │
     └──────────── Backend Event Bus ────────┘
                         │
                    Database Layer


⸻

5. Backend Components

5.1 API Gateway

Responsibilities
	•	Authentication
	•	Validation
	•	Routing
	•	Rate limiting
	•	Logging

Example Endpoints

POST   /boards
GET    /boards/:id
POST   /entities
POST   /events

Gateway NEVER contains business logic.

⸻

5.2 Board Service

Manages board lifecycle.

Responsibilities
	•	Create board
	•	Load board state
	•	Snapshot saving
	•	Metadata updates

⸻

5.3 Entity Service

Handles object‑level operations.

Responsibilities
	•	Create entity
	•	Update entity
	•	Delete entity
	•	Query entities

Entities stored independently for performance.

⸻

5.4 Event Service (System Core)

Central processor of all changes.

Workflow

Client Action
     ↓
Event API
     ↓
Event Store (DB)
     ↓
Backend Event Bus
     ↓
Modules + Realtime Broadcast


⸻

5.5 Realtime Service

WebSocket‑based synchronization.

Handles
	•	Live edits
	•	Multiplayer sync
	•	Presence tracking
	•	Cursor updates (future)

Flow

User A moves object
      ↓
WebSocket
      ↓
Event Service
      ↓
Broadcast
      ↓
User B updates canvas


⸻

5.6 Asset Service

Manages uploaded files.

Supports:
	•	Image uploads
	•	Storage
	•	Thumbnail generation
	•	Secure access URLs

Recommended storage:
	•	AWS S3
	•	MinIO

⸻

6. Backend Event Bus

Internal communication layer.

Services never call each other directly.

eventBus.emit("ENTITY_UPDATED", payload)
eventBus.on("ENTITY_UPDATED", handler)

Advantages:
	•	Loose coupling
	•	Easy extension
	•	Safe module execution

⸻

7. Module (Plugin) System

Backend follows Microkernel Architecture.

Features exist as independent modules.

Module Interface

interface BackendModule {
  name: string
  init(context): void
  onEvent(event): void
  destroy(): void
}

Example Modules
	•	History Module
	•	Analytics Module
	•	Permissions Module
	•	AI Assistant (future)
	•	Notification Module

Crash Isolation

try {
  module.onEvent(event)
} catch (e) {
  logger.error(module.name)
}

One module failure NEVER crashes backend.

⸻

8. Database Design

boards

column	type
id	uuid
projectId	uuid
name	text
createdAt	timestamp
updatedAt	timestamp


⸻

entities

column	type
id	uuid
boardId	uuid
type	text
transform	jsonb
props	jsonb
metadata	jsonb
parentId	uuid


⸻

events

column	type
id	uuid
boardId	uuid
type	text
payload	jsonb
createdAt	timestamp


⸻

assets

column	type
id	uuid
boardId	uuid
url	text
metadata	jsonb


⸻

9. Backend File Structure

backend/
│
├── apps/
│   ├── api-gateway/
│   │     ├── server.ts
│   │     ├── routes/
│   │     └── plugins/
│   │
│   ├── realtime-server/
│   │     ├── socket.ts
│   │     └── presence.ts
│   │
│   └── worker/
│         └── backgroundJobs.ts
│
├── core/
│   ├── event-bus/
│   │     ├── EventBus.ts
│   │     └── EventTypes.ts
│   │
│   ├── kernel/
│   │     └── ModuleLoader.ts
│   │
│   ├── database/
│   │     ├── client.ts
│   │     └── migrations/
│   │
│   └── logger/
│         └── logger.ts
│
├── services/
│   ├── board/
│   │     ├── BoardController.ts
│   │     ├── BoardService.ts
│   │     └── BoardRepository.ts
│   │
│   ├── entity/
│   │     ├── EntityService.ts
│   │     └── EntityRepository.ts
│   │
│   ├── events/
│   │     ├── EventService.ts
│   │     └── EventStore.ts
│   │
│   ├── realtime/
│   │     └── SocketManager.ts
│   │
│   └── assets/
│         └── AssetService.ts
│
├── modules/
│   ├── history/
│   │     └── HistoryModule.ts
│   ├── analytics/
│   │     └── AnalyticsModule.ts
│   └── permissions/
│         └── PermissionsModule.ts
│
├── shared/
│   ├── types/
│   │     └── CanvasEntity.ts
│   └── utils/
│         └── helpers.ts
│
└── index.ts


⸻

10. Data Flow

User Interaction
       ↓
Frontend EventBus
       ↓
API / WebSocket
       ↓
Event Service
       ↓
Database + Event Bus
       ↓
Modules react independently
       ↓
Realtime broadcast


⸻

11. Recommended Technology Stack

Layer	Technology
Runtime	Node.js
Framework	Fastify
Realtime	WebSocket / Socket.io
Database	PostgreSQL
ORM	Prisma / Drizzle
Cache	Redis
Storage	S3 / MinIO


⸻

12. Scaling Strategy

Horizontal Scaling
	•	Stateless API servers
	•	Shared Redis pub/sub
	•	Load‑balanced WebSockets

Performance Techniques
	•	Entity‑level updates
	•	Event batching
	•	Snapshot caching
	•	Lazy board loading

⸻

13. Security Considerations
	•	JWT authentication
	•	Board‑level permissions
	•	Signed asset URLs
	•	Rate limiting
	•	Input validation

⸻

14. Future Features Supported

Architecture already enables:
	•	Multiplayer editing
	•	Cursor presence
	•	Version history timeline
	•	AI design assistance
	•	Comments system
	•	Plugin marketplace
	•	Access permissions
	•	Board sharing

No core rewrite required.

⸻

15. Design Principles
	1.	Everything is an Event
	2.	Services never tightly couple
	3.	Modules are optional extensions
	4.	State evolves through history
	5.	Failure must be isolated
	6.	Frontend and backend mirror architecture

⸻

Final Definition

Brink Backend is:

A modular, event‑driven distributed scene engine powering an infinite collaborative canvas.

It is not a drawing API — it is a platform engine.

⸻

END OF DOCUMENT
