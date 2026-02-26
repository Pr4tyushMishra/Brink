import type { CanvasEntity, Transform, BBox } from './types';
import { EventBus, EVENTS } from './EventBus';

export interface ObjectTypeDefinition {
    type: string;
    render: (ctx: CanvasRenderingContext2D, entity: CanvasEntity) => void;
    hitTest: (entity: CanvasEntity, wx: number, wy: number) => boolean;
    getBBox: (entity: CanvasEntity) => BBox;
}

export interface FeatureModule {
    name: string;
    init: (sceneManager: SceneManager, eventBus: EventBus) => void;
    destroy: () => void;
}

export class SceneManager {
    private entities = new Map<string, CanvasEntity>();
    private objectTypes = new Map<string, ObjectTypeDefinition>();
    private modules = new Map<string, FeatureModule>();
    public events = new EventBus();

    registerObjectType(def: ObjectTypeDefinition) {
        this.objectTypes.set(def.type, def);
    }

    getObjectType(type: string): ObjectTypeDefinition | undefined {
        return this.objectTypes.get(type);
    }

    registerFeatureModule(module: FeatureModule) {
        if (this.modules.has(module.name)) return;
        try {
            module.init(this, this.events);
            this.modules.set(module.name, module);
        } catch (error) {
            console.error(`Failed to initialize module ${module.name}:`, error);
        }
    }

    unregisterFeatureModule(moduleName: string) {
        const module = this.modules.get(moduleName);
        if (module) {
            try { module.destroy(); } catch (error) { }
            this.modules.delete(moduleName);
        }
    }

    createObject(type: string, props: Record<string, any> = {}, transform?: Partial<Transform>, metadata: Record<string, any> = {}, parentId?: string): string {
        const id = crypto.randomUUID();
        const entity: CanvasEntity = {
            id, type,
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...transform },
            props, metadata, visible: true, parentId
        };

        this.entities.set(id, entity);
        this.events.emit(EVENTS.ENTITY_CREATED, entity);
        return id;
    }

    updateObject(id: string, updates: Partial<Pick<CanvasEntity, 'props' | 'metadata' | 'visible' | 'parentId'>> & { transform?: Partial<Transform> }) {
        const entity = this.entities.get(id);
        if (!entity) return;

        const updatedEntity = {
            ...entity, ...updates,
            transform: updates.transform ? { ...entity.transform, ...updates.transform } : entity.transform,
            props: updates.props ? { ...entity.props, ...updates.props } : entity.props,
            metadata: updates.metadata ? { ...entity.metadata, ...updates.metadata } : entity.metadata,
        };

        this.entities.set(id, updatedEntity);
        this.events.emit(EVENTS.ENTITY_UPDATED, { old: entity, new: updatedEntity });
    }

    deleteObject(id: string) {
        const entity = this.entities.get(id);
        if (entity) {
            this.entities.delete(id);
            this.events.emit(EVENTS.ENTITY_DELETED, entity);
        }
    }

    getObject(id: string): CanvasEntity | undefined {
        return this.entities.get(id);
    }

    getAllObjects(): CanvasEntity[] {
        return Array.from(this.entities.values());
    }

    loadData(objects: CanvasEntity[]) {
        this.entities.clear();
        objects.forEach(obj => this.entities.set(obj.id, obj));
    }
}
