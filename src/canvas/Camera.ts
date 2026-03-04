import type { Point } from './types';

export class Camera {
    x = 0; y = 0; zoom = 1;
    screenToWorld(sx: number, sy: number): Point { return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y }; }
    worldToScreen(wx: number, wy: number): Point { return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom }; }
}
