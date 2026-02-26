import type { FeatureModule } from '../SceneManager';
import { SceneManager } from '../SceneManager';
import { EventBus, EVENTS } from '../EventBus';
import type { CanvasEntity } from '../types';
import { getAnchorPoint } from '../types';

export class ConnectionModule implements FeatureModule {
    name = 'ConnectionModule';
    private sceneManager!: SceneManager;
    private eventBus!: EventBus;

    init(sceneManager: SceneManager, eventBus: EventBus) {
        this.sceneManager = sceneManager;
        this.eventBus = eventBus;
        this.eventBus.on(EVENTS.ENTITY_UPDATED, this.onEntityUpdated);
    }

    destroy() {
        this.eventBus.off(EVENTS.ENTITY_UPDATED, this.onEntityUpdated);
    }

    private onEntityUpdated = ({ new: entity }: { old: CanvasEntity, new: CanvasEntity }) => {
        if (entity.type !== 'LINE' && entity.type !== 'ARROW') {
            const lines = this.sceneManager.getAllObjects().filter(o =>
                (o.type === 'LINE' || o.type === 'ARROW') &&
                (o.props.startConnectedId === entity.id || o.props.endConnectedId === entity.id)
            );
            lines.forEach(line => this.updateLineConnections(line));
        }
    };

    public updateLineConnections(line: CanvasEntity) {
        let s = line.props.start || { x: line.transform.x, y: line.transform.y };
        let e = line.props.end || { x: line.transform.x + line.props.width, y: line.transform.y + line.props.height };

        if (line.props.startConnectedId) {
            const startObj = this.sceneManager.getObject(line.props.startConnectedId);
            const typeDef = startObj ? this.sceneManager.getObjectType(startObj.type) : null;
            if (startObj && typeDef) {
                s = getAnchorPoint(typeDef.getBBox(startObj), line.props.startAnchor || 'c');
            }
        }
        if (line.props.endConnectedId) {
            const endObj = this.sceneManager.getObject(line.props.endConnectedId);
            const typeDef = endObj ? this.sceneManager.getObjectType(endObj.type) : null;
            if (endObj && typeDef) {
                e = getAnchorPoint(typeDef.getBBox(endObj), line.props.endAnchor || 'c');
            }
        }

        const minX = Math.min(s.x, e.x);
        const minY = Math.min(s.y, e.y);
        const width = Math.abs(e.x - s.x);
        const height = Math.abs(e.y - s.y);

        this.sceneManager.updateObject(line.id, {
            transform: { x: minX, y: minY },
            props: { ...line.props, width, height, start: s, end: e }
        });
    }
}
