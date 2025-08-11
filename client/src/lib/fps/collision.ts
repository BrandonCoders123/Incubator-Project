import { Vector3, BoundingBox, CollisionObject, RaycastHit } from './types';

export function createBoundingBox(position: Vector3, size: Vector3): BoundingBox {
  return {
    min: {
      x: position.x - size.x / 2,
      y: position.y - size.y / 2,
      z: position.z - size.z / 2,
    },
    max: {
      x: position.x + size.x / 2,
      y: position.y + size.y / 2,
      z: position.z + size.z / 2,
    },
  };
}

export function checkAABBCollision(boxA: BoundingBox, boxB: BoundingBox): boolean {
  return (
    boxA.min.x <= boxB.max.x &&
    boxA.max.x >= boxB.min.x &&
    boxA.min.y <= boxB.max.y &&
    boxA.max.y >= boxB.min.y &&
    boxA.min.z <= boxB.max.z &&
    boxA.max.z >= boxB.min.z
  );
}

export function raycastAABB(
  rayOrigin: Vector3,
  rayDirection: Vector3,
  box: BoundingBox,
  maxDistance: number = 1000
): RaycastHit {
  const tMin = {
    x: (box.min.x - rayOrigin.x) / rayDirection.x,
    y: (box.min.y - rayOrigin.y) / rayDirection.y,
    z: (box.min.z - rayOrigin.z) / rayDirection.z,
  };

  const tMax = {
    x: (box.max.x - rayOrigin.x) / rayDirection.x,
    y: (box.max.y - rayOrigin.y) / rayDirection.y,
    z: (box.max.z - rayOrigin.z) / rayDirection.z,
  };

  const t1 = {
    x: Math.min(tMin.x, tMax.x),
    y: Math.min(tMin.y, tMax.y),
    z: Math.min(tMin.z, tMax.z),
  };

  const t2 = {
    x: Math.max(tMin.x, tMax.x),
    y: Math.max(tMin.y, tMax.y),
    z: Math.max(tMin.z, tMax.z),
  };

  const tNear = Math.max(t1.x, t1.y, t1.z);
  const tFar = Math.min(t2.x, t2.y, t2.z);

  if (tNear > tFar || tFar < 0 || tNear > maxDistance) {
    return { hit: false };
  }

  const distance = tNear > 0 ? tNear : tFar;
  const point = {
    x: rayOrigin.x + rayDirection.x * distance,
    y: rayOrigin.y + rayDirection.y * distance,
    z: rayOrigin.z + rayDirection.z * distance,
  };

  return {
    hit: true,
    point,
    distance,
  };
}

export function sphereAABBCollision(
  sphereCenter: Vector3,
  sphereRadius: number,
  box: BoundingBox
): boolean {
  const closestPoint = {
    x: Math.max(box.min.x, Math.min(sphereCenter.x, box.max.x)),
    y: Math.max(box.min.y, Math.min(sphereCenter.y, box.max.y)),
    z: Math.max(box.min.z, Math.min(sphereCenter.z, box.max.z)),
  };

  const distance = Math.sqrt(
    Math.pow(sphereCenter.x - closestPoint.x, 2) +
    Math.pow(sphereCenter.y - closestPoint.y, 2) +
    Math.pow(sphereCenter.z - closestPoint.z, 2)
  );

  return distance <= sphereRadius;
}
