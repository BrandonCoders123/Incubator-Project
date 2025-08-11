export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  min: Vector3;
  max: Vector3;
}

export interface CollisionObject {
  id: string;
  position: Vector3;
  size: Vector3;
  type: 'wall' | 'floor' | 'enemy' | 'bullet' | 'player';
}

export interface RaycastHit {
  hit: boolean;
  point?: Vector3;
  distance?: number;
  object?: CollisionObject;
}
