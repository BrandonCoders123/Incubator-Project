import * as THREE from "three";

export type EnemyBehavior = "chase" | "kite";
export const ENEMY_BEHAVIOR_BY_TYPE = {
  melee: "chase",
  giant: "chase",
  rat: "chase",
  ranged: "kite",
} as const;

interface EnemyMovementIntentParams {
  behavior: EnemyBehavior;
  toPlayerDirection: THREE.Vector3;
  distanceToPlayer: number;
  moveSpeed: number;
  deltaTime: number;
  healthRatio: number;
  steeringPreference: -1 | 1;
}

export function getEnemyMovementIntent({
  behavior,
  toPlayerDirection,
  distanceToPlayer,
  moveSpeed,
  deltaTime,
  healthRatio,
  steeringPreference,
}: EnemyMovementIntentParams): THREE.Vector3 {
  const step = moveSpeed * deltaTime;
  const lateral = new THREE.Vector3(
    -toPlayerDirection.z,
    0,
    toPlayerDirection.x,
  ).multiplyScalar(steeringPreference * 0.2 * step);

  if (behavior === "kite") {
    const minDistance = healthRatio < 0.5 ? 10 : 8;
    const maxDistance = healthRatio < 0.5 ? 14 : 12;

    if (distanceToPlayer < minDistance) {
      return toPlayerDirection.clone().multiplyScalar(-step);
    }
    if (distanceToPlayer > maxDistance) {
      return toPlayerDirection.clone().multiplyScalar(step).add(lateral);
    }

    return lateral;
  }

  if (healthRatio < 0.3 && distanceToPlayer < 2.5) {
    return toPlayerDirection.clone().multiplyScalar(-step * 0.5).add(lateral);
  }

  return toPlayerDirection.clone().multiplyScalar(step).add(lateral);
}

interface ResolveMovementWithFallbackParams {
  originalPos: THREE.Vector3;
  movementIntent: THREE.Vector3;
  steeringPreference: -1 | 1;
  hasCollision: (position: THREE.Vector3) => boolean;
}

export function resolveMovementWithFallback({
  originalPos,
  movementIntent,
  steeringPreference,
  hasCollision,
}: ResolveMovementWithFallbackParams): {
  resolvedPos: THREE.Vector3;
  appliedMovement: THREE.Vector3;
} {
  const rotatedIntent = (angle: number) =>
    movementIntent.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  const steerSign = steeringPreference >= 0 ? 1 : -1;

  const candidates = [
    movementIntent.clone(),
    new THREE.Vector3(movementIntent.x, 0, 0),
    new THREE.Vector3(0, 0, movementIntent.z),
    rotatedIntent((Math.PI / 8) * steerSign),
    rotatedIntent((Math.PI / 8) * -steerSign),
    rotatedIntent((Math.PI / 4) * steerSign),
    rotatedIntent((Math.PI / 4) * -steerSign),
    rotatedIntent((Math.PI / 2) * steerSign).multiplyScalar(0.8),
  ];

  for (const candidate of candidates) {
    if (candidate.lengthSq() <= 0.000001) continue;
    const targetPos = originalPos.clone().add(candidate);
    if (!hasCollision(targetPos)) {
      return {
        resolvedPos: targetPos,
        appliedMovement: candidate,
      };
    }
  }

  return {
    resolvedPos: originalPos.clone(),
    appliedMovement: new THREE.Vector3(0, 0, 0),
  };
}
