import React, {
  Suspense,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  KeyboardControls,
  useKeyboardControls,
  useTexture,
} from "@react-three/drei";
import * as THREE from "three";
import "@fontsource/inter";

import { useSettings } from "./lib/stores/useSettings"; // 👈 new

// Weapon definitions
interface Weapon {
  name: string;
  maxAmmo: number;
  damage: number;
  reloadTime: number;
  fireRate: number; // shots per second, 0 for semi-auto
  bulletsPerKill: number;
}

const weapons: Record<number, Weapon> = {
  1: {
    name: "Ketchup Squirter",
    maxAmmo: 12,
    damage: 50,
    reloadTime: 2000,
    fireRate: 0, // semi-auto
    bulletsPerKill: 1,
  },
  2: {
    name: "SPSL (Super Pressurized Sauce Launsher)",
    maxAmmo: 8,
    damage: 75,
    reloadTime: 3000,
    fireRate: 0, // semi-auto
    bulletsPerKill: 1,
  },
  3: {
    name: "Topping Shooter",
    maxAmmo: 30,
    damage: 30,
    reloadTime: 2500,
    fireRate: 10, // 10 shots per second
    bulletsPerKill: 2,
  },
  4: {
    name: "LMG(Lacerating Muffin Generator)",
    maxAmmo: 60,
    damage: 40,
    reloadTime: 4000,
    fireRate: 12, // 12 shots per second
    bulletsPerKill: 2,
  },
};

// Story elements
const SETTLEMENTS = [
  "Bun Valley Outpost",
  "Condiment Creek Base",
  "Relish Ridge Fortress",
  "Mustard Mountain Stronghold",
];

// Level definitions
const LEVELS = [
  {
    id: 1,
    name: "Bun Valley Outpost",
    description: "The journey begins at the outer settlements",
    killsRequired: 15,
    spawnRate: 3,
    maxEnemies: 10,
  },
  {
    id: 2,
    name: "Robot Factory",
    description: "The source of the mechanical menace",
    killsRequired: 25,
    spawnRate: 2.5,
    maxEnemies: 12,
  },
  {
    id: 3,
    name: "Palace of the Robot King",
    description: "The throne room awaits",
    killsRequired: 30,
    spawnRate: 2,
    maxEnemies: 12,
  },
  {
    id: 4,
    name: "Crimson Battlefield",
    description: "The robots launch their counter-attack",
    killsRequired: 50,
    spawnRate: 1.8,
    maxEnemies: 18,
  },
  {
    id: 5,
    name: "Mustard Mountain Summit",
    description: "Final showdown - rescue your parents!",
    killsRequired: 50,
    spawnRate: 1.5,
    maxEnemies: 20,
  },
];

// Enemy types and archetypes
type EnemyType = "melee" | "ranged" | "giant";

interface Enemy {
  id: string;
  type: EnemyType;
  position: [number, number, number];
  velocity: [number, number, number];
  health: number;
  nextAttackAt: number;
}

interface EnemyArchetype {
  health: number;
  moveSpeed: number;
  damage: number;
  attackInterval: number;
  color: string;
  size?: number; // Optional size multiplier (default 1)
}

const ENEMY_ARCHETYPES: Record<EnemyType, EnemyArchetype> = {
  melee: {
    health: 100,
    moveSpeed: 5,
    damage: 10,
    attackInterval: 1000,
    color: "#ff0000",
  },
  ranged: {
    health: 100,
    moveSpeed: 4,
    damage: 10,
    attackInterval: 2000, // Medium fire rate
    color: "#ff6600",
  },
  giant: {
    health: 400,
    moveSpeed: 3,
    damage: 25,
    attackInterval: 1500,
    color: "#990000",
    size: 2, // 2x larger than normal enemies
  },
};

interface Wall {
  position: [number, number, number];
  size: [number, number, number];
}

interface Ramp {
  position: [number, number, number];
  rotation: number;
  width: number;
  length: number;
}

// Simple game state
interface GameState {
  health: number;
  maxHealth: number; // Added for token health buffs
  ammo: number;
  coins: number; // Changed from score to coins
  gamePhase:
    | "login"
    | "register"
    | "menu"
    | "leaderboard"
    | "settings"
    | "profile"
    | "shop"
    | "inventory"
    | "introCutscene"
    | "playing"
    | "paused"
    | "gameover"
    | "victory"
    | "levelTransition";
  enemies: Enemy[];
  bullets: Array<{
    id: string;
    position: [number, number, number];
    direction: [number, number, number];
    damage: number;
  }>;
  enemyProjectiles: Array<{
    id: string;
    position: [number, number, number];
    direction: [number, number, number];
    damage: number;
  }>;
  walls: Wall[];
  ramps: Ramp[];
  user: {
    username: string | null;
    isGuest: boolean;
    currency: number;
    cosmetics: string[];
    equippedSkin: string | null;
  };
  story: {
    currentSettlement: number;
    alliesRescued: number;
    settlementsConquered: string[];
    totalKills: number;
  };
  level: {
    currentLevel: number;
    killsThisLevel: number;
    giantsSpawnedThisLevel: number;
  };
  unlockedWeapons: number[]; // Array of weapon IDs that are unlocked
  inventory: string[]; // Items purchased (like "token")
  tokensPurchased: number; // Track number of health buff tokens purchased
  lastDamageTime: number;
  currentWeapon: number;
  isReloading: boolean;
  reloadStartTime: number;
  lastShotTime: number;
  previousGamePhase: string | null; // Track where user came from (for settings back navigation)
}

interface ShopItem {
  id: number;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  rarity: string;
  category: string;
}

// Wall collision detection helper - AABB collision
function checkWallCollision(
  position: THREE.Vector3,
  walls: { position: number[]; size: number[] }[],
  radius: number = 0.5,
): boolean {
  for (const wall of walls) {
    const [wx, wy, wz] = wall.position;
    const [ww, wh, wd] = wall.size;

    // AABB collision check
    const halfWidth = ww / 2;
    const halfDepth = wd / 2;
    const halfHeight = wh / 2;

    if (
      position.x + radius > wx - halfWidth &&
      position.x - radius < wx + halfWidth &&
      position.z + radius > wz - halfDepth &&
      position.z - radius < wz + halfDepth &&
      position.y + radius > wy - halfHeight &&
      position.y - radius < wy + halfHeight
    ) {
      return true; // Collision detected
    }
  }
  return false;
}

// Ramp collision detection helper
function checkRampCollision(
  position: THREE.Vector3,
  ramps: Ramp[],
  radius: number = 0.5,
): boolean {
  for (const ramp of ramps) {
    const [rx, ry, rz] = ramp.position;
    // Treat ramp as a simple box for collision (horizontal check)
    const halfWidth = ramp.width / 2;
    const halfLength = ramp.length / 2;

    if (
      position.x + radius > rx - halfWidth &&
      position.x - radius < rx + halfWidth &&
      position.z + radius > rz - halfLength &&
      position.z - radius < rz + halfLength &&
      position.y < ry + 2 // Check if player is at ramp height
    ) {
      return true; // Collision detected
    }
  }
  return false;
}

// Get ramps for current level
function getRampsForLevel(level: number): Ramp[] {
  if (level === 1 || level === 2) {
    return [
      { position: [-15, 1, -20], rotation: 0, width: 4, length: 8 },
      { position: [15, 1, 20], rotation: Math.PI, width: 4, length: 8 },
    ];
  } else if (level === 3) {
    return [
      { position: [-20, 1, 20], rotation: Math.PI / 4, width: 4, length: 8 },
      { position: [20, 1, -20], rotation: -Math.PI / 4, width: 4, length: 8 },
      { position: [0, 1, 22], rotation: Math.PI / 2, width: 4, length: 6 },
    ];
  } else if (level === 4) {
    return [
      { position: [-22, 1, 0], rotation: 0, width: 4, length: 8 },
      { position: [22, 1, 0], rotation: Math.PI, width: 4, length: 8 },
      { position: [0, 1, -22], rotation: Math.PI / 2, width: 4, length: 8 },
      { position: [0, 1, 22], rotation: -Math.PI / 2, width: 4, length: 8 },
    ];
  }
  return [];
}

// Get walls for current level
function getWallsForLevel(
  level: number,
): { position: number[]; size: number[] }[] {
  if (level === 0) {
    return [
      { position: [30, 5, 0], size: [1, 10, 60] },
      { position: [-30, 5, 0], size: [1, 10, 60] },
      { position: [0, 5, 30], size: [60, 10, 1] },
      { position: [0, 5, -30], size: [60, 10, 1] },
    ];
  } else if (level === 1) {
    return [
      { position: [30, 5, 0], size: [1, 10, 60] },
      { position: [-30, 5, 0], size: [1, 10, 60] },
      { position: [0, 5, 30], size: [60, 10, 1] },
      { position: [0, 5, -30], size: [60, 10, 1] },
      { position: [0, 5, 0], size: [20, 10, 1] },
      { position: [-10, 5, 15], size: [1, 10, 10] },
      { position: [10, 5, -15], size: [1, 10, 10] },
      { position: [-15, 5, -10], size: [10, 10, 1] },
      { position: [15, 5, 10], size: [10, 10, 1] },
    ];
  } else if (level === 2) {
    return [
      { position: [30, 5, 0], size: [1, 10, 60] },
      { position: [-30, 5, 0], size: [1, 10, 60] },
      { position: [0, 5, 30], size: [60, 10, 1] },
      { position: [0, 5, -30], size: [60, 10, 1] },
      { position: [0, 5, 10], size: [25, 10, 1] },
      { position: [-12, 5, 0], size: [1, 10, 20] },
      { position: [12, 5, 0], size: [1, 10, 20] },
      { position: [-18, 5, -15], size: [12, 10, 1] },
      { position: [18, 5, -15], size: [12, 10, 1] },
      { position: [0, 5, -20], size: [20, 10, 1] },
    ];
  } else if (level === 3) {
    return [
      { position: [30, 5, 0], size: [1, 10, 60] },
      { position: [-30, 5, 0], size: [1, 10, 60] },
      { position: [0, 5, 30], size: [60, 10, 1] },
      { position: [0, 5, -30], size: [60, 10, 1] },
      { position: [-15, 5, 10], size: [15, 10, 1] },
      { position: [15, 5, -10], size: [15, 10, 1] },
      { position: [5, 5, 0], size: [1, 10, 25] },
      { position: [-5, 5, -15], size: [1, 10, 15] },
      { position: [20, 5, 15], size: [10, 10, 1] },
      { position: [-20, 5, -15], size: [10, 10, 1] },
    ];
  } else if (level === 4) {
    return [
      { position: [30, 5, 0], size: [1, 10, 60] },
      { position: [-30, 5, 0], size: [1, 10, 60] },
      { position: [0, 5, 30], size: [60, 10, 1] },
      { position: [0, 5, -30], size: [60, 10, 1] },
      { position: [0, 5, 15], size: [30, 10, 1] },
      { position: [0, 5, -15], size: [30, 10, 1] },
      { position: [15, 5, 0], size: [1, 10, 30] },
      { position: [-15, 5, 0], size: [1, 10, 30] },
      { position: [22, 5, 22], size: [8, 10, 8] },
      { position: [-22, 5, -22], size: [8, 10, 8] },
    ];
  }
  return [];
}

// Environment Component
function GameEnvironment({ gameState }: { gameState: GameState }) {
  const grassTexture = useTexture("/textures/grass.png");
  const asphaltTexture = useTexture("/textures/asphalt.png");
  const woodTexture = useTexture("/textures/wood.jpg");

  grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(10, 10);

  // Different wall layouts for each level - use the shared function
  const walls = getWallsForLevel(gameState.level.currentLevel);
  const ramps = getRampsForLevel(gameState.level.currentLevel);

  return (
    <>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshLambertMaterial map={grassTexture} />
      </mesh>

      {/* Render walls */}
      {walls.map((wall, index) => (
        <mesh
          key={`wall-${index}`}
          position={wall.position as [number, number, number]}
        >
          <boxGeometry args={wall.size as [number, number, number]} />
          <meshLambertMaterial map={woodTexture} color="#8B4513" />
        </mesh>
      ))}

      {/* Render ramps */}
      {ramps.map((ramp, index) => (
        <mesh
          key={`ramp-${index}`}
          position={ramp.position as [number, number, number]}
          rotation={[0, ramp.rotation, Math.PI / 6]}
        >
          <boxGeometry args={[ramp.width, 0.5, ramp.length]} />
          <meshLambertMaterial map={asphaltTexture} color="#666666" />
        </mesh>
      ))}

      {/* Central platform */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[8, 1, 8]} />
        <meshLambertMaterial map={asphaltTexture} />
      </mesh>
    </>
  );
}

// Player Component
function Player({
  gameState,
  setGameState,
}: {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const { camera } = useThree();
  const [, getKeys] = useKeyboardControls();

  const playerRef = useRef<THREE.Group>(null);
  const velocityRef = useRef(new THREE.Vector3());
  const rotationRef = useRef({ x: 0, y: 0 });
  const isOnGroundRef = useRef(true);
  const mouseDownRef = useRef(false);
  const weaponAmmo = useRef<Record<number, number>>({
    1: 15,
    2: 20,
    3: 40,
    4: 100,
  });
  const gameStateRef = useRef(gameState);

  // Keep gameStateRef in sync
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Reset player position when level changes to prevent getting stuck in walls
  useEffect(() => {
    if (playerRef.current) {
      // Level-specific safe spawn points
      const spawnPoints: Record<number, [number, number, number]> = {
        0: [0, 1, 0], // Level 1: Center is safe
        1: [0, 1, -15], // Level 2 (Robot Factory): Spawn away from center wall
        2: [0, 1, 20], // Level 3 (Palace): Spawn in safe area
        3: [-10, 1, -10], // Level 4 (Crimson Battlefield): Spawn in corner
        4: [0, 1, 0], // Level 5 (Mustard Mountain): Center spawn
      };

      const spawnPoint = spawnPoints[gameState.level.currentLevel] || [0, 1, 0];
      playerRef.current.position.set(...spawnPoint);
      velocityRef.current.set(0, 0, 0);
      rotationRef.current = { x: 0, y: 0 };
    }
  }, [gameState.level.currentLevel]);

  // Mouse controls - optimized to prevent re-attachment on every state change
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (
        document.pointerLockElement &&
        gameStateRef.current.gamePhase === "playing"
      ) {
        // Get sensitivity from settings store (base * multiplier)
        const { normalSensitivity } = useSettings.getState();
        const sensitivity = 0.002 * normalSensitivity;
        rotationRef.current.y -= event.movementX * sensitivity;
        rotationRef.current.x -= event.movementY * sensitivity;
        rotationRef.current.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, rotationRef.current.x),
        );
      }
    };

    const handleMouseDown = () => {
      mouseDownRef.current = true;
      const currentState = gameStateRef.current;
      // Fire immediately for semi-auto weapons (single click)
      if (
        currentState.gamePhase === "playing" &&
        currentState.ammo > 0 &&
        !currentState.isReloading
      ) {
        const currentWeapon = weapons[currentState.currentWeapon];
        if (currentWeapon.fireRate === 0) {
          // Semi-automatic
          const now = Date.now();
          if (now - currentState.lastShotTime >= 100) {
            // Minimum delay for semi-auto
            // Shoot bullet
            const direction = new THREE.Vector3(
              -Math.sin(rotationRef.current.y),
              Math.sin(rotationRef.current.x),
              -Math.cos(rotationRef.current.y),
            ).normalize();

            const bulletPos = camera.position
              .clone()
              .add(direction.clone().multiplyScalar(1));

            // Update weapon ammo ref
            weaponAmmo.current[currentState.currentWeapon] =
              currentState.ammo - 1;

            setGameState((prev) => ({
              ...prev,
              ammo: prev.ammo - 1,
              bullets: [
                ...prev.bullets,
                {
                  id: `bullet_${Date.now()}`,
                  position: [bulletPos.x, bulletPos.y, bulletPos.z],
                  direction: [direction.x, direction.y, direction.z],
                  damage: currentWeapon.damage,
                },
              ],
              lastShotTime: now,
            }));

            console.log(`${currentWeapon.name} fired!`);
          }
        }
      }
    };

    const handleMouseUp = () => {
      mouseDownRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [camera, setGameState]);

  useFrame((state, deltaTime) => {
    if (gameState.gamePhase !== "playing") return;

    const keys = getKeys();

    // Automatic firing for automatic weapons
    const currentWeapon = weapons[gameState.currentWeapon];
    if (
      mouseDownRef.current &&
      currentWeapon.fireRate > 0 &&
      gameState.ammo > 0 &&
      !gameState.isReloading
    ) {
      const now = Date.now();
      const fireInterval = 1000 / currentWeapon.fireRate;

      if (now - gameState.lastShotTime >= fireInterval) {
        // Shoot bullet
        const direction = new THREE.Vector3(
          -Math.sin(rotationRef.current.y),
          Math.sin(rotationRef.current.x),
          -Math.cos(rotationRef.current.y),
        ).normalize();

        const bulletPos = camera.position
          .clone()
          .add(direction.clone().multiplyScalar(1));

        // Update weapon ammo ref
        weaponAmmo.current[gameState.currentWeapon] = gameState.ammo - 1;

        setGameState((prev) => ({
          ...prev,
          ammo: prev.ammo - 1,
          bullets: [
            ...prev.bullets,
            {
              id: `bullet_${Date.now()}`,
              position: [bulletPos.x, bulletPos.y, bulletPos.z],
              direction: [direction.x, direction.y, direction.z],
              damage: currentWeapon.damage,
            },
          ],
          lastShotTime: now,
        }));

        console.log(`${currentWeapon.name} auto-firing!`);
      }
    }

    // Movement
    const moveSpeed = 8;
    const jumpSpeed = 12;

    // Update player rotation and billboarding
    if (playerRef.current) {
      // Billboard effect - make player sprite always face camera
      const playerMesh = playerRef.current.children[0] as THREE.Mesh;
      if (playerMesh) {
        playerMesh.lookAt(camera.position);
      }

      // Update camera position and look direction
      const cameraOffset = new THREE.Vector3(0, 1.4, 0);
      camera.position.copy(playerRef.current.position).add(cameraOffset);

      // Calculate look direction based on rotation values
      const direction = new THREE.Vector3(
        -Math.sin(rotationRef.current.y) * Math.cos(rotationRef.current.x),
        Math.sin(rotationRef.current.x),
        -Math.cos(rotationRef.current.y) * Math.cos(rotationRef.current.x),
      );

      // Set camera to look in the calculated direction
      const lookAt = camera.position.clone().add(direction);
      camera.lookAt(lookAt);
    }

    // Movement direction
    const forward = new THREE.Vector3(
      -Math.sin(rotationRef.current.y),
      0,
      -Math.cos(rotationRef.current.y),
    );
    const right = new THREE.Vector3(
      Math.cos(rotationRef.current.y),
      0,
      -Math.sin(rotationRef.current.y),
    );

    const moveDirection = new THREE.Vector3();
    if (keys.forward) moveDirection.add(forward);
    if (keys.backward) moveDirection.sub(forward);
    if (keys.leftward) moveDirection.sub(right);
    if (keys.rightward) moveDirection.add(right);

    if (moveDirection.length() > 0) moveDirection.normalize();

    velocityRef.current.x = moveDirection.x * moveSpeed;
    velocityRef.current.z = moveDirection.z * moveSpeed;

    // Jump
    if (keys.jump && isOnGroundRef.current) {
      velocityRef.current.y = jumpSpeed;
      isOnGroundRef.current = false;
    }

    // Gravity
    velocityRef.current.y -= 30 * deltaTime;

    // Update position
    if (playerRef.current) {
      const newPos = playerRef.current.position
        .clone()
        .add(velocityRef.current.clone().multiplyScalar(deltaTime));

      // Ground collision
      if (newPos.y < 1) {
        newPos.y = 1;
        velocityRef.current.y = 0;
        isOnGroundRef.current = true;
      }

      // Wall collision detection
      const walls = getWallsForLevel(gameState.level.currentLevel);
      const ramps = getRampsForLevel(gameState.level.currentLevel);

      const hasWallCollision = checkWallCollision(newPos, walls, 0.5);
      const hasRampCollision = checkRampCollision(newPos, ramps, 0.5);

      if (hasWallCollision || hasRampCollision) {
        // Collision detected, don't move in that direction
        // Try sliding along obstacles - check X and Z separately
        const xOnly = playerRef.current.position.clone();
        xOnly.x = newPos.x;
        const zOnly = playerRef.current.position.clone();
        zOnly.z = newPos.z;

        const canMoveX =
          !checkWallCollision(xOnly, walls, 0.5) &&
          !checkRampCollision(xOnly, ramps, 0.5);
        const canMoveZ =
          !checkWallCollision(zOnly, walls, 0.5) &&
          !checkRampCollision(zOnly, ramps, 0.5);

        if (canMoveX) {
          // Can move in X direction
          newPos.x = xOnly.x;
          newPos.z = playerRef.current.position.z;
        } else if (canMoveZ) {
          // Can move in Z direction
          newPos.z = zOnly.z;
          newPos.x = playerRef.current.position.x;
        } else {
          // Can't move at all, revert to current position
          newPos.copy(playerRef.current.position);
        }
      }

      playerRef.current.position.copy(newPos);
    }

    // Weapon switching (only unlocked weapons)
    if (
      keys.weapon1 &&
      gameState.currentWeapon !== 1 &&
      gameState.unlockedWeapons.includes(1)
    ) {
      weaponAmmo.current[gameState.currentWeapon] = gameState.ammo; // Save current ammo
      setGameState((prev) => ({
        ...prev,
        currentWeapon: 1,
        ammo: weaponAmmo.current[1],
        isReloading: false,
      }));
    }
    if (
      keys.weapon2 &&
      gameState.currentWeapon !== 2 &&
      gameState.unlockedWeapons.includes(2)
    ) {
      weaponAmmo.current[gameState.currentWeapon] = gameState.ammo; // Save current ammo
      setGameState((prev) => ({
        ...prev,
        currentWeapon: 2,
        ammo: weaponAmmo.current[2],
        isReloading: false,
      }));
    }
    if (
      keys.weapon3 &&
      gameState.currentWeapon !== 3 &&
      gameState.unlockedWeapons.includes(3)
    ) {
      weaponAmmo.current[gameState.currentWeapon] = gameState.ammo; // Save current ammo
      setGameState((prev) => ({
        ...prev,
        currentWeapon: 3,
        ammo: weaponAmmo.current[3],
        isReloading: false,
      }));
    }
    if (
      keys.weapon4 &&
      gameState.currentWeapon !== 4 &&
      gameState.unlockedWeapons.includes(4)
    ) {
      weaponAmmo.current[gameState.currentWeapon] = gameState.ammo; // Save current ammo
      setGameState((prev) => ({
        ...prev,
        currentWeapon: 4,
        ammo: weaponAmmo.current[4],
        isReloading: false,
      }));
    }

    // Reload
    const weapon = weapons[gameState.currentWeapon];
    if (
      keys.reload &&
      !gameState.isReloading &&
      gameState.ammo < weapon.maxAmmo
    ) {
      setGameState((prev) => ({
        ...prev,
        isReloading: true,
        reloadStartTime: Date.now(),
      }));
    }

    // Check if reload is complete
    if (
      gameState.isReloading &&
      Date.now() - gameState.reloadStartTime >= weapon.reloadTime
    ) {
      const newAmmo = weapon.maxAmmo;
      weaponAmmo.current[gameState.currentWeapon] = newAmmo; // Update ref
      setGameState((prev) => ({
        ...prev,
        isReloading: false,
        ammo: newAmmo,
      }));
    }

    // Pause
    if (keys.pause) {
      setGameState((prev) => ({ ...prev, gamePhase: "paused" }));
      document.exitPointerLock();
    }

    // Update bullets
    setGameState((prev) => ({
      ...prev,
      bullets: prev.bullets
        .map((bullet) => ({
          ...bullet,
          position: [
            bullet.position[0] + bullet.direction[0] * 50 * deltaTime,
            bullet.position[1] + bullet.direction[1] * 50 * deltaTime,
            bullet.position[2] + bullet.direction[2] * 50 * deltaTime,
          ] as [number, number, number],
        }))
        .filter(
          (bullet) =>
            Math.abs(bullet.position[0]) < 30 &&
            Math.abs(bullet.position[2]) < 30 &&
            bullet.position[1] > 0 &&
            bullet.position[1] < 20,
        ),
    }));
  });

  return (
    <group ref={playerRef} position={[0, 1, 0]}>
      <mesh>
        <planeGeometry args={[0.8, 2]} />
        <meshBasicMaterial
          color="#4444ff"
          side={THREE.DoubleSide}
          transparent
          opacity={0}
        />
      </mesh>
    </group>
  );
}

// Robot Model Component
function RobotModel({ isAttacking }: { isAttacking: boolean }) {
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (isAttacking && leftArmRef.current && rightArmRef.current) {
      // Attack animation - swing arms forward
      const attackSpeed = 10;
      const swingAngle = Math.sin(state.clock.elapsedTime * attackSpeed) * 0.5;
      leftArmRef.current.rotation.x = swingAngle;
      rightArmRef.current.rotation.x = swingAngle;
    } else if (leftArmRef.current && rightArmRef.current) {
      // Idle animation - slight bobbing
      const idleSpeed = 2;
      const bobAngle = Math.sin(state.clock.elapsedTime * idleSpeed) * 0.1;
      leftArmRef.current.rotation.x = bobAngle;
      rightArmRef.current.rotation.x = bobAngle;
    }
  });

  return (
    <group>
      {/* Body - main torso */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.6, 0.8, 0.4]} />
        <meshStandardMaterial color="#444444" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.5, 0.4, 0.4]} />
        <meshStandardMaterial color="#666666" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Eyes - glowing red */}
      <mesh position={[-0.15, 1.55, 0.21]}>
        <sphereGeometry args={[0.08]} />
        <meshStandardMaterial
          color="#ff0000"
          emissive="#ff0000"
          emissiveIntensity={2}
        />
      </mesh>
      <mesh position={[0.15, 1.55, 0.21]}>
        <sphereGeometry args={[0.08]} />
        <meshStandardMaterial
          color="#ff0000"
          emissive="#ff0000"
          emissiveIntensity={2}
        />
      </mesh>

      {/* Antenna */}
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3]} />
        <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 2.0, 0]}>
        <sphereGeometry args={[0.08]} />
        <meshStandardMaterial
          color="#ff4444"
          emissive="#ff4444"
          emissiveIntensity={1}
        />
      </mesh>

      {/* Left Arm */}
      <group ref={leftArmRef} position={[-0.4, 0.9, 0]}>
        <mesh position={[0, -0.25, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.6]} />
          <meshStandardMaterial
            color="#555555"
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
        {/* Left Hand/Claw */}
        <mesh position={[0, -0.6, 0]}>
          <boxGeometry args={[0.15, 0.15, 0.15]} />
          <meshStandardMaterial
            color="#333333"
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* Right Arm */}
      <group ref={rightArmRef} position={[0.4, 0.9, 0]}>
        <mesh position={[0, -0.25, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.6]} />
          <meshStandardMaterial
            color="#555555"
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
        {/* Right Hand/Claw */}
        <mesh position={[0, -0.6, 0]}>
          <boxGeometry args={[0.15, 0.15, 0.15]} />
          <meshStandardMaterial
            color="#333333"
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* Legs */}
      <mesh position={[-0.2, 0.2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.5]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.2, 0.2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.5]} />
        <meshStandardMaterial color="#444444" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Feet */}
      <mesh position={[-0.2, -0.05, 0.1]}>
        <boxGeometry args={[0.15, 0.1, 0.25]} />
        <meshStandardMaterial color="#333333" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0.2, -0.05, 0.1]}>
        <boxGeometry args={[0.15, 0.1, 0.25]} />
        <meshStandardMaterial color="#333333" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

// Enemy Component
function Enemy({
  enemy,
  gameState,
  setGameState,
}: {
  enemy: Enemy;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const enemyRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [isAttacking, setIsAttacking] = useState(false);

  const archetype = ENEMY_ARCHETYPES[enemy.type];

  useFrame((state, deltaTime) => {
    // Only update during gameplay
    if (gameState.gamePhase !== "playing") return;

    // Billboard effect - make enemy always face the camera but stay upright
    if (enemyRef.current) {
      const enemyPos = new THREE.Vector3(...enemy.position);
      const cameraPos = camera.position.clone();
      cameraPos.y = enemyPos.y; // Keep same Y level to prevent tilting
      enemyRef.current.lookAt(cameraPos);

      // AI Movement - different behavior for melee vs ranged
      const playerPos = camera.position.clone();
      const direction = new THREE.Vector3().subVectors(playerPos, enemyPos);
      direction.y = 0; // Keep movement on horizontal plane
      const distanceToPlayer = direction.length();
      direction.normalize();

      // Preserve original position before movement
      const originalPos = enemyPos.clone();
      let newPos = enemyPos.clone();

      if (enemy.type === "melee" || enemy.type === "giant") {
        // Melee and Giant: Always move towards player
        newPos = newPos.add(
          direction.clone().multiplyScalar(archetype.moveSpeed * deltaTime),
        );
      } else if (enemy.type === "ranged") {
        // Ranged: Keep distance of 8-12 units
        const idealDistance = 10;
        if (distanceToPlayer < 8) {
          // Too close, back away
          newPos = newPos.add(
            direction.clone().multiplyScalar(-archetype.moveSpeed * deltaTime),
          );
        } else if (distanceToPlayer > 12) {
          // Too far, move closer
          newPos = newPos.add(
            direction.clone().multiplyScalar(archetype.moveSpeed * deltaTime),
          );
        }
        // If in ideal range (8-12), don't move much
      }

      // Wall collision detection for enemies with sliding
      const walls = getWallsForLevel(gameState.level.currentLevel);
      if (checkWallCollision(newPos, walls, 0.4)) {
        // Enemy hit a wall, try sliding along walls
        const xOnly = originalPos.clone();
        xOnly.x = newPos.x;
        const zOnly = originalPos.clone();
        zOnly.z = newPos.z;

        if (!checkWallCollision(xOnly, walls, 0.4)) {
          // Can move in X direction
          newPos.copy(xOnly);
        } else if (!checkWallCollision(zOnly, walls, 0.4)) {
          // Can move in Z direction
          newPos.copy(zOnly);
        } else {
          // Can't move at all, revert to original position
          newPos.copy(originalPos);
        }
      }

      // Update enemy position in game state
      setGameState((prev) => ({
        ...prev,
        enemies: prev.enemies.map((e) =>
          e.id === enemy.id
            ? {
                ...e,
                position: [newPos.x, newPos.y, newPos.z] as [
                  number,
                  number,
                  number,
                ],
              }
            : e,
        ),
      }));

      // Attack logic
      setIsAttacking(distanceToPlayer < 2.5);

      if (enemy.type === "melee" || enemy.type === "giant") {
        // Melee and Giant: Contact damage
        if (distanceToPlayer < 1.5 && gameState.gamePhase === "playing") {
          const currentTime = Date.now();
          setGameState((prev) => {
            if (
              currentTime - prev.lastDamageTime > archetype.attackInterval &&
              prev.gamePhase === "playing"
            ) {
              const newHealth = Math.max(0, prev.health - archetype.damage);
              return {
                ...prev,
                health: newHealth,
                lastDamageTime: currentTime,
                gamePhase: newHealth <= 0 ? "gameover" : prev.gamePhase,
              };
            }
            return prev;
          });
        }
      } else if (enemy.type === "ranged") {
        // Ranged: Shoot projectiles
        const currentTime = Date.now();
        if (currentTime >= enemy.nextAttackAt && distanceToPlayer < 20) {
          // Spawn enemy projectile
          const projectileDir = direction.clone();
          setGameState((prev) => ({
            ...prev,
            enemies: prev.enemies.map((e) =>
              e.id === enemy.id
                ? { ...e, nextAttackAt: currentTime + archetype.attackInterval }
                : e,
            ),
            enemyProjectiles: [
              ...prev.enemyProjectiles,
              {
                id: `enemyproj_${Date.now()}_${Math.random()}`,
                position: [enemyPos.x, enemyPos.y + 1, enemyPos.z],
                direction: [projectileDir.x, projectileDir.y, projectileDir.z],
                damage: archetype.damage,
              },
            ],
          }));
        }
      }
    }

    // Check bullet collisions
    gameState.bullets.forEach((bullet) => {
      const bulletPos = new THREE.Vector3(...bullet.position);
      const enemyPos = new THREE.Vector3(...enemy.position);

      if (bulletPos.distanceTo(enemyPos) < 1) {
        // Hit enemy
        setGameState((prev) => {
          const enemyKilled = enemy.health - bullet.damage <= 0;
          const newCoins = enemyKilled ? prev.coins + 1 : prev.coins; // 1 coin per kill

          // Increment kill counter only if enemy died
          const newKills = enemyKilled
            ? prev.story.totalKills + 1
            : prev.story.totalKills;
          const newLevelKills = enemyKilled
            ? prev.level.killsThisLevel + 1
            : prev.level.killsThisLevel;

          // Every 10 kills = conquer a settlement
          const newSettlementIndex = Math.floor(newKills / 10);

          // Every 3 kills = rescue an ally
          const newAlliesRescued = Math.floor(newKills / 3);

          // Check if we just conquered a new settlement
          let newSettlementsConquered = prev.story.settlementsConquered;
          if (
            newSettlementIndex > prev.story.currentSettlement &&
            newSettlementIndex <= SETTLEMENTS.length
          ) {
            const settlementName = SETTLEMENTS[newSettlementIndex - 1];
            if (!prev.story.settlementsConquered.includes(settlementName)) {
              newSettlementsConquered = [
                ...prev.story.settlementsConquered,
                settlementName,
              ];
            }
          }

          // Check level progression
          const currentLevelData = LEVELS[prev.level.currentLevel];
          const shouldLevelUp =
            currentLevelData && newLevelKills >= currentLevelData.killsRequired;
          const nextLevel = prev.level.currentLevel + 1;
          const hasNextLevel = nextLevel < LEVELS.length;

          // Check victory condition - completed final level
          const completedFinalLevel = shouldLevelUp && !hasNextLevel;

          // Determine next game phase
          let nextPhase = prev.gamePhase;
          if (completedFinalLevel) {
            nextPhase = "victory";
          } else if (shouldLevelUp && hasNextLevel) {
            nextPhase = "levelTransition";
          }

          return {
            ...prev,
            bullets: prev.bullets.filter((b) => b.id !== bullet.id),
            enemies: prev.enemies
              .map((e) =>
                e.id === enemy.id
                  ? { ...e, health: e.health - bullet.damage }
                  : e,
              )
              .filter((e) => e.health > 0),
            coins: newCoins,
            story: {
              currentSettlement: Math.min(
                newSettlementIndex,
                SETTLEMENTS.length - 1,
              ),
              alliesRescued: newAlliesRescued,
              settlementsConquered: newSettlementsConquered,
              totalKills: newKills,
            },
            level: {
              currentLevel: prev.level.currentLevel,
              killsThisLevel: newLevelKills,
              giantsSpawnedThisLevel: prev.level.giantsSpawnedThisLevel,
            },
            gamePhase: nextPhase,
          };
        });
      }
    });
  });

  const enemySize = archetype.size || 1;
  const healthBarYPosition = enemySize > 1 ? 3 : 2;

  return (
    <group ref={enemyRef} position={enemy.position}>
      {/* Simple colored cube for enemy - color based on type, size based on archetype */}
      <mesh>
        <boxGeometry
          args={[0.8 * enemySize, 1.5 * enemySize, 0.8 * enemySize]}
        />
        <meshStandardMaterial color={archetype.color} />
      </mesh>
      {/* Health bar above enemy */}
      <mesh position={[0, healthBarYPosition, 0]}>
        <planeGeometry args={[1 * enemySize, 0.1]} />
        <meshBasicMaterial
          color={enemy.health > archetype.health / 2 ? "#00ff00" : "#ff0000"}
          opacity={0.8}
          transparent
        />
      </mesh>
    </group>
  );
}

// Bullet Component (invisible)
function Bullet({
  bullet,
}: {
  bullet: { id: string; position: [number, number, number] };
}) {
  return (
    <mesh position={bullet.position}>
      <sphereGeometry args={[0.05]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

// Enemy Projectile Component (visible and slow)
function EnemyProjectile({
  projectile,
  gameState,
  setGameState,
}: {
  projectile: {
    id: string;
    position: [number, number, number];
    direction: [number, number, number];
    damage: number;
  };
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const projectileRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  useFrame((state, deltaTime) => {
    if (gameState.gamePhase !== "playing") return;

    const projectileSpeed = 8; // Slow, visible speed
    const currentPos = new THREE.Vector3(...projectile.position);
    const direction = new THREE.Vector3(...projectile.direction);

    const newPos = currentPos.add(
      direction.multiplyScalar(projectileSpeed * deltaTime),
    );

    // Check wall collision for projectiles
    const walls = getWallsForLevel(gameState.level.currentLevel);
    if (checkWallCollision(newPos, walls, 0.3)) {
      // Hit a wall, remove projectile
      setGameState((prev) => ({
        ...prev,
        enemyProjectiles: prev.enemyProjectiles.filter(
          (p) => p.id !== projectile.id,
        ),
      }));
      return;
    }

    // Update projectile position
    setGameState((prev) => ({
      ...prev,
      enemyProjectiles: prev.enemyProjectiles.map((p) =>
        p.id === projectile.id
          ? {
              ...p,
              position: [newPos.x, newPos.y, newPos.z] as [
                number,
                number,
                number,
              ],
            }
          : p,
      ),
    }));

    // Check collision with player
    const playerPos = camera.position;
    const distanceToPlayer = currentPos.distanceTo(playerPos);

    if (distanceToPlayer < 1) {
      // Hit player
      setGameState((prev) => {
        const newHealth = Math.max(0, prev.health - projectile.damage);
        return {
          ...prev,
          health: newHealth,
          enemyProjectiles: prev.enemyProjectiles.filter(
            (p) => p.id !== projectile.id,
          ),
          gamePhase: newHealth <= 0 ? "gameover" : prev.gamePhase,
        };
      });
    }

    // Remove if out of bounds
    if (newPos.length() > 50) {
      setGameState((prev) => ({
        ...prev,
        enemyProjectiles: prev.enemyProjectiles.filter(
          (p) => p.id !== projectile.id,
        ),
      }));
    }
  });

  return (
    <mesh ref={projectileRef} position={projectile.position}>
      <sphereGeometry args={[0.3]} />
      <meshStandardMaterial
        color="#ff6600"
        emissive="#ff4400"
        emissiveIntensity={0.8}
      />
    </mesh>
  );
}

// Weapon Sprite Component
function WeaponSprite({ gameState }: { gameState: GameState }) {
  const { camera } = useThree();
  const weaponRef = useRef<THREE.Mesh>(null);

  // Get weapon colors for different weapons
  const getWeaponColor = (weaponNum: number) => {
    switch (weaponNum) {
      case 1:
        return "#888888"; // Gray for pistol
      case 2:
        return "#654321"; // Brown for rifle
      case 3:
        return "#2e2e2e"; // Dark gray for assault rifle
      case 4:
        return "#1a1a1a"; // Black for LMG
      default:
        return "#888888";
    }
  };

  // Get weapon size based on type
  const getWeaponSize = (weaponNum: number): [number, number] => {
    switch (weaponNum) {
      case 1:
        return [0.3, 0.6]; // Small pistol
      case 2:
        return [0.4, 1.0]; // Medium rifle
      case 3:
        return [0.5, 0.9]; // Assault rifle
      case 4:
        return [0.6, 1.2]; // Large LMG
      default:
        return [0.3, 0.6];
    }
  };

  useFrame(() => {
    if (weaponRef.current && gameState.gamePhase === "playing") {
      // Position weapon sprite in bottom-right of view (DOOM style center-right)
      const weaponPos = camera.position.clone();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        camera.quaternion,
      );
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
        camera.quaternion,
      );
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(
        camera.quaternion,
      );

      // Position weapon sprite
      weaponPos.add(forward.multiplyScalar(2)); // Forward from camera
      weaponPos.add(right.multiplyScalar(0.8)); // Right side
      weaponPos.add(down.multiplyScalar(0.5)); // Slightly down

      weaponRef.current.position.copy(weaponPos);
      weaponRef.current.lookAt(camera.position);

      // Add firing animation (slight recoil)
      const timeSinceShot = Date.now() - gameState.lastShotTime;
      if (timeSinceShot < 100) {
        const recoilAmount = ((100 - timeSinceShot) / 100) * 0.1;
        weaponRef.current.position.add(
          new THREE.Vector3(0, -recoilAmount, recoilAmount),
        );
      }
    }
  });

  const [width, height] = getWeaponSize(gameState.currentWeapon);

  if (gameState.gamePhase !== "playing") return null;

  return (
    <mesh ref={weaponRef}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        color={getWeaponColor(gameState.currentWeapon)}
        side={THREE.DoubleSide}
        transparent
        opacity={gameState.isReloading ? 0.5 : 1.0}
      />
    </mesh>
  );
}

// Intro Cutscene Component
function IntroCutscene({
  setGameState,
}: {
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const [currentScene, setCurrentScene] = useState(0);

  const scenes = [
    {
      text: "In the peaceful town of Hot Dog Haven, a young hot dog named Hayden lived happily with his family...",
      duration: 4000,
    },
    {
      text: "But one fateful day, an army of robot hot dogs descended upon the town!",
      duration: 4000,
    },
    {
      text: "They captured Hayden's parents and took them to their stronghold at Mustard Mountain!",
      duration: 4000,
    },
    {
      text: "Now Hayden must be brave. He must conquer the robot settlements scattered across the land...",
      duration: 4000,
    },
    {
      text: "Along the way, he'll rescue captured hot dog allies and grow stronger.",
      duration: 4000,
    },
    {
      text: "Only by defeating all four robot settlements can Hayden reach Mustard Mountain and save his parents!",
      duration: 4000,
    },
    {
      text: "The legend of MUSTARD begins now...",
      duration: 3000,
      isLast: true,
    },
  ];

  useEffect(() => {
    if (currentScene < scenes.length - 1) {
      const timer = setTimeout(() => {
        setCurrentScene(currentScene + 1);
      }, scenes[currentScene].duration);

      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setGameState((prev) => ({ ...prev, gamePhase: "playing" }));
        document.body.requestPointerLock();
      }, scenes[currentScene].duration);

      return () => clearTimeout(timer);
    }
  }, [currentScene, scenes, setGameState]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background:
          "linear-gradient(135deg, #ff6b35 0%, #f7931e 50%, #fdc830 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
        zIndex: 2000,
        padding: "40px",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          textAlign: "center",
          background: "rgba(0, 0, 0, 0.6)",
          padding: "60px",
          borderRadius: "20px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
      >
        <h2
          style={{
            fontSize: "28px",
            lineHeight: "1.8",
            marginBottom: "40px",
            textShadow: "2px 2px 4px rgba(0, 0, 0, 0.8)",
            minHeight: "120px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {scenes[currentScene].text}
        </h2>

        <div
          style={{
            display: "flex",
            gap: "20px",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "30px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            {scenes.map((_, index) => (
              <div
                key={index}
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background:
                    index === currentScene
                      ? "#fdc830"
                      : "rgba(255, 255, 255, 0.3)",
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            setGameState((prev) => ({ ...prev, gamePhase: "playing" }));
            document.body.requestPointerLock();
          }}
          style={{
            marginTop: "40px",
            padding: "12px 30px",
            fontSize: "18px",
            fontWeight: "bold",
            background: "rgba(255, 255, 255, 0.2)",
            color: "white",
            border: "2px solid white",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.3s ease",
            fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background =
              "rgba(255, 255, 255, 0.4)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background =
              "rgba(255, 255, 255, 0.2)";
          }}
        >
          Skip Cutscene
        </button>
      </div>
    </div>
  );
}

// RegistrationForm Component
// ---------------------
function RegistrationForm({ setGameState }: { setGameState: any }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleRegister = async () => {
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      setSuccess("Registration successful! You can now log in.");
      setError("");
      setGameState((prev: any) => ({ ...prev, gamePhase: "login" }));
    } catch (err) {
      setError("Network error");
    }
  };

  return (
    <div style={{ color: "white", textAlign: "center", paddingTop: "100px" }}>
      <h2>Create New Account</h2>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {success && <div style={{ color: "green" }}>{success}</div>}
      <input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={handleRegister}>Register</button>
      <button
        onClick={() =>
          setGameState((prev: any) => ({ ...prev, gamePhase: "login" }))
        }
      >
        Back to Login
      </button>
    </div>
  );
}

// Inventory Component
function InventoryPage({
  gameState,
  setGameState,
}: {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const [purchasedItems, setPurchasedItems] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [selectedWeapon, setSelectedWeapon] = useState<number | null>(null);
  const [currency, setCurrency] = useState(gameState.user.currency);

  // Define available weapons with their skins
  // shopPrefix is the prefix used in shop item names (e.g., "Pistol - Gold Plated")
  const allWeapons = [
    {
      id: 1,
      name: "Standard Pistol",
      shopPrefix: "Pistol",
      skins: ["Default", "Gold Plated", "Neon Green", "Shadow Black"],
    },
    {
      id: 2,
      name: "Combat Rifle",
      shopPrefix: "Rifle",
      skins: ["Default", "Desert Camo", "Arctic White", "Blood Red"],
    },
    {
      id: 3,
      name: "Sniper Rifle",
      shopPrefix: "Sniper",
      skins: ["Default", "Ghillie", "Chrome", "Midnight"],
    },
    {
      id: 4,
      name: "Plasma Cannon",
      shopPrefix: "Plasma",
      skins: ["Default", "Electric Blue", "Magma", "Void Purple"],
    },
  ];

  // Track equipped skins per weapon based on purchased items
  const [weaponSkins, setWeaponSkins] = useState<Record<number, string>>({
    1: "Default",
    2: "Default",
    3: "Default",
    4: "Default",
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch purchased items from database
        const invResponse = await fetch("/api/inventory", {
          credentials: "include",
        });
        if (invResponse.ok) {
          const items = await invResponse.json();
          setPurchasedItems(items);
        }

        // Fetch currency from database
        const currResponse = await fetch("/api/currency", {
          credentials: "include",
        });
        if (currResponse.ok) {
          const data = await currResponse.json();
          setCurrency(data.currency);
          // Update game state with current currency
          setGameState((prev) => ({
            ...prev,
            user: { ...prev.user, currency: data.currency },
          }));
        }
      } catch (err) {
        console.error("Failed to fetch inventory:", err);
      } finally {
        setLoadingInventory(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)",
        display: "flex",
        flexDirection: "column",
        color: "white",
        fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
        zIndex: 1000,
        padding: "20px",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          padding: "15px 20px",
          background: "rgba(0,0,0,0.4)",
          borderRadius: "10px",
        }}
      >
        <h1 style={{ fontSize: "36px", margin: 0 }}>INVENTORY</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <span style={{ fontSize: "18px", color: "#fdc830" }}>
            {currency} Gold
          </span>
          <button
            onClick={() =>
              setGameState((prev) => ({ ...prev, gamePhase: "menu" }))
            }
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              fontWeight: "bold",
              background: "#fdc830",
              color: "#333",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            BACK
          </button>
        </div>
      </div>

      {/* Inventory Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          gap: "20px",
          padding: "20px",
        }}
      >
        {/* Weapons List */}
        <div
          style={{
            flex: 1,
            background: "rgba(0,0,0,0.3)",
            borderRadius: "10px",
            padding: "20px",
            border: "2px solid #FFC107",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "15px", color: "#FFC107" }}>
            WEAPONS
          </h2>
          <p style={{ fontSize: "14px", opacity: 0.8, marginBottom: "15px" }}>
            Click a weapon to change its skin
          </p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {loadingInventory ? (
              <p style={{ opacity: 0.7 }}>Loading...</p>
            ) : (
              allWeapons.map((weapon) => {
                const isSelected = selectedWeapon === weapon.id;
                const currentSkin = weaponSkins[weapon.id] || "Default";
                // Count owned skins for this weapon (excluding Default)
                const ownedSkinsCount = purchasedItems.filter(
                  (item) =>
                    item.name &&
                    item.name.startsWith(`${weapon.shopPrefix} - `),
                ).length;
                return (
                  <div
                    key={weapon.id}
                    onClick={() =>
                      setSelectedWeapon(isSelected ? null : weapon.id)
                    }
                    style={{
                      padding: "15px",
                      background: isSelected
                        ? "rgba(33, 150, 243, 0.5)"
                        : "rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      border: isSelected
                        ? "2px solid #2196F3"
                        : "1px solid rgba(255,255,255,0.3)",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          margin: "0 0 5px 0",
                          fontWeight: "bold",
                          fontSize: "18px",
                        }}
                      >
                        {weapon.name}
                      </p>
                      <p style={{ margin: 0, fontSize: "12px", opacity: 0.8 }}>
                        Current Skin: {currentSkin}
                      </p>
                      <p
                        style={{
                          margin: "3px 0 0 0",
                          fontSize: "11px",
                          color: "#4CAF50",
                        }}
                      >
                        {ownedSkinsCount} skin{ownedSkinsCount !== 1 ? "s" : ""}{" "}
                        owned
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Purchased Items / Weapon Skins Panel */}
        <div
          style={{
            flex: 1,
            background: "rgba(0,0,0,0.3)",
            borderRadius: "10px",
            padding: "20px",
            border: "2px solid #9C27B0",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "15px", color: "#9C27B0" }}>
            {selectedWeapon ? "WEAPON SKINS" : "PURCHASED ITEMS"}
          </h2>
          {selectedWeapon ? (
            <>
              <p style={{ fontSize: "16px", marginBottom: "15px" }}>
                Select a skin for{" "}
                <strong>
                  {allWeapons.find((w) => w.id === selectedWeapon)?.name}
                </strong>
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                {allWeapons
                  .find((w) => w.id === selectedWeapon)
                  ?.skins.map((skin) => {
                    const isCurrentSkin = weaponSkins[selectedWeapon] === skin;
                    const weapon = allWeapons.find(
                      (w) => w.id === selectedWeapon,
                    );
                    const shopPrefix = weapon?.shopPrefix || "";
                    const skinItemName = `${shopPrefix} - ${skin}`;
                    // Check ownership by matching the shop item name format
                    const isOwned =
                      skin === "Default" ||
                      purchasedItems.some((item) => item.name === skinItemName);
                    return (
                      <div
                        key={skin}
                        onClick={() => {
                          if (isOwned) {
                            setWeaponSkins((prev) => ({
                              ...prev,
                              [selectedWeapon]: skin,
                            }));
                          } else {
                            alert(
                              "You don't own this skin! Buy it from the shop.",
                            );
                          }
                        }}
                        style={{
                          padding: "15px",
                          background: isCurrentSkin
                            ? "rgba(156, 39, 176, 0.5)"
                            : isOwned
                              ? "rgba(255,255,255,0.1)"
                              : "rgba(100,100,100,0.3)",
                          borderRadius: "8px",
                          border: isCurrentSkin
                            ? "2px solid #9C27B0"
                            : isOwned
                              ? "1px solid rgba(255,255,255,0.3)"
                              : "1px solid rgba(100,100,100,0.5)",
                          cursor: isOwned ? "pointer" : "not-allowed",
                          textAlign: "center",
                          transition: "all 0.2s",
                          opacity: isOwned ? 1 : 0.6,
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: "bold" }}>{skin}</p>
                        {isCurrentSkin && (
                          <p
                            style={{
                              margin: "5px 0 0 0",
                              fontSize: "12px",
                              color: "#9C27B0",
                            }}
                          >
                            Selected
                          </p>
                        )}
                        {!isOwned && (
                          <p
                            style={{
                              margin: "5px 0 0 0",
                              fontSize: "10px",
                              color: "#ff5722",
                            }}
                          >
                            Not Owned
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </>
          ) : (
            <>
              {loadingInventory ? (
                <p style={{ opacity: 0.7 }}>Loading...</p>
              ) : purchasedItems.length === 0 ? (
                <p
                  style={{
                    opacity: 0.7,
                    textAlign: "center",
                    marginTop: "50px",
                  }}
                >
                  No items purchased yet. Visit the shop!
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {purchasedItems.map((item) => {
                    // Parse weapon and skin from item name (e.g., "Pistol - Gold Plated")
                    const nameParts = item.name?.split(" - ") || [item.name];
                    const weaponType = nameParts[0] || "Item";
                    const skinName = nameParts[1] || item.name;

                    const weaponColors: Record<string, string> = {
                      Pistol: "#4CAF50",
                      Rifle: "#2196F3",
                      Sniper: "#9C27B0",
                      Plasma: "#FF5722",
                    };

                    return (
                      <div
                        key={item.id}
                        style={{
                          padding: "12px",
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: "6px",
                          border: "1px solid rgba(255,255,255,0.3)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <span
                            style={{
                              background: weaponColors[weaponType] || "#555",
                              color: "white",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: "bold",
                            }}
                          >
                            {weaponType}
                          </span>
                          <p style={{ margin: 0, fontWeight: "bold" }}>
                            {skinName}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Settings Component
function SettingsPage({
  gameState,
  setGameState,
}: {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const { setKeybinding, setNormalSensitivity } = useSettings();

  // Settings state from database
  const [settings, setSettings] = useState({
    mouse_sensitivity: 1.0,
    move_forward_key: "KeyW",
    move_backward_key: "KeyS",
    move_left_key: "KeyA",
    move_right_key: "KeyD",
    jump_key: "Space",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [listeningFor, setListeningFor] = useState<string | null>(null);

  // Keybind display names
  const keybindLabels: Record<string, string> = {
    move_forward_key: "Move Forward",
    move_backward_key: "Move Backward",
    move_left_key: "Move Left",
    move_right_key: "Move Right",
    jump_key: "Jump",
  };

  // Convert key code to display name
  const getKeyDisplayName = (code: string) => {
    if (code.startsWith("Key")) return code.replace("Key", "");
    if (code.startsWith("Digit")) return code.replace("Digit", "");
    if (code === "Space") return "Space";
    if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
    if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
    if (code === "AltLeft" || code === "AltRight") return "Alt";
    if (code.startsWith("Arrow")) return code.replace("Arrow", "");
    return code;
  };

  // Fetch settings on mount and apply to global store
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.settings) {
          const s = data.settings;
          // Update local state for UI
          setSettings({
            mouse_sensitivity: parseFloat(s.mouse_sensitivity) || 1.0,
            move_forward_key: s.move_forward_key || "KeyW",
            move_backward_key: s.move_backward_key || "KeyS",
            move_left_key: s.move_left_key || "KeyA",
            move_right_key: s.move_right_key || "KeyD",
            jump_key: s.jump_key || "Space",
          });
          // Also apply to global store immediately
          setKeybinding("forward", s.move_forward_key || "KeyW");
          setKeybinding("backward", s.move_backward_key || "KeyS");
          setKeybinding("leftward", s.move_left_key || "KeyA");
          setKeybinding("rightward", s.move_right_key || "KeyD");
          setKeybinding("jump", s.jump_key || "Space");
          const sens = parseFloat(s.mouse_sensitivity);
          setNormalSensitivity(isNaN(sens) ? 1 : sens);
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [setKeybinding, setNormalSensitivity]);

  // Listen for key presses when rebinding
  useEffect(() => {
    if (!listeningFor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const keyCode = e.code;
      setSettings((prev) => ({ ...prev, [listeningFor]: keyCode }));
      setListeningFor(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [listeningFor]);

  // Save settings to database
  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Settings saved successfully!");
        // Update the game's keybindings store
        setKeybinding("forward", settings.move_forward_key);
        setKeybinding("backward", settings.move_backward_key);
        setKeybinding("leftward", settings.move_left_key);
        setKeybinding("rightward", settings.move_right_key);
        setKeybinding("jump", settings.jump_key);
        setNormalSensitivity(settings.mouse_sensitivity);
      } else {
        setMessage(data.error || "Failed to save settings");
      }
    } catch (err) {
      setMessage("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
        zIndex: 1000,
        padding: "20px",
        overflow: "auto",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "40px",
          background: "rgba(0,0,0,0.6)",
          borderRadius: "20px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          maxWidth: "600px",
          width: "100%",
        }}
      >
        <h1
          style={{
            fontSize: "42px",
            marginBottom: "20px",
            textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
          }}
        >
          SETTINGS
        </h1>

        {loading ? (
          <p>Loading settings...</p>
        ) : (
          <>
            {/* Mouse Sensitivity */}
            <div style={{ marginBottom: "30px", textAlign: "left" }}>
              <label style={{ fontSize: "18px", fontWeight: "bold" }}>
                Mouse Sensitivity: {settings.mouse_sensitivity.toFixed(1)}
              </label>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={settings.mouse_sensitivity}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    mouse_sensitivity: parseFloat(e.target.value),
                  }))
                }
                style={{
                  width: "100%",
                  height: "8px",
                  marginTop: "10px",
                  cursor: "pointer",
                }}
              />
            </div>

            {/* Keybinds Section */}
            <h2
              style={{
                fontSize: "24px",
                marginBottom: "15px",
                textAlign: "left",
              }}
            >
              Keybinds
            </h2>
            <p
              style={{
                fontSize: "14px",
                opacity: 0.8,
                marginBottom: "15px",
                textAlign: "left",
              }}
            >
              Click on a key to rebind it, then press the new key
            </p>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {Object.entries(keybindLabels).map(([key, label]) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 15px",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    border:
                      listeningFor === key
                        ? "2px solid #fdc830"
                        : "1px solid rgba(255,255,255,0.3)",
                  }}
                >
                  <span style={{ fontSize: "16px" }}>{label}</span>
                  <button
                    onClick={() => setListeningFor(key)}
                    style={{
                      padding: "8px 20px",
                      fontSize: "14px",
                      fontWeight: "bold",
                      background: listeningFor === key ? "#fdc830" : "#555",
                      color: listeningFor === key ? "#333" : "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      minWidth: "100px",
                    }}
                  >
                    {listeningFor === key
                      ? "Press a key..."
                      : getKeyDisplayName(
                          settings[key as keyof typeof settings] as string,
                        )}
                  </button>
                </div>
              ))}
            </div>

            {/* Message */}
            {message && (
              <p
                style={{
                  marginTop: "20px",
                  padding: "10px",
                  background: message.includes("success")
                    ? "rgba(76, 175, 80, 0.3)"
                    : "rgba(244, 67, 54, 0.3)",
                  borderRadius: "8px",
                }}
              >
                {message}
              </p>
            )}

            {/* Buttons */}
            <div
              style={{
                display: "flex",
                gap: "15px",
                marginTop: "30px",
                justifyContent: "center",
              }}
            >
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "15px 40px",
                  fontSize: "18px",
                  fontWeight: "bold",
                  background: saving ? "#888" : "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  cursor: saving ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                {saving ? "Saving..." : "SAVE"}
              </button>
              <button
                onClick={() =>
                  setGameState((prev) => ({
                    ...prev,
                    gamePhase:
                      prev.previousGamePhase === "paused" ? "paused" : "menu",
                    previousGamePhase: null, // Clear the previous phase after navigating back
                  }))
                }
                style={{
                  padding: "15px 40px",
                  fontSize: "18px",
                  fontWeight: "bold",
                  background: "#fdc830",
                  color: "#333",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                BACK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Profile Component
function ProfilePage({
  gameState,
  setGameState,
}: {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const [profile, setProfile] = useState<{
    username: string;
    email: string;
    profilePicture: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit states
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");

  const [editingPassword, setEditingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [uploadingPicture, setUploadingPicture] = useState(false);

  // URL picture upload states
  const [pictureUrl, setPictureUrl] = useState("");
  const [loadingUrlPicture, setLoadingUrlPicture] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Load profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  // Auto-clear success/error messages after 5 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess("");
        setError("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const loadProfile = async () => {
    try {
      const res = await fetch("/api/profile", {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          setLoading(false);
          setGameState((prev) => ({ ...prev, gamePhase: "login" }));
          return;
        }
        throw new Error("Failed to load profile");
      }
      const data = await res.json();
      setProfile(data);
      setNewUsername(data.username);
      setLoading(false);
    } catch (err) {
      setError("Failed to load profile");
      setLoading(false);
    }
  };

  const handleUpdateUsername = async () => {
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/profile/username", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUsername }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update username");
        return;
      }
      setSuccess("Username updated successfully!");
      setProfile((prev) =>
        prev ? { ...prev, username: data.username } : null,
      );
      setEditingUsername(false);
    } catch (err) {
      setError("Network error");
    }
  };

  const handleUpdatePassword = async () => {
    setError("");
    setSuccess("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    try {
      const res = await fetch("/api/profile/password", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update password");
        return;
      }
      setSuccess("Password updated successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setEditingPassword(false);
    } catch (err) {
      setError("Network error");
    }
  };

  const handleUploadPicture = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");
    setUploadingPicture(true);

    const formData = new FormData();
    formData.append("profilePicture", file);

    try {
      const res = await fetch("/api/profile/picture", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to upload picture");
        setUploadingPicture(false);
        return;
      }
      setSuccess("Profile picture updated!");
      setProfile((prev) =>
        prev ? { ...prev, profilePicture: data.profilePictureUrl } : null,
      );
      setUploadingPicture(false);
    } catch (err) {
      setError("Network error");
      setUploadingPicture(false);
    }
  };

  const handleUpdatePictureFromUrl = async () => {
    if (!pictureUrl.trim()) {
      setError("Please enter an image URL");
      return;
    }

    setError("");
    setSuccess("");
    setLoadingUrlPicture(true);

    try {
      const res = await fetch("/api/profile/picture-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: pictureUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update picture");
        setLoadingUrlPicture(false);
        return;
      }
      setSuccess("Profile picture updated from URL!");
      setProfile((prev) =>
        prev ? { ...prev, profilePicture: pictureUrl.trim() } : null,
      );
      setPictureUrl("");
      setShowUrlInput(false);
      setLoadingUrlPicture(false);
    } catch (err) {
      setError("Network error");
      setLoadingUrlPicture(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "24px",
          zIndex: 1000,
        }}
      >
        Loading profile...
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "40px",
        color: "white",
        fontFamily: "Inter, sans-serif",
        zIndex: 1000,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          maxWidth: "600px",
          width: "100%",
          padding: "30px",
          background: "rgba(0,0,0,0.3)",
          borderRadius: "20px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
        }}
      >
        <h1
          style={{
            fontSize: "36px",
            marginBottom: "30px",
            textAlign: "center",
          }}
        >
          Profile
        </h1>

        {error && (
          <div
            style={{
              background: "rgba(255,0,0,0.2)",
              border: "1px solid #ff5555",
              borderRadius: "8px",
              padding: "10px",
              marginBottom: "15px",
              color: "#ffcccc",
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              background: "rgba(0,255,0,0.2)",
              border: "1px solid #55ff55",
              borderRadius: "8px",
              padding: "10px",
              marginBottom: "15px",
              color: "#ccffcc",
            }}
          >
            {success}
          </div>
        )}

        {/* Profile Picture Section */}
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <div
            style={{
              width: "150px",
              height: "150px",
              borderRadius: "50%",
              margin: "0 auto 15px",
              background: profile?.profilePicture
                ? `url(${profile.profilePicture})`
                : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              border: "4px solid white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "48px",
              fontWeight: "bold",
            }}
          >
            {!profile?.profilePicture &&
              (profile?.username.charAt(0).toUpperCase() || "?")}
          </div>
          <div
            style={{
              display: "flex",
              gap: "10px",
              justifyContent: "center",
              marginBottom: "15px",
            }}
          >
            <label
              style={{
                background: "rgba(255,255,255,0.2)",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: uploadingPicture ? "wait" : "pointer",
                border: "1px solid white",
                display: "inline-block",
              }}
            >
              {uploadingPicture ? "Uploading..." : "Change Picture"}
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadPicture}
                disabled={uploadingPicture}
                style={{ display: "none" }}
              />
            </label>
            <button
              onClick={() => setShowUrlInput(!showUrlInput)}
              style={{
                background: "rgba(255,255,255,0.2)",
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid white",
                color: "white",
                cursor: "pointer",
                display: "inline-block",
              }}
            >
              Use URL
            </button>
          </div>
          {showUrlInput && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "15px",
              }}
            >
              <input
                type="text"
                value={pictureUrl}
                onChange={(e) => setPictureUrl(e.target.value)}
                placeholder="Enter image URL (e.g., https://example.com/image.jpg)"
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  color: "black",
                }}
              />
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={handleUpdatePictureFromUrl}
                  disabled={loadingUrlPicture}
                  style={{
                    flex: 1,
                    background: "#4CAF50",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px",
                    color: "white",
                    cursor: loadingUrlPicture ? "wait" : "pointer",
                    fontWeight: "bold",
                  }}
                >
                  {loadingUrlPicture ? "Updating..." : "Update"}
                </button>
                <button
                  onClick={() => {
                    setShowUrlInput(false);
                    setPictureUrl("");
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.2)",
                    border: "1px solid white",
                    borderRadius: "8px",
                    padding: "10px",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Username Section */}
        <div style={{ marginBottom: "25px" }}>
          <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>Username</h3>
          {!editingUsername ? (
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "16px", flex: 1 }}>
                {profile?.username}
              </span>
              <button
                onClick={() => setEditingUsername(true)}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid white",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Edit
              </button>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="New username"
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "16px",
                }}
              />
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={handleUpdateUsername}
                  style={{
                    flex: 1,
                    background: "#4CAF50",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingUsername(false);
                    setNewUsername(profile?.username || "");
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.2)",
                    border: "1px solid white",
                    borderRadius: "8px",
                    padding: "10px",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Email Section */}
        <div style={{ marginBottom: "25px" }}>
          <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>Email</h3>
          <span style={{ fontSize: "16px" }}>{profile?.email}</span>
        </div>

        {/* Password Section */}
        <div style={{ marginBottom: "30px" }}>
          <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>Password</h3>
          {!editingPassword ? (
            <button
              onClick={() => setEditingPassword(true)}
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "1px solid white",
                borderRadius: "8px",
                padding: "10px 20px",
                color: "white",
                cursor: "pointer",
              }}
            >
              Change Password
            </button>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Current password"
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "16px",
                }}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "16px",
                }}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "16px",
                }}
              />
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={handleUpdatePassword}
                  style={{
                    flex: 1,
                    background: "#4CAF50",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Update Password
                </button>
                <button
                  onClick={() => {
                    setEditingPassword(false);
                    setOldPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.2)",
                    border: "1px solid white",
                    borderRadius: "8px",
                    padding: "10px",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Back to Menu */}
        <button
          onClick={() =>
            setGameState((prev) => ({ ...prev, gamePhase: "menu" }))
          }
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.2)",
            border: "2px solid white",
            borderRadius: "12px",
            padding: "12px",
            color: "white",
            fontSize: "18px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Back to Menu
        </button>
      </div>
    </div>
  );
}

// HUD Component
function HUD({
  gameState,
  setGameState,
}: {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  // Shop state hooks
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [ownedItemIds, setOwnedItemIds] = useState<number[]>([]);

  // Fetch shop items and owned items when entering the shop
  useEffect(() => {
    if (gameState.gamePhase !== "shop") return;

    setShopLoading(true);
    setShopError(null);

    // Fetch shop items
    fetch("/getItems.php")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load shop");
        return res.json();
      })
      .then((data: ShopItem[]) => {
        setShopItems(data);
      })
      .catch((err) => {
        console.error(err);
        setShopError("Could not load shop items. Please try again.");
      })
      .finally(() => {
        setShopLoading(false);
      });

    // Fetch owned items (for registered users)
    if (!gameState.user.isGuest) {
      fetch("/api/inventory", { credentials: "include" })
        .then((res) => res.json())
        .then((items) => {
          setOwnedItemIds(items.map((item: any) => item.id));
        })
        .catch((err) => console.error("Failed to fetch inventory:", err));

      // Fetch current currency from database
      fetch("/api/currency", { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          if (data.currency !== undefined) {
            setGameState((prev) => ({
              ...prev,
              user: { ...prev.user, currency: data.currency },
            }));
          }
        })
        .catch((err) => console.error("Failed to fetch currency:", err));
    }
  }, [gameState.gamePhase]);

  // Handle item purchases - now calls the API
  const handleBuyItem = async (item: ShopItem) => {
    if (gameState.user.isGuest) {
      alert("Please log in to purchase items!");
      return;
    }

    // Special case: gold value of 67 means unlimited purchases
    const hasUnlimitedGold = gameState.user.currency === 67;
    if (!hasUnlimitedGold && gameState.user.currency < item.price) {
      alert("Not enough gold!");
      return;
    }

    if (ownedItemIds.includes(item.id)) {
      alert("You already own this item!");
      return;
    }

    setPurchaseLoading(true);
    try {
      const response = await fetch("/api/purchase", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, price: item.price }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Purchase failed!");
        return;
      }

      // Update local state with new currency and owned item
      setGameState((prev) => ({
        ...prev,
        user: {
          ...prev.user,
          currency: data.currency,
          cosmetics: [...prev.user.cosmetics, item.name],
        },
        inventory: [...prev.inventory, item.name],
      }));
      setOwnedItemIds((prev) => [...prev, item.id]);
      alert(`Purchased ${item.name}!`);
    } catch (err) {
      console.error("Purchase error:", err);
      alert("Purchase failed. Please try again.");
    } finally {
      setPurchaseLoading(false);
    }
  };

  // Login Page
  if (gameState.gamePhase === "login") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "Inter, sans-serif",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "20px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
            maxWidth: "400px",
            width: "100%",
          }}
        >
          <h1
            style={{
              fontSize: "48px",
              fontWeight: "bold",
              marginBottom: "30px",
            }}
          >
            FPS ARENA
          </h1>
          <h2 style={{ fontSize: "24px", marginBottom: "20px" }}>Login</h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "15px",
              marginBottom: "20px",
            }}
          >
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                padding: "12px",
                fontSize: "16px",
                borderRadius: "8px",
                border: "none",
                outline: "none",
                color: "black",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                padding: "12px",
                fontSize: "16px",
                borderRadius: "8px",
                border: "none",
                outline: "none",
                color: "black",
              }}
            />
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <button
              onClick={async () => {
                const { setKeybinding, setNormalSensitivity } =
                  useSettings.getState();
                try {
                  const response = await fetch("/api/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password }),
                  });

                  if (response.ok) {
                    const data = await response.json();
                    setGameState((prev) => ({
                      ...prev,
                      gamePhase: "menu",
                      user: {
                        username: data.user.username,
                        isGuest: false,
                        currency: data.currency,
                        cosmetics: data.cosmetics || [],
                        equippedSkin: null,
                      },
                    }));

                    // Load user settings after login
                    try {
                      const settingsRes = await fetch("/api/settings", {
                        credentials: "include",
                      });
                      const settingsData = await settingsRes.json();
                      if (settingsData.success && settingsData.settings) {
                        const s = settingsData.settings;
                        setKeybinding("forward", s.move_forward_key);
                        setKeybinding("backward", s.move_backward_key);
                        setKeybinding("leftward", s.move_left_key);
                        setKeybinding("rightward", s.move_right_key);
                        setKeybinding("jump", s.jump_key);
                        const sens = parseFloat(s.mouse_sensitivity);
                        setNormalSensitivity(isNaN(sens) ? 1 : sens);
                      }
                    } catch (e) {
                      console.error("Failed to load settings:", e);
                    }
                  } else {
                    const error = await response.json();
                    alert(error.error || "Login failed");
                  }
                } catch (error) {
                  alert("Network error during login");
                }
              }}
              style={{
                padding: "12px 20px",
                fontSize: "18px",
                fontWeight: "bold",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              LOGIN
            </button>
            <button
              onClick={() =>
                setGameState((prev) => ({ ...prev, gamePhase: "register" }))
              }
              style={{
                padding: "12px 20px",
                fontSize: "16px",
                background: "transparent",
                color: "white",
                border: "2px solid white",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Create Account
            </button>
            {/* <button
              onClick={() => {
                setGameState((prev) => ({
                  ...prev,
                  gamePhase: "menu",
                  user: {
                    username: "Guest",
                    isGuest: true,
                    currency: 0,
                    cosmetics: [],
                    equippedSkin: null,
                  },
                }));
              }}
              style={{
                padding: "12px 20px",
                fontSize: "16px",
                background: "rgba(255,255,255,0.1)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Play as Guest
            </button> */}
          </div>
        </div>
      </div>
    );
  }

  // Registration Page
  if (gameState.gamePhase === "register") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "Inter, sans-serif",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "20px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
            maxWidth: "400px",
            width: "100%",
          }}
        >
          <h1
            style={{
              fontSize: "48px",
              fontWeight: "bold",
              marginBottom: "30px",
            }}
          >
            FPS ARENA
          </h1>
          <h2 style={{ fontSize: "24px", marginBottom: "20px" }}>
            Create Account
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "15px",
              marginBottom: "20px",
            }}
          >
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                padding: "12px",
                fontSize: "16px",
                borderRadius: "8px",
                border: "none",
                outline: "none",
                color: "black",
              }}
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                padding: "12px",
                fontSize: "16px",
                borderRadius: "8px",
                border: "none",
                outline: "none",
                color: "black",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                padding: "12px",
                fontSize: "16px",
                borderRadius: "8px",
                border: "none",
                outline: "none",
                color: "black",
              }}
            />
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <button
              onClick={async () => {
                try {
                  const response = await fetch("/api/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, email, password }),
                  });

                  if (response.ok) {
                    // Auto-login after successful registration
                    setGameState((prev) => ({
                      ...prev,
                      gamePhase: "menu",
                      user: {
                        username,
                        isGuest: false,
                        currency: 100000000,
                        cosmetics: [],
                        equippedSkin: null,
                      },
                    }));
                  } else {
                    const error = await response.json();
                    alert(error.error || "Registration failed");
                  }
                } catch (error) {
                  alert("Network error during registration");
                }
              }}
              style={{
                padding: "12px 20px",
                fontSize: "18px",
                fontWeight: "bold",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              CREATE ACCOUNT
            </button>
            <button
              onClick={() =>
                setGameState((prev) => ({ ...prev, gamePhase: "login" }))
              }
              style={{
                padding: "12px 20px",
                fontSize: "16px",
                background: "transparent",
                color: "white",
                border: "2px solid white",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Profile Page
  if (gameState.gamePhase === "profile") {
    return <ProfilePage gameState={gameState} setGameState={setGameState} />;
  }

  // Inventory Page
  if (gameState.gamePhase === "inventory") {
    return <InventoryPage gameState={gameState} setGameState={setGameState} />;
  }

  if (gameState.gamePhase === "menu") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background:
            "linear-gradient(135deg, #ff6b35 0%, #f7931e 50%, #fdc830 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            background: "rgba(0,0,0,0.5)",
            borderRadius: "20px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            maxWidth: "700px",
          }}
        >
          <h1
            style={{
              fontSize: "56px",
              fontWeight: "bold",
              marginBottom: "10px",
              textShadow: "3px 3px 6px rgba(0,0,0,0.8)",
            }}
          ></h1>
          <h2
            style={{
              fontSize: "48px",
              fontWeight: "bold",
              marginBottom: "20px",
              color: "#fdc830",
              textShadow: "3px 3px 6px rgba(0,0,0,0.8)",
            }}
          >
            The Legend of MUSTARD
          </h2>
          <p
            style={{ fontSize: "16px", marginBottom: "10px", color: "#ffeb3b" }}
          >
            Welcome, {gameState.user.username}!{" "}
            {gameState.user.isGuest
              ? "(Guest)"
              : `Currency: ${gameState.user.currency === 67 ? "∞" : gameState.user.currency}`}
          </p>
          <p
            style={{
              fontSize: "18px",
              marginBottom: "30px",
              lineHeight: "1.6",
            }}
          >
            Help Hayden the hot dog rescue his parents from the robot hot dogs!
            <br />
            Conquer settlements and make allies along the way.
          </p>

          {/* Navigation Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "15px",
              marginBottom: "20px",
            }}
          >
            <button
              onClick={() => {
                setGameState((prev) => ({
                  ...prev,
                  gamePhase: "introCutscene",
                }));
              }}
              style={{
                padding: "20px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#fdc830",
                color: "#333",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              🎮 PLAY GAME
            </button>

            <button
              onClick={() => {
                setGameState((prev) => ({ ...prev, gamePhase: "leaderboard" }));
              }}
              style={{
                padding: "20px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              🏆 LEADERBOARD
            </button>

            <button
              onClick={() => {
                setGameState((prev) => ({ ...prev, gamePhase: "profile" }));
              }}
              style={{
                padding: "20px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              👤 PROFILE
            </button>

            <button
              onClick={() => {
                setGameState((prev) => ({ ...prev, gamePhase: "shop" }));
              }}
              style={{
                padding: "20px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#9C27B0",
                color: "white",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              🛒 SHOP
            </button>

            <button
              onClick={() => {
                setGameState((prev) => ({ ...prev, gamePhase: "inventory" }));
              }}
              style={{
                padding: "20px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#FF5722",
                color: "white",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              🎒 INVENTORY
            </button>

            <button
              onClick={() => {
                setGameState((prev) => ({
                  ...prev,
                  gamePhase: "settings",
                  previousGamePhase: "menu",
                }));
              }}
              style={{
                padding: "20px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#FF9800",
                color: "white",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
                gridColumn: "1 / -1",
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              ⚙️ SETTINGS
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Intro Cutscene
  if (gameState.gamePhase === "introCutscene") {
    return <IntroCutscene setGameState={setGameState} />;
  }

  // Leaderboard Page
  if (gameState.gamePhase === "leaderboard") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "linear-gradient(135deg, #4CAF50 0%, #2e7d32 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "50px",
            background: "rgba(0,0,0,0.6)",
            borderRadius: "20px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            maxWidth: "800px",
          }}
        >
          <h1
            style={{
              fontSize: "48px",
              marginBottom: "30px",
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
            }}
          >
            🏆 LEADERBOARD
          </h1>
          <p style={{ fontSize: "20px", marginBottom: "40px" }}>
            Coming soon! Track top players and compete for the highest scores.
          </p>
          <button
            onClick={() => {
              setGameState((prev) => ({ ...prev, gamePhase: "menu" }));
            }}
            style={{
              padding: "15px 40px",
              fontSize: "20px",
              fontWeight: "bold",
              background: "#fdc830",
              color: "#333",
              border: "none",
              borderRadius: "12px",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
            }}
          >
            BACK TO MENU
          </button>
        </div>
      </div>
    );
  }

  // Settings Page
  if (gameState.gamePhase === "settings") {
    return <SettingsPage gameState={gameState} setGameState={setGameState} />;
  }

  // Shop Page
  if (gameState.gamePhase === "shop") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%)",
          display: "flex",
          flexDirection: "column",
          color: "white",
          fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
          zIndex: 1000,
          padding: "20px",
        }}
      >
        {/* Top Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            padding: "15px 20px",
            background: "rgba(0,0,0,0.4)",
            borderRadius: "10px",
          }}
        >
          <h1 style={{ fontSize: "36px", margin: 0 }}>🛒 SHOP</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold" }}>
              💰 {gameState.user.currency === 67 ? "∞" : gameState.user.currency}
            </span>
            <button
              onClick={() =>
                setGameState((prev) => ({ ...prev, gamePhase: "menu" }))
              }
              style={{
                padding: "10px 20px",
                fontSize: "16px",
                fontWeight: "bold",
                background: "#fdc830",
                color: "#333",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              BACK
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "20px",
            padding: "20px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "10px",
          }}
        >
          {shopLoading && (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                fontSize: "20px",
              }}
            >
              Loading shop items...
            </div>
          )}

          {shopError && (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "20px",
                background: "rgba(255,0,0,0.3)",
                borderRadius: "8px",
                textAlign: "center",
                fontSize: "18px",
              }}
            >
              {shopError}
            </div>
          )}

          {!shopLoading && shopItems.length === 0 && !shopError && (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                fontSize: "18px",
              }}
            >
              No items available
            </div>
          )}

          {shopItems.map((item) => {
            const isOwned = ownedItemIds.includes(item.id);
            // Special case: gold value of 67 means unlimited purchases
            const hasUnlimitedGold = gameState.user.currency === 67;
            const canAfford = hasUnlimitedGold || gameState.user.currency >= item.price;

            // Parse weapon and skin name from item name (e.g., "Pistol - Gold Plated")
            const nameParts = item.name.split(" - ");
            const weaponType = nameParts[0] || item.name;
            const skinName = nameParts[1] || "Skin";

            // Rarity-based styling
            const rarityColors: Record<string, string> = {
              common: "#808080",
              uncommon: "#2ecc71",
              rare: "#3498db",
              epic: "#9b59b6",
              legendary: "#f39c12",
            };

            // Weapon type colors
            const weaponColors: Record<string, string> = {
              Pistol: "#4CAF50",
              Rifle: "#2196F3",
              Sniper: "#9C27B0",
              Plasma: "#FF5722",
            };

            return (
              <div
                key={item.id}
                style={{
                  padding: "15px",
                  background: "rgba(0,0,0,0.5)",
                  borderRadius: "8px",
                  border: `2px solid ${rarityColors[item.rarity] || "#fff"}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {/* Weapon Type Badge */}
                <div
                  style={{
                    background: weaponColors[weaponType] || "#555",
                    color: "white",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    alignSelf: "flex-start",
                  }}
                >
                  {weaponType}
                </div>
                {item.image_url && (
                  <div
                    style={{
                      width: "100%",
                      height: "120px",
                      backgroundImage: `url(${item.image_url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      borderRadius: "6px",
                    }}
                  />
                )}
                <div>
                  <h3 style={{ margin: "0 0 5px 0", fontSize: "16px" }}>
                    {skinName}
                  </h3>
                  <p
                    style={{
                      margin: "0 0 10px 0",
                      fontSize: "12px",
                      opacity: 0.8,
                      minHeight: "30px",
                    }}
                  >
                    {item.description}
                  </p>
                  <div
                    style={{
                      fontSize: "12px",
                      color: rarityColors[item.rarity] || "#fff",
                      marginBottom: "10px",
                      textTransform: "capitalize",
                    }}
                  >
                    {item.rarity}
                  </div>
                </div>
                {isOwned ? (
                  <button
                    disabled
                    style={{
                      padding: "10px",
                      fontSize: "14px",
                      background: "#666",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "not-allowed",
                    }}
                  >
                    ✓ OWNED
                  </button>
                ) : (
                  <button
                    onClick={() => handleBuyItem(item)}
                    disabled={!canAfford}
                    style={{
                      padding: "10px",
                      fontSize: "14px",
                      background: canAfford ? "#4CAF50" : "#999",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: canAfford ? "pointer" : "not-allowed",
                      fontWeight: "bold",
                    }}
                  >
                    {canAfford ? `BUY ${item.price}` : "NOT ENOUGH"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Level Transition Cutscene with Shop
  if (gameState.gamePhase === "levelTransition") {
    const completedLevel = LEVELS[gameState.level.currentLevel];
    const nextLevel = LEVELS[gameState.level.currentLevel + 1];

    // Determine weapon unlock for this level
    let weaponUnlock = null;
    if (gameState.level.currentLevel === 0) {
      weaponUnlock = { id: 2, name: weapons[2].name }; // Rifle after level 1
    } else if (gameState.level.currentLevel === 1) {
      weaponUnlock = { id: 3, name: weapons[3].name }; // Assault Rifle after level 2
    } else if (gameState.level.currentLevel === 3) {
      weaponUnlock = { id: 4, name: weapons[4].name }; // LMG after level 4
    }

    const canAffordToken = gameState.coins >= 2;

    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background:
            "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
          zIndex: 1000,
          overflow: "auto",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "50px",
            background: "rgba(0,0,0,0.7)",
            borderRadius: "20px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            maxWidth: "800px",
            margin: "20px",
          }}
        >
          <h2
            style={{
              fontSize: "48px",
              fontWeight: "bold",
              marginBottom: "20px",
              color: "#4caf50",
              textShadow: "3px 3px 6px rgba(0,0,0,0.8)",
            }}
          >
            ✅ LEVEL COMPLETE!
          </h2>
          <div
            style={{
              fontSize: "20px",
              marginBottom: "20px",
              lineHeight: "1.8",
            }}
          >
            <p style={{ marginBottom: "15px", color: "#ffeb3b" }}>
              You've conquered <strong>{completedLevel?.name}</strong>!
            </p>
            <p style={{ fontSize: "18px", opacity: 0.9 }}>
              Coins:{" "}
              <span style={{ color: "#fdc830", fontWeight: "bold" }}>
                {gameState.coins}
              </span>
            </p>
          </div>

          {weaponUnlock && (
            <div
              style={{
                marginBottom: "20px",
                padding: "15px",
                background: "rgba(76,175,80,0.2)",
                borderRadius: "10px",
                border: "2px solid #4caf50",
              }}
            >
              <h3
                style={{
                  fontSize: "20px",
                  color: "#4caf50",
                  marginBottom: "5px",
                }}
              >
                🔓 WEAPON UNLOCKED!
              </h3>
              <p style={{ fontSize: "18px", fontWeight: "bold" }}>
                {weaponUnlock.name}
              </p>
            </div>
          )}

          {/* Shop Section */}
          <div
            style={{
              marginBottom: "20px",
              padding: "20px",
              background: "rgba(156,39,176,0.2)",
              borderRadius: "10px",
              border: "2px solid #9C27B0",
            }}
          >
            <h3
              style={{
                fontSize: "24px",
                color: "#9C27B0",
                marginBottom: "15px",
              }}
            >
              🛒 SHOPKEEPER
            </h3>
            <p
              style={{
                fontSize: "14px",
                opacity: 0.8,
                marginBottom: "15px",
                fontStyle: "italic",
              }}
            >
              "Traveler! I have something for you..."
            </p>

            {/* Token Item */}
            <div
              style={{
                padding: "15px",
                background: "rgba(0,0,0,0.4)",
                borderRadius: "8px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: "bold",
                      marginBottom: "5px",
                    }}
                  >
                    💚 Health Buff Token
                  </div>
                  <div style={{ fontSize: "14px", opacity: 0.7 }}>
                    Permanently increases max health by +10 HP (stackable!)
                  </div>
                  {gameState.tokensPurchased > 0 && (
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#4caf50",
                        marginTop: "5px",
                      }}
                    >
                      Owned: {gameState.tokensPurchased} | Max Health:{" "}
                      {gameState.maxHealth} HP
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (canAffordToken) {
                      setGameState((prev) => ({
                        ...prev,
                        coins: prev.coins - 2,
                        maxHealth: prev.maxHealth + 10,
                        health: Math.min(prev.health + 10, prev.maxHealth + 10),
                        tokensPurchased: prev.tokensPurchased + 1,
                      }));
                    }
                  }}
                  disabled={!canAffordToken}
                  style={{
                    padding: "10px 20px",
                    fontSize: "16px",
                    fontWeight: "bold",
                    background: canAffordToken ? "#4caf50" : "#444",
                    color: canAffordToken ? "white" : "#666",
                    border: "none",
                    borderRadius: "8px",
                    cursor: canAffordToken ? "pointer" : "not-allowed",
                    fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
                  }}
                >
                  BUY - 2 💰
                </button>
              </div>
            </div>
          </div>

          {nextLevel && (
            <div
              style={{
                marginBottom: "20px",
                padding: "20px",
                background: "rgba(255,215,0,0.1)",
                borderRadius: "10px",
              }}
            >
              <h3
                style={{
                  fontSize: "24px",
                  color: "#fdc830",
                  marginBottom: "10px",
                }}
              >
                🎯 NEXT MISSION
              </h3>
              <p
                style={{
                  fontSize: "20px",
                  fontWeight: "bold",
                  marginBottom: "5px",
                }}
              >
                {nextLevel.name}
              </p>
              <p style={{ fontSize: "16px", opacity: 0.8 }}>
                {nextLevel.description}
              </p>
            </div>
          )}

          <button
            onClick={() => {
              setGameState((prev) => {
                // Add weapon unlock
                const newUnlockedWeapons =
                  weaponUnlock &&
                  !prev.unlockedWeapons.includes(weaponUnlock.id)
                    ? [...prev.unlockedWeapons, weaponUnlock.id]
                    : prev.unlockedWeapons;

                return {
                  ...prev,
                  gamePhase: "playing",
                  health: prev.maxHealth,
                  ammo: weapons[prev.currentWeapon].maxAmmo,
                  enemies: [],
                  bullets: [],
                  enemyProjectiles: [],
                  level: {
                    currentLevel: prev.level.currentLevel + 1,
                    killsThisLevel: 0,
                    giantsSpawnedThisLevel: 0,
                  },
                  unlockedWeapons: newUnlockedWeapons,
                };
              });
              document.body.requestPointerLock();
            }}
            style={{
              padding: "20px 40px",
              fontSize: "24px",
              fontWeight: "bold",
              background: "#fdc830",
              color: "#333",
              border: "none",
              borderRadius: "12px",
              cursor: "pointer",
              boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
              fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
            }}
          >
            CONTINUE ADVENTURE →
          </button>
        </div>
      </div>
    );
  }

  // Victory Screen
  if (gameState.gamePhase === "victory") {
    const currencyEarned = gameState.coins;
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background:
            "linear-gradient(135deg, #ff6b35 0%, #f7931e 50%, #fdc830 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "50px",
            background: "rgba(0,0,0,0.6)",
            borderRadius: "20px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            maxWidth: "700px",
          }}
        >
          <h2
            style={{
              fontSize: "56px",
              fontWeight: "bold",
              marginBottom: "20px",
              color: "#fdc830",
              textShadow: "3px 3px 6px rgba(0,0,0,0.8)",
            }}
          >
            🌭 VICTORY! 🌭
          </h2>
          <div
            style={{
              fontSize: "24px",
              marginBottom: "30px",
              lineHeight: "1.6",
            }}
          >
            <p style={{ marginBottom: "20px" }}>
              Hayden has conquered all robot settlements
              <br />
              and rescued his parents from Mustard Mountain!
            </p>
            <p style={{ fontSize: "18px", opacity: 0.9 }}>
              The hot dog family is reunited once more,
              <br />
              and peace returns to Hot Dog Haven!
            </p>
          </div>
          <div style={{ marginBottom: "30px", fontSize: "18px" }}>
            <div style={{ marginBottom: "10px" }}>
              Total Coins:{" "}
              <span style={{ color: "#fdc830", fontWeight: "bold" }}>
                {gameState.coins}
              </span>
            </div>
            <div style={{ marginBottom: "10px" }}>
              Allies Rescued:{" "}
              <span style={{ color: "#90EE90", fontWeight: "bold" }}>
                {gameState.story.alliesRescued}
              </span>
            </div>
            <div style={{ marginBottom: "10px" }}>
              Settlements Conquered:{" "}
              <span style={{ color: "#FFD700", fontWeight: "bold" }}>
                {gameState.story.settlementsConquered.length}/
                {SETTLEMENTS.length}
              </span>
            </div>
            <div style={{ marginBottom: "10px" }}>
              Currency Earned:{" "}
              <span style={{ color: "#4caf50", fontWeight: "bold" }}>
                {currencyEarned}
              </span>
            </div>
            {!gameState.user.isGuest && (
              <div
                style={{ fontSize: "14px", opacity: 0.8, marginTop: "10px" }}
              >
                Currency added to your account!
              </div>
            )}
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "15px" }}
          >
            <button
              onClick={async () => {
                const newCurrency = gameState.user.isGuest
                  ? gameState.user.currency
                  : gameState.user.currency + currencyEarned;

                if (!gameState.user.isGuest && gameState.user.username) {
                  try {
                    await fetch("/api/update-currency", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        username: gameState.user.username,
                        currency: newCurrency,
                      }),
                    });
                  } catch (error) {
                    console.error("Failed to save currency:", error);
                  }
                }

                setGameState((prev) => ({
                  ...prev,
                  health: 100,
                  ammo: 12,
                  coins: 0,
                  gamePhase: "playing",
                  enemies: [],
                  bullets: [],
                  lastDamageTime: 0,
                  story: {
                    currentSettlement: 0,
                    alliesRescued: 0,
                    settlementsConquered: [],
                    totalKills: 0,
                  },
                  level: {
                    currentLevel: 0,
                    killsThisLevel: 0,
                    giantsSpawnedThisLevel: 0,
                  },
                  unlockedWeapons: [1],
                  inventory: [],
                  user: {
                    ...prev.user,
                    currency: newCurrency,
                  },
                }));
                document.body.requestPointerLock();
              }}
              style={{
                padding: "15px 30px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#fdc830",
                color: "#333",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
              }}
            >
              PLAY AGAIN
            </button>
            <button
              onClick={async () => {
                const newCurrency = gameState.user.isGuest
                  ? gameState.user.currency
                  : gameState.user.currency + currencyEarned;

                if (!gameState.user.isGuest && gameState.user.username) {
                  try {
                    await fetch("/api/update-currency", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        username: gameState.user.username,
                        currency: newCurrency,
                      }),
                    });
                  } catch (error) {
                    console.error("Failed to save currency:", error);
                  }
                }

                setGameState((prev) => ({
                  ...prev,
                  health: 100,
                  ammo: 12,
                  coins: 0,
                  gamePhase: "menu",
                  enemies: [],
                  bullets: [],
                  enemyProjectiles: [],
                  lastDamageTime: 0,
                  story: {
                    currentSettlement: 0,
                    alliesRescued: 0,
                    settlementsConquered: [],
                    totalKills: 0,
                  },
                  level: {
                    currentLevel: 0,
                    killsThisLevel: 0,
                    giantsSpawnedThisLevel: 0,
                  },
                  user: {
                    ...prev.user,
                    currency: newCurrency,
                  },
                }));
              }}
              style={{
                padding: "15px 30px",
                fontSize: "18px",
                fontWeight: "bold",
                background: "rgba(255,255,255,0.2)",
                color: "white",
                border: "2px solid white",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              RETURN TO MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Game Over Screen
  if (gameState.gamePhase === "gameover") {
    const currencyEarned = gameState.coins;
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "Inter, sans-serif",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            background: "rgba(20,20,20,0.9)",
            borderRadius: "20px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          }}
        >
          <h2
            style={{
              fontSize: "48px",
              fontWeight: "bold",
              marginBottom: "20px",
              color: "#ff4444",
            }}
          >
            GAME OVER
          </h2>
          <div style={{ marginBottom: "30px", fontSize: "20px" }}>
            <div style={{ marginBottom: "10px" }}>
              Total Coins:{" "}
              <span style={{ color: "#ffeb3b" }}>{gameState.coins}</span>
            </div>
            <div style={{ marginBottom: "10px" }}>
              Currency Earned:{" "}
              <span style={{ color: "#4caf50" }}>{currencyEarned}</span>
            </div>
            {!gameState.user.isGuest && (
              <div style={{ fontSize: "16px", opacity: 0.8 }}>
                Currency added to your account!
              </div>
            )}
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "15px" }}
          >
            <button
              onClick={async () => {
                const newCurrency = gameState.user.isGuest
                  ? gameState.user.currency
                  : gameState.user.currency + currencyEarned;

                // Save currency to backend for registered users
                if (!gameState.user.isGuest && gameState.user.username) {
                  try {
                    await fetch("/api/update-currency", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        username: gameState.user.username,
                        currency: newCurrency,
                      }),
                    });
                  } catch (error) {
                    console.error("Failed to save currency:", error);
                  }
                }

                setGameState((prev) => ({
                  ...prev,
                  health: 100,
                  ammo: 12,
                  coins: 0,
                  gamePhase: "playing",
                  enemies: [],
                  bullets: [],
                  lastDamageTime: 0,
                  story: {
                    currentSettlement: 0,
                    alliesRescued: 0,
                    settlementsConquered: [],
                    totalKills: 0,
                  },
                  level: {
                    currentLevel: 0,
                    killsThisLevel: 0,
                    giantsSpawnedThisLevel: 0,
                  },
                  unlockedWeapons: [1],
                  inventory: [],
                  user: {
                    ...prev.user,
                    currency: newCurrency,
                  },
                }));
                document.body.requestPointerLock();
              }}
              style={{
                padding: "15px 30px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              PLAY AGAIN
            </button>
            <button
              onClick={async () => {
                const newCurrency = gameState.user.isGuest
                  ? gameState.user.currency
                  : gameState.user.currency + currencyEarned;

                // Save currency to backend for registered users
                if (!gameState.user.isGuest && gameState.user.username) {
                  try {
                    await fetch("/api/update-currency", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        username: gameState.user.username,
                        currency: newCurrency,
                      }),
                    });
                  } catch (error) {
                    console.error("Failed to save currency:", error);
                  }
                }

                setGameState((prev) => ({
                  ...prev,
                  health: 100,
                  ammo: 12,
                  coins: 0,
                  gamePhase: "menu",
                  enemies: [],
                  bullets: [],
                  enemyProjectiles: [],
                  lastDamageTime: 0,
                  story: {
                    currentSettlement: 0,
                    alliesRescued: 0,
                    settlementsConquered: [],
                    totalKills: 0,
                  },
                  level: {
                    currentLevel: 0,
                    killsThisLevel: 0,
                    giantsSpawnedThisLevel: 0,
                  },
                  user: {
                    ...prev.user,
                    currency: newCurrency,
                  },
                }));
              }}
              style={{
                padding: "15px 30px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              RETURN HOME
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.gamePhase === "paused") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "Inter, sans-serif",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            background: "rgba(20,20,20,0.9)",
            borderRadius: "20px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          }}
        >
          <h2
            style={{
              fontSize: "48px",
              fontWeight: "bold",
              marginBottom: "30px",
            }}
          >
            GAME PAUSED
          </h2>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            <button
              onClick={() => {
                setGameState((prev) => ({ ...prev, gamePhase: "playing" }));
                document.body.requestPointerLock();
              }}
              style={{
                padding: "15px 30px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              RESUME
            </button>
            <button
              onClick={() => {
                setGameState((prev) => ({
                  ...prev,
                  gamePhase: "login",
                  health: 100,
                  ammo: 12,
                  coins: 0,
                  enemies: [],
                  bullets: [],
                  enemyProjectiles: [],
                  user: {
                    username: null,
                    isGuest: false,
                    currency: 0,
                    cosmetics: [],
                    equippedSkin: null,
                  },
                }));
              }}
              style={{
                padding: "15px 30px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              EXIT TO MAIN MENU
            </button>
            <button
              onClick={() => {
                setGameState((prev) => ({
                  ...prev,
                  gamePhase: "settings",
                  previousGamePhase: "paused", // Remember we came from pause menu
                }));
              }}
              style={{
                padding: "15px 30px",
                fontSize: "20px",
                fontWeight: "bold",
                background: "#808080",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              SETTINGS
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.gamePhase !== "playing") return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 100,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Crosshair */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "20px",
          height: "20px",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "2px",
            height: "20px",
            backgroundColor: "white",
            boxShadow: "0 0 2px black",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "20px",
            height: "2px",
            backgroundColor: "white",
            boxShadow: "0 0 2px black",
          }}
        />
      </div>

      {/* Health */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          left: "40px",
          background: "rgba(0,0,0,0.7)",
          padding: "15px",
          borderRadius: "8px",
          color: "white",
          border: "2px solid rgba(255,255,255,0.3)",
        }}
      >
        <div
          style={{
            marginBottom: "8px",
            fontSize: "14px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          HEALTH
          {gameState.tokensPurchased > 0 && (
            <div
              style={{
                fontSize: "13px",
                background: "rgba(76,175,80,0.3)",
                padding: "3px 7px",
                borderRadius: "4px",
                border: "1px solid #4caf50",
                color: "#4caf50",
              }}
              title={`Health Buff Tokens: ${gameState.tokensPurchased}`}
            >
              💚 +{gameState.tokensPurchased * 10}
            </div>
          )}
        </div>
        <div
          style={{
            width: "200px",
            height: "20px",
            background: "rgba(255,255,255,0.2)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(gameState.health / gameState.maxHealth) * 100}%`,
              height: "100%",
              background:
                gameState.health > gameState.maxHealth * 0.3
                  ? "#00ff00"
                  : "#ff0000",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div style={{ marginTop: "4px", fontSize: "12px" }}>
          {gameState.health} / {gameState.maxHealth}
        </div>
      </div>

      {/* Weapon & Ammo */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          right: "40px",
          background: "rgba(0,0,0,0.7)",
          padding: "15px",
          borderRadius: "8px",
          color: "white",
          textAlign: "center",
          border: "2px solid rgba(255,255,255,0.3)",
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "bold",
            marginBottom: "8px",
            color: "#ffeb3b",
          }}
        >
          {weapons[gameState.currentWeapon].name}
        </div>
        <div
          style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "4px" }}
        >
          {gameState.isReloading ? "RELOADING..." : gameState.ammo}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.8 }}>
          / {weapons[gameState.currentWeapon].maxAmmo}
        </div>
        <div style={{ fontSize: "10px", marginTop: "4px", opacity: 0.6 }}>
          AMMO
        </div>
        <div style={{ fontSize: "8px", marginTop: "4px", opacity: 0.5 }}>
          Keys: 1-4 to switch | R to reload
        </div>
      </div>

      {/* Coins & Level Progress */}
      <div
        style={{
          position: "absolute",
          top: "40px",
          left: "40px",
          background: "rgba(0,0,0,0.7)",
          padding: "15px",
          borderRadius: "8px",
          color: "white",
          border: "2px solid rgba(255,215,0,0.5)",
          fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            marginBottom: "8px",
            color: "#fdc830",
          }}
        >
          💰 COINS: {gameState.coins}
        </div>
        <div
          style={{
            fontSize: "12px",
            color: "#ffeb3b",
            fontWeight: "bold",
            marginBottom: "4px",
          }}
        >
          {LEVELS[gameState.level.currentLevel]?.name || "Final Level"}
        </div>
        <div style={{ fontSize: "11px", marginBottom: "8px" }}>
          Kills: {gameState.level.killsThisLevel}/
          {LEVELS[gameState.level.currentLevel]?.killsRequired || "∞"}
        </div>
        <div style={{ fontSize: "11px", color: "#90EE90" }}>
          ✓ Allies Rescued: {gameState.story.alliesRescued}
        </div>
        <div style={{ fontSize: "11px", color: "#FFD700" }}>
          ✓ Settlements: {gameState.story.settlementsConquered.length}/
          {SETTLEMENTS.length}
        </div>
      </div>
    </div>
  );
}

// Game Logic Component
function GameLogic({
  gameState,
  setGameState,
}: {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const lastSpawnTime = useRef(0);

  useFrame((state) => {
    if (gameState.gamePhase !== "playing") return;

    // Spawn enemies with level-based spawn rate
    const currentTime = state.clock.elapsedTime;
    const currentLevelData = LEVELS[gameState.level.currentLevel];
    const spawnRate = currentLevelData?.spawnRate || 3; // Default 3 seconds if no level
    const maxEnemies = currentLevelData?.maxEnemies || 10; // Use level-based max enemies

    if (
      currentTime - lastSpawnTime.current > spawnRate &&
      gameState.enemies.length < maxEnemies
    ) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 15 + Math.random() * 8;
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;

      // Choose enemy type based on level
      // Level 0 (Bun Valley): melee only
      // Level 1 (Robot Factory): 60% melee, 40% ranged
      // Level 2 (Palace): 40% melee, 30% ranged, 30% giant (max 3 giants)
      // Level 3 (Crimson Battlefield): 30% melee, 30% ranged, 40% giant (max 8 giants)
      // Level 4 (Mustard Mountain): 30% melee, 30% ranged, 40% giant (max 10 giants)
      let enemyType: EnemyType = "melee";
      const currentLevel = gameState.level.currentLevel;

      if (currentLevel === 0) {
        enemyType = "melee";
      } else if (currentLevel === 1) {
        enemyType = Math.random() < 0.6 ? "melee" : "ranged";
      } else if (currentLevel === 2) {
        const roll = Math.random();
        if (roll < 0.3 && gameState.level.giantsSpawnedThisLevel < 3) {
          enemyType = "giant";
        } else if (roll < 0.7) {
          enemyType = "melee";
        } else {
          enemyType = "ranged";
        }
      } else if (currentLevel === 3) {
        const roll = Math.random();
        if (roll < 0.4 && gameState.level.giantsSpawnedThisLevel < 8) {
          enemyType = "giant";
        } else if (roll < 0.7) {
          enemyType = "melee";
        } else {
          enemyType = "ranged";
        }
      } else if (currentLevel === 4) {
        const roll = Math.random();
        if (roll < 0.4 && gameState.level.giantsSpawnedThisLevel < 10) {
          enemyType = "giant";
        } else if (roll < 0.7) {
          enemyType = "melee";
        } else {
          enemyType = "ranged";
        }
      }

      const archetype = ENEMY_ARCHETYPES[enemyType];

      setGameState((prev) => ({
        ...prev,
        enemies: [
          ...prev.enemies,
          {
            id: `enemy_${Date.now()}_${Math.random()}`,
            type: enemyType,
            position: [x, 1, z],
            velocity: [0, 0, 0],
            health: archetype.health,
            nextAttackAt: 0,
          },
        ],
        level: {
          ...prev.level,
          giantsSpawnedThisLevel:
            enemyType === "giant"
              ? prev.level.giantsSpawnedThisLevel + 1
              : prev.level.giantsSpawnedThisLevel,
        },
      }));

      lastSpawnTime.current = currentTime;
    }
  });

  return null;
}

// Main Game Component
function Game() {
  const [gameState, setGameState] = useState<GameState>({
    health: 100,
    maxHealth: 100, // Start with 100 max health
    ammo: 12, // Start with pistol ammo (updated)
    coins: 0, // Changed from score to coins
    gamePhase: "login",
    enemies: [],
    bullets: [],
    enemyProjectiles: [],
    walls: [],
    ramps: [],
    user: {
      username: null,
      isGuest: false,
      currency: 0,
      cosmetics: [],
      equippedSkin: null,
    },
    story: {
      currentSettlement: 0,
      alliesRescued: 0,
      settlementsConquered: [],
      totalKills: 0,
    },
    level: {
      currentLevel: 0,
      killsThisLevel: 0,
      giantsSpawnedThisLevel: 0,
    },
    unlockedWeapons: [1], // Start with pistol only
    inventory: [], // No items purchased yet
    tokensPurchased: 0, // No health buff tokens purchased yet
    lastDamageTime: 0,
    currentWeapon: 1, // Start with pistol
    isReloading: false,
    reloadStartTime: 0,
    lastShotTime: 0,
    previousGamePhase: null,
  });

  if (gameState.gamePhase !== "playing" && gameState.gamePhase !== "paused") {
    return <HUD gameState={gameState} setGameState={setGameState} />;
  }

  return (
    <>
      <Canvas
        camera={{ position: [0, 2.4, 0], fov: 75, near: 0.1, far: 1000 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ width: "100vw", height: "100vh" }}
      >
        <color attach="background" args={["#87CEEB"]} />

        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <directionalLight position={[50, 50, 25]} intensity={1} />

        <Suspense fallback={null}>
          <GameEnvironment gameState={gameState} />
          <Player gameState={gameState} setGameState={setGameState} />
          <WeaponSprite gameState={gameState} />

          {gameState.enemies.map((enemy) => (
            <Enemy
              key={enemy.id}
              enemy={enemy}
              gameState={gameState}
              setGameState={setGameState}
            />
          ))}

          {gameState.bullets.map((bullet) => (
            <Bullet key={bullet.id} bullet={bullet} />
          ))}

          {gameState.enemyProjectiles.map((projectile) => (
            <EnemyProjectile
              key={projectile.id}
              projectile={projectile}
              gameState={gameState}
              setGameState={setGameState}
            />
          ))}

          <GameLogic gameState={gameState} setGameState={setGameState} />
        </Suspense>
      </Canvas>

      <HUD gameState={gameState} setGameState={setGameState} />
    </>
  );
}

// Main App
export default function SimpleFPS() {
  // 👇 grab the current keybindings from your settings store
  const { keybindings } = useSettings();

  // 👇 convert { forward: ["KeyW"], ... } into the array that KeyboardControls expects
  const controls = useMemo(
    () =>
      Object.entries(keybindings).map(([name, keys]) => ({
        name,
        keys,
      })),
    [keybindings],
  );

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <KeyboardControls map={controls}>
        <Game />
      </KeyboardControls>
    </div>
  );
}
