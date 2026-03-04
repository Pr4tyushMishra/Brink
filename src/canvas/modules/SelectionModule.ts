import type { FeatureModule } from '../SceneManager';
import { SceneManager } from '../SceneManager';
import { EventBus, EVENTS } from '../EventBus';
import type { CanvasEntity } from '../types';

export class SelectionModule implements FeatureModule {
    name = 'SelectionModule';
    private sceneManager!: SceneManager;
    private eventBus!: EventBus;
    private selectedIds = new Set<string>();

    init(sceneManager: SceneManager, eventBus: EventBus) {
        this.sceneManager = sceneManager;
        this.eventBus = eventBus;
        this.eventBus.on(EVENTS.ENTITY_DELETED, this.onEntityDeleted);
    }

    destroy() {
        this.eventBus.off(EVENTS.ENTITY_DELETED, this.onEntityDeleted);
        this.selectedIds.clear();
    }

    private onEntityDeleted = (entity: CanvasEntity) => {
        if (this.selectedIds.has(entity.id)) {
            this.selectedIds.delete(entity.id);
            this.broadcastSelection();
        }
    };

    select(id: string, multi = false) {
        if (!multi) {
            this.selectedIds.forEach(sid => this.sceneManager.updateObject(sid, { metadata: { selected: false } }));
            this.selectedIds.clear();
        }
        this.selectedIds.add(id);
        this.sceneManager.updateObject(id, { metadata: { selected: true } });
        this.broadcastSelection();
    }

    clearSelection() {
        this.selectedIds.forEach(sid => this.sceneManager.updateObject(sid, { metadata: { selected: false } }));
        this.selectedIds.clear();
        this.broadcastSelection();
    }

    deleteSelected() {
        Array.from(this.selectedIds).forEach(id => this.sceneManager.deleteObject(id));
        this.clearSelection();
    }

    getSelectedIds(): string[] {
        return Array.from(this.selectedIds);
    }

    private broadcastSelection() {
        this.eventBus.emit(EVENTS.SELECTION_CHANGED, this.getSelectedIds());
    }
}
