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
import { getLocalStorage, setLocalStorage } from "./lib/utils";

import Crosshair from "./api/components/fps/Crosshair";
import {
  ENEMY_BEHAVIOR_BY_TYPE,
  getEnemyMovementIntent,
  resolveMovementWithFallback,
  type EnemyBehavior,
} from "./lib/game/enemyMovement";

import Menu from "./api/components/fps/Menu";
import { useGame } from "./lib/stores/useGame";

// Weapon definitions
interface Weapon {
  name: string;
  maxAmmo: number;
  reserveAmmoCap: number;
  damage: number;
  reloadTime: number;
  fireRate: number; // shots per second, 0 for semi-auto
  bulletsPerKill: number;
  tier: number;
  pelletCount?: number; // for shotgun-type weapons
  spreadAngle?: number; // spread angle in degrees
  burnDamagePerTick?: number;
  burnDurationMs?: number;
  burnTickMs?: number;
}

const weapons: Record<number, Weapon> = {
  1: {
    name: "Ketchup Squirter",
    maxAmmo: 12,
    reserveAmmoCap: 48,
    damage: 34,
    reloadTime: 2000,
    fireRate: 0, // semi-auto
    bulletsPerKill: 1,
    tier: 1,
  },
  2: {
    name: "Mustard Launcher",
    maxAmmo: 6,
    reserveAmmoCap: 24,
    damage: 150,
    reloadTime: 3000,
    fireRate: 0, // semi-auto
    bulletsPerKill: 1,
    tier: 2,
  },
  3: {
    name: "Topping Shooter",
    maxAmmo: 36,
    reserveAmmoCap: 108,
    damage: 25,
    reloadTime: 2000,
    fireRate: 15, // 18 shots per second
    bulletsPerKill: 2,
    tier: 3,
  },
  4: {
    name: "Lacerating Muffin Generator",
    maxAmmo: 200,
    reserveAmmoCap: 400,
    damage: 12.5,
    reloadTime: 5000,
    fireRate: 14, // 12 shots per second
    bulletsPerKill: 2,
    tier: 4,
  },
  5: {
    name: "Spreadshot",
    maxAmmo: 8, // 6 shells
    reserveAmmoCap: 32,
    damage: 34, // per pellet, 3 pellets = kill
    reloadTime: 2000,
    fireRate: 0, // semi-auto
    bulletsPerKill: 5, // pellets to kill
    tier: 2,
    pelletCount: 8, // 8 pellets per shell
    spreadAngle: 20, // 20 degree cone
  },
  6: {
    name: "Flamethrower",
    maxAmmo: 120,
    reserveAmmoCap: 360,
    damage: 6,
    reloadTime: 2200,
    fireRate: 18,
    bulletsPerKill: 8,
    tier: 5,
    burnDamagePerTick: 3,
    burnDurationMs: 2500,
    burnTickMs: 400,
  },
};

function getStartingReserveAmmo(weaponId: number): number {
  return weapons[weaponId].reserveAmmoCap;
}

function getFullMagazineByWeapon(): Record<number, number> {
  return Object.fromEntries(
    Object.entries(weapons).map(([id, weapon]) => [Number(id), weapon.maxAmmo]),
  ) as Record<number, number>;
}

function getFullReserveByWeapon(): Record<number, number> {
  return Object.fromEntries(
    Object.entries(weapons).map(([id]) => [Number(id), getStartingReserveAmmo(Number(id))]),
  ) as Record<number, number>;
}

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
  {
    id: 6,
    name: "Shattered Skybridge",
    description: "Broken catwalks and crossfire from every angle",
    killsRequired: 65,
    spawnRate: 1.2,
    maxEnemies: 24,
  },
  {
    id: 7,
    name: "Core Meltdown Reactor",
    description: "Maximum pressure in the collapsing robot core",
    killsRequired: 80,
    spawnRate: 0.95,
    maxEnemies: 30,
  },
  {
    id: 8,
    name: "Boss Arena",
    description: "A massive open field with the final boss",
    killsRequired: 1,
    spawnRate: 0,
    maxEnemies: 1,
  },
];

// Enemy types and archetypes
type EnemyType = "melee" | "ranged" | "flyingHybrid" | "giant" | "rat" | "boss";
type Difficulty = "normal" | "hard" | "extreme";

interface Enemy {
  id: string;
  type: EnemyType;
  behavior: EnemyBehavior;
  position: [number, number, number];
  velocity: [number, number, number];
  movementDirection: [number, number, number];
  isMoving: boolean;
  health: number;
  nextAttackAt: number;
  attackPatternStep?: "volley" | "melee";
  bossBeamEndsAt?: number;
  bossLastBeamDamageAt?: number;
  burningUntil?: number;
  nextBurnTickAt?: number;
  burnDamagePerTick?: number;
  burnTickMs?: number;
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
    moveSpeed: 6,
    damage: 15,
    attackInterval: 1000,
    color: "#ff0000",
  },
  ranged: {
    health: 100,
    moveSpeed: 5,
    damage: 10,
    attackInterval: 1500, // Medium fire rate
    color: "#ff6600",
  },
  flyingHybrid: {
    health: 275,
    moveSpeed: 6.5,
    damage: 18,
    attackInterval: 1800,
    color: "#44d5ff",
  },
  giant: {
    health: 400,
    moveSpeed: 3,
    damage: 50,
    attackInterval: 1500,
    color: "#990000",
    size: 2, // 2x larger than normal enemies
  },
  rat: {
    health: 50,
    moveSpeed: 8,
    damage: 5,
    attackInterval: 750,
    color: "#363636",
    size: 0.5, //2x smaller than normal enemies
  },
  boss: {
    health: 2000,
    moveSpeed: 2.8,
    damage: 70,
    attackInterval: 1200,
    color: "#7a1fa2",
    size: 3,
  },
};

const DIFFICULTY_SETTINGS: Record<
  Difficulty,
  {
    label: string;
    enemyHealthMultiplier: number;
    enemyDamageMultiplier: number;
    enemyMoveSpeedMultiplier: number;
    enemyAttackSpeedMultiplier: number;
  }
> = {
  normal: {
    label: "Normal",
    enemyHealthMultiplier: 1,
    enemyDamageMultiplier: 1,
    enemyMoveSpeedMultiplier: 1,
    enemyAttackSpeedMultiplier: 1,
  },
  hard: {
    label: "Hard",
    enemyHealthMultiplier: 1.4,
    enemyDamageMultiplier: 1.3,
    enemyMoveSpeedMultiplier: 1,
    enemyAttackSpeedMultiplier: 1,
  },
  extreme: {
    label: "Extreme",
    enemyHealthMultiplier: 1.8,
    enemyDamageMultiplier: 1.6,
    enemyMoveSpeedMultiplier: 1.25,
    enemyAttackSpeedMultiplier: 1.35,
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

interface MapPickup {
  id: string;
  position: [number, number, number];
  type: "supplyCrate" | "ammoCrate";
  healthRestore: number;
  coinReward: number;
  ammoReward: number;
  grenadeReward: number;
}

// Simple game state
interface GameState {
  health: number;
  maxHealth: number; // Added for token health buffs
  ammo: number;
  reserveAmmo: number;
  grenades: number;
  maxGrenades: number;
  coins: number; // Changed from score to coins
  gamePhase:
    | "login"
    | "register"
    | "menu"
    | "difficultySelect"
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
    burnDamagePerTick?: number;
    burnDurationMs?: number;
    burnTickMs?: number;
  }>;
  grenadeProjectiles: Array<{
    id: string;
    position: [number, number, number];
    velocity: [number, number, number];
  }>;
  explosions: Array<{
    id: string;
    position: [number, number, number];
    startTime: number;
    duration: number;
    radius: number;
  }>;
  enemyProjectiles: Array<{
    id: string;
    position: [number, number, number];
    direction: [number, number, number];
    damage: number;
  }>;
  pickups: MapPickup[];
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
  augmentLevels: {
    weaponDamage: number;
    weaponFireRate: number;
    weaponReloadSpeed: number;
    weaponSpreadControl: number;
    userMaxHealth: number;
    userMoveSpeed: number;
    userRegen: number;
    userDamageResist: number;
  };
  lastDamageTime: number;
  currentWeapon: number;
  isReloading: boolean;
  reloadStartTime: number;
  reloadDuration: number;
  lastShotTime: number;
  previousGamePhase: string | null; // Track where user came from (for settings back navigation)
  equippedWeaponSkins: Record<number, string>; // Track equipped skin per weapon (weapon id -> skin name)
  loadout: Record<number, number>; // Tier -> weapon ID mapping (one weapon per tier)
  isAdmin: boolean; // Whether user has admin privileges
  gameStartTime: number | null; // Timestamp when game started (for leaderboard run time)
  gameMode: "story" | "endless"; // Game mode: story (with levels) or endless (wave survival)
  difficulty: Difficulty;
  sessionShotsFired: number; // Shots fired this session (saved to DB on death)
  sessionShotsHit: number; // Bullet hits on enemies this session
  adminLevelTestMode: boolean;
  adminTestStartLevel: number | null;
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

const RAMP_THICKNESS = 0.5;
const RAMP_HEIGHT_GAIN = 2;
const MIN_RELOAD_MULTIPLIER = 0.4;
const MIN_SPREAD_MULTIPLIER = 0.35;
const MAX_DAMAGE_RESISTANCE = 0.6;
const GRENADE_MAX_CHARGE_MS = 1000;
const GRENADE_MIN_THROW_SPEED = 14;
const GRENADE_MAX_THROW_SPEED = 26;
const GRENADE_BASE_DAMAGE = 220;
const GRENADE_SPLASH_RADIUS = 7;

function getRampLocalPosition(position: THREE.Vector3, ramp: Ramp) {
  const [rx, , rz] = ramp.position;
  const dx = position.x - rx;
  const dz = position.z - rz;
  const cos = Math.cos(-ramp.rotation);
  const sin = Math.sin(-ramp.rotation);

  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
  };
}

function applyKillProgress(prev: GameState, additionalKills: number) {
  if (additionalKills <= 0) return prev;

  const newCoins = prev.coins + additionalKills;
  const newKills = prev.story.totalKills + additionalKills;
  const newLevelKills = prev.level.killsThisLevel + additionalKills;
  const newSettlementIndex = Math.floor(newKills / 10);
  const newAlliesRescued = Math.floor(newKills / 3);

  let newSettlementsConquered = prev.story.settlementsConquered;
  if (
    newSettlementIndex > prev.story.currentSettlement &&
    newSettlementIndex <= SETTLEMENTS.length
  ) {
    const settlementName = SETTLEMENTS[newSettlementIndex - 1];
    if (!prev.story.settlementsConquered.includes(settlementName)) {
      newSettlementsConquered = [...prev.story.settlementsConquered, settlementName];
    }
  }

  const currentLevelData = LEVELS[prev.level.currentLevel];
  const shouldLevelUp =
    currentLevelData && newLevelKills >= currentLevelData.killsRequired;
  const nextLevel = prev.level.currentLevel + 1;
  const hasNextLevel = nextLevel < LEVELS.length;
  const completedFinalLevel = shouldLevelUp && !hasNextLevel;
  const isEndless = prev.gameMode === "endless";

  let nextPhase = prev.gamePhase;
  if (completedFinalLevel && !isEndless) {
    nextPhase = "victory";
  } else if (shouldLevelUp && hasNextLevel) {
    nextPhase = "levelTransition";
  }

  return {
    ...prev,
    coins: newCoins,
    story: {
      currentSettlement: Math.min(newSettlementIndex, SETTLEMENTS.length - 1),
      alliesRescued: newAlliesRescued,
      settlementsConquered: newSettlementsConquered,
      totalKills: newKills,
    },
    level: {
      currentLevel: prev.level.currentLevel,
      killsThisLevel: completedFinalLevel && isEndless ? 0 : newLevelKills,
      giantsSpawnedThisLevel: prev.level.giantsSpawnedThisLevel,
    },
    gamePhase: nextPhase,
  };
}

function getRampSurfaceY(position: THREE.Vector3, ramp: Ramp): number | null {
  const { x: localX, z: localZ } = getRampLocalPosition(position, ramp);
  const halfWidth = ramp.width / 2;
  const halfLength = ramp.length / 2;

  if (Math.abs(localX) > halfWidth || Math.abs(localZ) > halfLength) {
    return null;
  }

  const progress = (localZ + halfLength) / ramp.length;
  const [, ry] = ramp.position;

  return ry - RAMP_HEIGHT_GAIN / 2 + progress * RAMP_HEIGHT_GAIN + RAMP_THICKNESS / 2;
}

function getRampSlopeRotationX(ramp: Ramp): number {
  return Math.asin(Math.min(1, RAMP_HEIGHT_GAIN / ramp.length));
}

// Ramp collision detection helper (solid collision volume for non-player entities)
function checkRampCollision(
  position: THREE.Vector3,
  ramps: Ramp[],
  radius: number = 0.5,
): boolean {
  for (const ramp of ramps) {
    const surfaceY = getRampSurfaceY(position, ramp);
    if (surfaceY === null) continue;

    const rampBottomY = Math.max(0, surfaceY - (RAMP_THICKNESS + 0.75));
    const rampTopY = surfaceY + RAMP_THICKNESS;

    if (position.y + radius > rampBottomY && position.y - radius < rampTopY) {
      return true;
    }
  }
  return false;
}

function getRampCollisionBoxes(ramps: Ramp[]): { position: number[]; size: number[] }[] {
  return ramps.map((ramp) => {
    const [rx, ry, rz] = ramp.position;
    const alignedToX = Math.abs(Math.cos(ramp.rotation)) >= Math.abs(Math.sin(ramp.rotation));
    const footprintX = alignedToX ? ramp.width : ramp.length;
    const footprintZ = alignedToX ? ramp.length : ramp.width;

    return {
      position: [rx, ry + 0.5, rz],
      size: [footprintX + 0.5, RAMP_HEIGHT_GAIN + 1.5, footprintZ + 0.5],
    };
  });
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
      { position: [-20, 1, -6], rotation: 0, width: 4, length: 10 },
      { position: [20, 1, 6], rotation: Math.PI, width: 4, length: 10 },
      { position: [0, 1, -22], rotation: Math.PI / 2, width: 4, length: 8 },
      { position: [0, 1, 22], rotation: -Math.PI / 2, width: 4, length: 8 },
    ];
  } else if (level === 5) {
    return [
      { position: [-24, 1, 0], rotation: 0, width: 4, length: 10 },
      { position: [24, 1, 0], rotation: Math.PI, width: 4, length: 10 },
      { position: [0, 1, -24], rotation: Math.PI / 2, width: 4, length: 10 },
      { position: [0, 1, 24], rotation: -Math.PI / 2, width: 4, length: 10 },
      { position: [0, 1, 0], rotation: 0, width: 5, length: 12 },
    ];
  } else if (level === 6) {
    return [
      // Keep ramps in open lanes so they never clip through wall geometry
      { position: [0, 1, -14], rotation: 0, width: 4, length: 10 },
      { position: [0, 1, 14], rotation: Math.PI, width: 4, length: 10 },
      { position: [-14, 1, 0], rotation: Math.PI / 2, width: 4, length: 10 },
      { position: [14, 1, 0], rotation: -Math.PI / 2, width: 4, length: 10 },
    ];
  } else if (level === 7) {
    return [
      // Reactor access ramps from each cardinal side into the core lanes
      { position: [0, 1, -22], rotation: 0, width: 5, length: 12 },
      { position: [0, 1, 22], rotation: Math.PI, width: 5, length: 12 },
      { position: [-22, 1, 0], rotation: Math.PI / 2, width: 5, length: 12 },
      { position: [22, 1, 0], rotation: -Math.PI / 2, width: 5, length: 12 },
    ];
  }
  return [];
}

const MAX_ACTIVE_SUPPLY_CRATES = 2;
const SUPPLY_CRATE_SPAWN_INTERVAL_MS = 15_000;
const MAX_ACTIVE_AMMO_CRATES = 2;
const AMMO_CRATE_SPAWN_INTERVAL_MS = 10_000;
const AMMO_CRATE_RESERVE_REWARD_RATIO = 0.35;

function getPickupSpawnPositionsForLevel(
  level: number,
): Array<[number, number, number]> {
  const byLevel: Record<number, Array<[number, number, number]>> = {
    0: [
      [-18, 1, -18],
      [18, 1, 18],
      [0, 1, 20],
    ],
    1: [
      [-20, 1, 22],
      [20, 1, -22],
      [0, 1, -24],
    ],
    2: [
      [-22, 1, 0],
      [22, 1, 0],
      [0, 1, 24],
    ],
    3: [
      [-24, 1, -24],
      [24, 1, 24],
      [0, 1, 0],
    ],
    4: [
      [-24, 1, 24],
      [24, 1, -24],
      [0, 1, -24],
    ],
    5: [
      [-22, 1, 22],
      [22, 1, 22],
      [0, 1, -22],
    ],
    6: [
      [-20, 1, -20],
      [20, 1, 20],
      [0, 1, 24],
    ],
    7: [
      [-40, 1, -40],
      [40, 1, 40],
      [0, 1, 0],
    ],
  };

  return byLevel[level] ?? byLevel[0];
}

function createSupplyCrate(level: number, position: [number, number, number]): MapPickup {
  return {
    id: `pickup_${level}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    position,
    type: "supplyCrate",
    healthRestore: 25,
    coinReward: 2,
    ammoReward: 0,
    grenadeReward: 0,
  };
}

function createAmmoCrate(level: number, position: [number, number, number]): MapPickup {
  return {
    id: `ammo_pickup_${level}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    position,
    type: "ammoCrate",
    healthRestore: 0,
    coinReward: 0,
    ammoReward: AMMO_CRATE_RESERVE_REWARD_RATIO,
    grenadeReward: 1,
  };
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
      { position: [0, 5, 0], size: [1, 10, 42] },
      { position: [0, 5, 14], size: [22, 10, 1] },
      { position: [0, 5, -14], size: [22, 10, 1] },
      { position: [18, 5, 8], size: [10, 10, 1] },
      { position: [-18, 5, -8], size: [10, 10, 1] },
      { position: [12, 5, -20], size: [1, 10, 12] },
      { position: [-12, 5, 20], size: [1, 10, 12] },
    ];
  } else if (level === 5) {
    return [
      { position: [30, 5, 0], size: [1, 10, 60] },
      { position: [-30, 5, 0], size: [1, 10, 60] },
      { position: [0, 5, 30], size: [60, 10, 1] },
      { position: [0, 5, -30], size: [60, 10, 1] },
      { position: [0, 5, 0], size: [48, 10, 1] },
      { position: [0, 5, 0], size: [1, 10, 48] },
      { position: [15, 5, 15], size: [12, 10, 1] },
      { position: [-15, 5, -15], size: [12, 10, 1] },
      { position: [15, 5, -15], size: [1, 10, 12] },
      { position: [-15, 5, 15], size: [1, 10, 12] },
      { position: [0, 5, 20], size: [20, 10, 1] },
      { position: [0, 5, -20], size: [20, 10, 1] },
    ];
  } else if (level === 6) {
    return [
      { position: [30, 5, 0], size: [1, 10, 60] },
      { position: [-30, 5, 0], size: [1, 10, 60] },
      { position: [0, 5, 30], size: [60, 10, 1] },
      { position: [0, 5, -30], size: [60, 10, 1] },
      // Central block + corner cover, leaving clear approach lanes for ramps
      { position: [0, 5, 0], size: [10, 10, 10] },
      { position: [-18, 5, -18], size: [8, 10, 1] },
      { position: [18, 5, 18], size: [8, 10, 1] },
      { position: [-18, 5, 18], size: [1, 10, 8] },
      { position: [18, 5, -18], size: [1, 10, 8] },
    ];
  } else if (level === 7) {
    return [
      // Large reactor perimeter
      { position: [85, 6, 0], size: [2, 12, 170] },
      { position: [-85, 6, 0], size: [2, 12, 170] },
      { position: [0, 6, 85], size: [170, 12, 2] },
      { position: [0, 6, -85], size: [170, 12, 2] },
      // Inner ring with four wide openings so the player can always reach the center
      { position: [0, 5, -30], size: [50, 10, 2] },
      { position: [0, 5, 30], size: [50, 10, 2] },
      { position: [-30, 5, 0], size: [2, 10, 50] },
      { position: [30, 5, 0], size: [2, 10, 50] },
      // Core hazard shell (not fully sealed)
      { position: [0, 5, -10], size: [18, 10, 2] },
      { position: [0, 5, 10], size: [18, 10, 2] },
      { position: [-10, 5, 0], size: [2, 10, 18] },
      { position: [10, 5, 0], size: [2, 10, 18] },
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
        <planeGeometry
          args={
            gameState.level.currentLevel === 7 ? [180, 180] : [100, 100]
          }
        />
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
          rotation={[getRampSlopeRotationX(ramp), ramp.rotation, 0]}
        >
          <boxGeometry args={[ramp.width, 0.5, ramp.length]} />
          <meshLambertMaterial map={asphaltTexture} color="#666666" />
        </mesh>
      ))}

      {/* Central platform */}
      {gameState.level.currentLevel !== 7 && (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[8, 1, 8]} />
          <meshLambertMaterial map={asphaltTexture} />
        </mesh>
      )}

      {/* Pickups (health/coin supply crates + ammo crates) */}
      {gameState.pickups.map((pickup) => (
        <PickupCrate key={pickup.id} pickup={pickup} />
      ))}
    </>
  );
}

function PickupCrate({ pickup }: { pickup: MapPickup }) {
  const crateRef = useRef<THREE.Group>(null);
  const isAmmoCrate = pickup.type === "ammoCrate";

  useFrame((state) => {
    if (!crateRef.current) return;
    crateRef.current.rotation.y += 0.02;
    crateRef.current.position.y =
      pickup.position[1] + Math.sin(state.clock.elapsedTime * 2.2) * 0.2;
  });

  return (
    <group ref={crateRef} position={pickup.position}>
      <mesh>
        <boxGeometry args={[1.2, 1.2, 1.2]} />
        <meshStandardMaterial
          color={isAmmoCrate ? "#2f95ff" : "#17d46a"}
          emissive={isAmmoCrate ? "#11487d" : "#0a6833"}
          emissiveIntensity={0.75}
        />
      </mesh>
      <mesh position={[0, 0, 0.61]}>
        <boxGeometry args={[0.75, 0.16, 0.08]} />
        <meshStandardMaterial color={isAmmoCrate ? "#ffd24a" : "#ffffff"} />
      </mesh>
      {isAmmoCrate ? (
        <>
          <mesh position={[0, 0.18, 0.61]}>
            <boxGeometry args={[0.2, 0.16, 0.08]} />
            <meshStandardMaterial color="#ffd24a" />
          </mesh>
          <mesh position={[0, -0.18, 0.61]}>
            <boxGeometry args={[0.2, 0.16, 0.08]} />
            <meshStandardMaterial color="#ffd24a" />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 0, 0.61]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.7, 0.18, 0.08]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      )}
    </group>
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
  const weaponAmmo = useRef<Record<number, number>>(getFullMagazineByWeapon());
  const weaponReserveAmmo = useRef<Record<number, number>>(getFullReserveByWeapon());
  const gameStateRef = useRef(gameState);
  const grenadeChargeStartRef = useRef<number | null>(null);
  const grenadeKeyHeldRef = useRef(false);

  // Keep gameStateRef in sync
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Reset player position when level changes to prevent getting stuck in walls
  useEffect(() => {
    if (playerRef.current) {
      weaponAmmo.current = getFullMagazineByWeapon();
      weaponReserveAmmo.current = getFullReserveByWeapon();

      // Level-specific safe spawn points
      const spawnPoints: Record<number, [number, number, number]> = {
        0: [0, 1, 0], // Level 1: Center is safe
        1: [0, 1, -15], // Level 2 (Robot Factory): Spawn away from center wall
        2: [0, 1, 20], // Level 3 (Palace): Spawn in safe area
        3: [-10, 1, -10], // Level 4 (Crimson Battlefield): Spawn in corner
        4: [0, 1, -22], // Level 5 (Mustard Mountain): open lane spawn
        5: [-22, 1, 22], // Level 6 (Shattered Skybridge): corner spawn
        6: [0, 1, 24], // Level 7 (Core Meltdown): outer ring spawn
        7: [0, 1, 60], // Level 8 (Boss Arena): distant start
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
          const semiAutoInterval = Math.max(
            40,
            100 - currentState.augmentLevels.weaponFireRate * 6,
          );
          if (now - currentState.lastShotTime >= semiAutoInterval) {
            // Minimum delay for semi-auto
            // Shoot bullet(s)
            const baseDirection = new THREE.Vector3(
              -Math.sin(rotationRef.current.y),
              Math.sin(rotationRef.current.x),
              -Math.cos(rotationRef.current.y),
            ).normalize();

            const bulletPos = camera.position
              .clone()
              .add(baseDirection.clone().multiplyScalar(1));

            // Update weapon ammo ref
            weaponAmmo.current[currentState.currentWeapon] =
              currentState.ammo - 1;

            // Create bullets - multiple for shotgun-type weapons
            const newBullets: Array<{
              id: string;
              position: [number, number, number];
              direction: [number, number, number];
              damage: number;
              burnDamagePerTick?: number;
              burnDurationMs?: number;
              burnTickMs?: number;
            }> = [];

            if (currentWeapon.pelletCount && currentWeapon.spreadAngle) {
              // Shotgun-type weapon: create multiple pellets in a cone
              const pelletCount = currentWeapon.pelletCount;
              const spreadControlMultiplier = Math.max(
                MIN_SPREAD_MULTIPLIER,
                1 - currentState.augmentLevels.weaponSpreadControl * 0.08,
              );
              const spreadAngleRad =
                ((currentWeapon.spreadAngle * spreadControlMultiplier) * Math.PI) / 180;

              for (let i = 0; i < pelletCount; i++) {
                // Random spread within cone
                const randomAngle = Math.random() * Math.PI * 2; // Random rotation around axis
                const randomSpread = (Math.random() * spreadAngleRad) / 2; // Random angle from center

                // Create spread direction using spherical coordinates
                const spreadDir = baseDirection.clone();

                // Create perpendicular vectors for spreading - use fallback up vector when looking near vertical
                let up = new THREE.Vector3(0, 1, 0);
                // If looking nearly straight up or down, use forward as the reference instead
                if (Math.abs(baseDirection.dot(up)) > 0.9) {
                  up = new THREE.Vector3(0, 0, 1);
                }
                const right = new THREE.Vector3()
                  .crossVectors(baseDirection, up)
                  .normalize();
                const trueUp = new THREE.Vector3()
                  .crossVectors(right, baseDirection)
                  .normalize();

                // Apply random spread
                const offsetX = Math.cos(randomAngle) * Math.sin(randomSpread);
                const offsetY = Math.sin(randomAngle) * Math.sin(randomSpread);

                spreadDir.add(right.clone().multiplyScalar(offsetX));
                spreadDir.add(trueUp.clone().multiplyScalar(offsetY));
                spreadDir.normalize();

                newBullets.push({
                  id: `bullet_${Date.now()}_${i}`,
                  position: [bulletPos.x, bulletPos.y, bulletPos.z],
                  direction: [spreadDir.x, spreadDir.y, spreadDir.z],
                  damage: currentWeapon.damage + gameStateRef.current.augmentLevels.weaponDamage * 5,
                  burnDamagePerTick: currentWeapon.burnDamagePerTick,
                  burnDurationMs: currentWeapon.burnDurationMs,
                  burnTickMs: currentWeapon.burnTickMs,
                });
              }
            } else {
              // Regular single bullet
              newBullets.push({
                id: `bullet_${Date.now()}`,
                position: [bulletPos.x, bulletPos.y, bulletPos.z],
                direction: [baseDirection.x, baseDirection.y, baseDirection.z],
                damage: currentWeapon.damage + gameStateRef.current.augmentLevels.weaponDamage * 5,
                burnDamagePerTick: currentWeapon.burnDamagePerTick,
                burnDurationMs: currentWeapon.burnDurationMs,
                burnTickMs: currentWeapon.burnTickMs,
              });
            }

            setGameState((prev) => ({
              ...prev,
              ammo: prev.ammo - 1,
              bullets: [...prev.bullets, ...newBullets],
              lastShotTime: now,
              sessionShotsFired: prev.sessionShotsFired + 1,
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || gameStateRef.current.gamePhase !== "playing") return;
      const grenadeBinding = useSettings.getState().keybindings.grenade?.[0] || "KeyQ";
      if (event.code !== grenadeBinding) return;
      if (gameStateRef.current.grenades <= 0) return;
      grenadeKeyHeldRef.current = true;
      grenadeChargeStartRef.current = performance.now();
      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const grenadeBinding = useSettings.getState().keybindings.grenade?.[0] || "KeyQ";
      if (event.code !== grenadeBinding) return;

      const chargeStart = grenadeChargeStartRef.current;
      grenadeKeyHeldRef.current = false;
      grenadeChargeStartRef.current = null;

      if (chargeStart === null || gameStateRef.current.gamePhase !== "playing") return;
      if (gameStateRef.current.grenades <= 0) return;

      const heldMs = performance.now() - chargeStart;
      const charge = Math.min(1, heldMs / GRENADE_MAX_CHARGE_MS);
      const throwSpeed =
        GRENADE_MIN_THROW_SPEED + (GRENADE_MAX_THROW_SPEED - GRENADE_MIN_THROW_SPEED) * charge;

      const aimDirection = new THREE.Vector3(
        -Math.sin(rotationRef.current.y) * Math.cos(rotationRef.current.x),
        Math.sin(rotationRef.current.x),
        -Math.cos(rotationRef.current.y) * Math.cos(rotationRef.current.x),
      ).normalize();
      const grenadeSpawnPos = camera.position.clone().add(aimDirection.clone().multiplyScalar(1.1));
      const grenadeVelocity = aimDirection.multiplyScalar(throwSpeed).add(new THREE.Vector3(0, 4, 0));

      setGameState((prev) => {
        if (prev.grenades <= 0 || prev.gamePhase !== "playing") return prev;
        return {
          ...prev,
          grenades: prev.grenades - 1,
          grenadeProjectiles: [
            ...prev.grenadeProjectiles,
            {
              id: `grenade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              position: [grenadeSpawnPos.x, grenadeSpawnPos.y, grenadeSpawnPos.z],
              velocity: [grenadeVelocity.x, grenadeVelocity.y, grenadeVelocity.z],
            },
          ],
        };
      });
      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
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
      const fireRateMultiplier =
        1 + gameState.augmentLevels.weaponFireRate * 0.08;
      const fireInterval = 1000 / (currentWeapon.fireRate * fireRateMultiplier);

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
              damage: currentWeapon.damage + gameState.augmentLevels.weaponDamage * 5,
              burnDamagePerTick: currentWeapon.burnDamagePerTick,
              burnDurationMs: currentWeapon.burnDurationMs,
              burnTickMs: currentWeapon.burnTickMs,
            },
          ],
          lastShotTime: now,
          sessionShotsFired: prev.sessionShotsFired + 1,
        }));

        console.log(`${currentWeapon.name} auto-firing!`);
      }
    }

    // Movement
    const moveSpeed = 10 + gameState.augmentLevels.userMoveSpeed * 0.8;
    const jumpSpeed = 12;

    if (
      gameState.augmentLevels.userRegen > 0 &&
      gameState.health < gameState.maxHealth
    ) {
      const regenPerSecond = gameState.augmentLevels.userRegen * 1.2;
      const regenAmount = regenPerSecond * deltaTime;
      setGameState((prev) => ({
        ...prev,
        health: Math.min(prev.maxHealth, prev.health + regenAmount),
      }));
    }

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
      const staticCollision = [...walls, ...getRampCollisionBoxes(ramps)];

      const hasWallCollision = checkWallCollision(newPos, staticCollision, 0.5);

      if (hasWallCollision) {
        // Collision detected, don't move in that direction
        // Try sliding along obstacles - check X and Z separately
        const xOnly = playerRef.current.position.clone();
        xOnly.x = newPos.x;
        const zOnly = playerRef.current.position.clone();
        zOnly.z = newPos.z;

        const canMoveX = !checkWallCollision(xOnly, staticCollision, 0.5);
        const canMoveZ = !checkWallCollision(zOnly, staticCollision, 0.5);

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

      const rampSurfaceY = ramps
        .map((ramp) => getRampSurfaceY(newPos, ramp))
        .filter((y): y is number => y !== null)
        .reduce<number | null>((highest, y) =>
          highest === null || y > highest ? y : highest,
        null);

      if (rampSurfaceY !== null) {
        const targetPlayerY = rampSurfaceY + 1;
        if (velocityRef.current.y <= 0 && newPos.y <= targetPlayerY + 0.2) {
          newPos.y = targetPlayerY;
          velocityRef.current.y = 0;
          isOnGroundRef.current = true;
        }
      }

      playerRef.current.position.copy(newPos);

      if (gameState.pickups.length > 0) {
        const collectedPickupIds = gameState.pickups
          .filter((pickup) => {
            const pickupPos = new THREE.Vector3(...pickup.position);
            return pickupPos.distanceTo(newPos) < 1.6;
          })
          .map((pickup) => pickup.id);

        if (collectedPickupIds.length > 0) {
          setGameState((prev) => {
            const collectedPickups = prev.pickups.filter((pickup) =>
              collectedPickupIds.includes(pickup.id),
            );
            if (collectedPickups.length === 0) return prev;

            const totalHealthRestore = collectedPickups
              .filter((pickup) => pickup.type === "supplyCrate")
              .reduce(
              (sum, pickup) => sum + pickup.healthRestore,
              0,
            );
            const totalCoinReward = collectedPickups
              .filter((pickup) => pickup.type === "supplyCrate")
              .reduce(
              (sum, pickup) => sum + pickup.coinReward,
              0,
            );
            const totalGrenadeReward = collectedPickups
              .filter((pickup) => pickup.type === "ammoCrate")
              .reduce((sum, pickup) => sum + pickup.grenadeReward, 0);

            const currentWeapon = prev.currentWeapon;
            const currentReserveAmmo = weaponReserveAmmo.current[currentWeapon] ?? prev.reserveAmmo;
            const reserveAmmoCap = weapons[currentWeapon].reserveAmmoCap;
            const totalAmmoReward = collectedPickups
              .filter((pickup) => pickup.type === "ammoCrate")
              .reduce((sum, pickup) => {
                const crateReward = Math.round(reserveAmmoCap * pickup.ammoReward);
                return sum + Math.max(1, crateReward);
              }, 0);
            const newReserveAmmo = Math.min(
              reserveAmmoCap,
              currentReserveAmmo + totalAmmoReward,
            );
            weaponReserveAmmo.current[currentWeapon] = newReserveAmmo;

            return {
              ...prev,
              pickups: prev.pickups.filter(
                (pickup) => !collectedPickupIds.includes(pickup.id),
              ),
              health: Math.min(prev.maxHealth, prev.health + totalHealthRestore),
              coins: prev.coins + totalCoinReward,
              reserveAmmo: newReserveAmmo,
              grenades: Math.min(prev.maxGrenades, prev.grenades + totalGrenadeReward),
            };
          });
        }
      }
    }

    // Weapon switching via loadout (keys 1-5 select tier, loadout determines weapon)
    // Default loadout if not set: T1=1, T2=2, T3=3, T4=4, T5=6
    const currentLoadout = gameState.loadout || { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6 };
    const switchToTier = (tier: number) => {
      const weaponId = currentLoadout[tier];
      if (
        weaponId &&
        gameState.currentWeapon !== weaponId &&
        gameState.unlockedWeapons.includes(weaponId)
      ) {
        weaponAmmo.current[gameState.currentWeapon] = gameState.ammo; // Save current ammo
        weaponReserveAmmo.current[gameState.currentWeapon] = gameState.reserveAmmo; // Save current reserve ammo
        // Ensure we have a valid ammo value for the new weapon
        const newAmmo =
          weaponAmmo.current[weaponId] !== undefined
            ? weaponAmmo.current[weaponId]
            : weapons[weaponId].maxAmmo;
        const newReserveAmmo =
          weaponReserveAmmo.current[weaponId] !== undefined
            ? weaponReserveAmmo.current[weaponId]
            : getStartingReserveAmmo(weaponId);
        setGameState((prev) => ({
          ...prev,
          currentWeapon: weaponId,
          ammo: newAmmo,
          reserveAmmo: newReserveAmmo,
          isReloading: false,
          reloadDuration: 0,
        }));
      }
    };

    if (keys.weapon1) switchToTier(1);
    if (keys.weapon2) switchToTier(2);
    if (keys.weapon3) switchToTier(3);
    if (keys.weapon4) switchToTier(4);
    if (keys.weapon5) switchToTier(5);

    // Reload
    const weapon = weapons[gameState.currentWeapon];
    if (
      keys.reload &&
      !gameState.isReloading &&
      gameState.ammo < weapon.maxAmmo &&
      gameState.reserveAmmo > 0
    ) {
      const shotsMissing = weapon.maxAmmo - gameState.ammo;
      const extraReloadTime =
        gameState.currentWeapon === 5
          ? Math.max(0, shotsMissing - 1) * 1000
          : 0;
      const reloadMultiplier = Math.max(
        MIN_RELOAD_MULTIPLIER,
        1 - gameState.augmentLevels.weaponReloadSpeed * 0.1,
      );

      setGameState((prev) => ({
        ...prev,
        isReloading: true,
        reloadStartTime: Date.now(),
        reloadDuration: (weapon.reloadTime + extraReloadTime) * reloadMultiplier,
      }));
    }

    // Check if reload is complete
    if (
      gameState.isReloading &&
      Date.now() - gameState.reloadStartTime >= gameState.reloadDuration
    ) {
      const shotsMissing = weapon.maxAmmo - gameState.ammo;
      const bulletsLoaded = Math.min(shotsMissing, gameState.reserveAmmo);
      const newAmmo = gameState.ammo + bulletsLoaded;
      const newReserveAmmo = gameState.reserveAmmo - bulletsLoaded;
      weaponAmmo.current[gameState.currentWeapon] = newAmmo; // Update ref
      weaponReserveAmmo.current[gameState.currentWeapon] = newReserveAmmo; // Update reserve ref
      setGameState((prev) => ({
        ...prev,
        isReloading: false,
        ammo: newAmmo,
        reserveAmmo: newReserveAmmo,
        reloadDuration: 0,
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
            bullet.position[0] + bullet.direction[0] * 120 * deltaTime,
            bullet.position[1] + bullet.direction[1] * 120 * deltaTime,
            bullet.position[2] + bullet.direction[2] * 120 * deltaTime,
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

    if (gameState.grenadeProjectiles.length > 0 || gameState.explosions.length > 0) {
      setGameState((prev) => {
        const gravity = 24;
        const impactDetonations: Array<{ position: [number, number, number] }> = [];

        const updatedGrenades = prev.grenadeProjectiles
          .map((grenade) => {
            const velocity = new THREE.Vector3(...grenade.velocity);
            velocity.y -= gravity * deltaTime;
            const position = new THREE.Vector3(...grenade.position).add(
              velocity.clone().multiplyScalar(deltaTime),
            );
            if (position.y <= 0.5) {
              impactDetonations.push({ position: [position.x, 0.5, position.z] });
              return null;
            }
            return {
              ...grenade,
              position: [position.x, position.y, position.z] as [number, number, number],
              velocity: [velocity.x, velocity.y, velocity.z] as [number, number, number],
            };
          })
          .filter((grenade): grenade is NonNullable<typeof grenade> => grenade !== null);

        const activeExplosions = prev.explosions.filter(
          (exp) => Date.now() - exp.startTime < exp.duration,
        );
        const spawnedExplosions = impactDetonations.map((det) => ({
          id: `explosion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          position: det.position,
          startTime: Date.now(),
          duration: 450,
          radius: GRENADE_SPLASH_RADIUS,
        }));

        let nextState: GameState = {
          ...prev,
          grenadeProjectiles: updatedGrenades,
          explosions: [...activeExplosions, ...spawnedExplosions],
        };

        if (spawnedExplosions.length > 0 && prev.enemies.length > 0) {
          const enemies = prev.enemies.map((enemy) => ({ ...enemy }));
          let killsFromGrenade = 0;

          spawnedExplosions.forEach((exp) => {
            const center = new THREE.Vector3(...exp.position);
            enemies.forEach((enemy) => {
              if (enemy.health <= 0) return;
              const distance = new THREE.Vector3(...enemy.position).distanceTo(center);
              if (distance > exp.radius) return;
              const damageFalloff = 1 - distance / exp.radius;
              const damage = GRENADE_BASE_DAMAGE * Math.max(0.35, damageFalloff);
              const newHealth = enemy.health - damage;
              if (enemy.health > 0 && newHealth <= 0) {
                killsFromGrenade += 1;
              }
              enemy.health = newHealth;
            });
          });

          nextState = {
            ...nextState,
            enemies: enemies.filter((enemy) => enemy.health > 0),
          };
          nextState = applyKillProgress(nextState, killsFromGrenade);
        }

        return nextState;
      });
    }
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
function RobotMeleeSprite({ size }: { size: number }) {
  const robotTexture = useTexture("/textures/robot_melee.jpg");
  return (
    <mesh>
      <planeGeometry args={[1.1 * size, 1.9 * size]} />
      <meshBasicMaterial
        map={robotTexture}
        side={THREE.DoubleSide}
        transparent
        alphaTest={0.05}
      />
    </mesh>
  );
}

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
  const difficulty = DIFFICULTY_SETTINGS[gameState.difficulty];
  const enemyMoveSpeed =
    archetype.moveSpeed * difficulty.enemyMoveSpeedMultiplier;
  const enemyDamage = archetype.damage * difficulty.enemyDamageMultiplier;
  const enemyAttackInterval = Math.max(
    120,
    archetype.attackInterval / difficulty.enemyAttackSpeedMultiplier,
  );
  const BOSS_BEAM_COOLDOWN_MS = 5000;
  const BOSS_BEAM_DURATION_MS = 2200;
  const BOSS_BEAM_TURN_SPEED = 1.75; // Radians/sec; intentionally slower than player strafe speed
  const BOSS_BEAM_DAMAGE_TICK_MS = 200;
  const BOSS_BEAM_DAMAGE_PER_TICK = Math.max(1, enemyDamage * 0.085);
  const BOSS_BEAM_RANGE = 30;

  useFrame((state, deltaTime) => {
    // Only update during gameplay
    if (gameState.gamePhase !== "playing") return;

    // Billboard effect - make enemy always face the camera but stay upright
    if (enemyRef.current) {
      const enemyPos = new THREE.Vector3(...enemy.position);
      // AI Movement - different behavior for melee vs ranged
      const playerPos = camera.position.clone();
      const toPlayerDirection = new THREE.Vector3().subVectors(
        playerPos,
        enemyPos,
      );
      toPlayerDirection.y = 0; // Keep movement on horizontal plane
      const distanceToPlayer = toPlayerDirection.length();
      const normalizedDirection =
        distanceToPlayer > 0
          ? toPlayerDirection.clone().divideScalar(distanceToPlayer)
          : new THREE.Vector3(0, 0, 0);
      const behavior = enemy.behavior ?? ENEMY_BEHAVIOR_BY_TYPE[enemy.type];
      const activePatternStep =
        enemy.type === "flyingHybrid" ? (enemy.attackPatternStep ?? "volley") : undefined;
      const movementBehavior =
        enemy.type === "flyingHybrid"
          ? activePatternStep === "melee"
            ? "chase"
            : "kite"
          : behavior;
      const currentTime = Date.now();
      const bossBeamActive =
        enemy.type === "boss" &&
        typeof enemy.bossBeamEndsAt === "number" &&
        currentTime < enemy.bossBeamEndsAt;

      if (
        (enemy.burningUntil ?? 0) > currentTime &&
        currentTime >= (enemy.nextBurnTickAt ?? 0) &&
        (enemy.burnDamagePerTick ?? 0) > 0
      ) {
        setGameState((prev) => ({
          ...prev,
          enemies: prev.enemies
            .map((e) =>
              e.id === enemy.id
                ? {
                    ...e,
                    health: e.health - (e.burnDamagePerTick ?? 0),
                    nextBurnTickAt: currentTime + (e.burnTickMs ?? 400),
                  }
                : e,
            )
            .filter((e) => e.health > 0),
        }));
      }

      const currentFacingDirection = new THREE.Vector3(
        enemy.movementDirection[0],
        enemy.movementDirection[1],
        enemy.movementDirection[2],
      ).normalize();
      const safeFacingDirection =
        currentFacingDirection.lengthSq() > 0.0001
          ? currentFacingDirection
          : normalizedDirection.clone();
      const desiredFacingDirection =
        enemy.type === "boss" ? normalizedDirection : safeFacingDirection;
      const bossTurnAlpha = Math.min(1, BOSS_BEAM_TURN_SPEED * deltaTime);
      const updatedFacingDirection =
        enemy.type === "boss"
          ? safeFacingDirection.lerp(desiredFacingDirection, bossTurnAlpha).normalize()
          : desiredFacingDirection;

      if (enemy.type === "boss") {
        const lookTarget = enemyPos.clone().add(updatedFacingDirection);
        enemyRef.current.lookAt(lookTarget);
      } else {
        const cameraPos = camera.position.clone();
        cameraPos.y = enemyPos.y; // Keep same Y level to prevent tilting
        enemyRef.current.lookAt(cameraPos);
      }

      const movementIntent = getEnemyMovementIntent(
        movementBehavior,
        normalizedDirection,
        distanceToPlayer,
        bossBeamActive ? 0 : enemyMoveSpeed,
        deltaTime,
      );

      const walls = getWallsForLevel(gameState.level.currentLevel);
      const ramps = getRampsForLevel(gameState.level.currentLevel);
      const staticObstacles = [...walls, ...getRampCollisionBoxes(ramps)];
      const { resolvedPos, appliedMovement } = resolveMovementWithFallback(
        enemyPos,
        movementIntent,
        staticObstacles,
        0.4,
      );
      const isMoving = appliedMovement.lengthSq() > 0.0001;
      const movementDirection = isMoving
        ? appliedMovement.clone().normalize()
        : updatedFacingDirection;

      // Update enemy position in game state
      setGameState((prev) => ({
        ...prev,
        enemies: prev.enemies.map((e) =>
          e.id === enemy.id
            ? {
                ...e,
                position: [resolvedPos.x, resolvedPos.y, resolvedPos.z] as [
                  number,
                  number,
                  number,
                ],
                behavior: movementBehavior,
                isMoving,
                movementDirection: [
                  movementDirection.x,
                  movementDirection.y,
                  movementDirection.z,
                ],
                bossBeamEndsAt:
                  enemy.type === "boss" ? (enemy.bossBeamEndsAt ?? 0) : undefined,
                bossLastBeamDamageAt:
                  enemy.type === "boss"
                    ? (enemy.bossLastBeamDamageAt ?? 0)
                    : undefined,
                attackPatternStep:
                  enemy.type === "flyingHybrid"
                    ? (enemy.attackPatternStep ?? "volley")
                    : undefined,
              }
            : e,
        ),
      }));

      // Attack logic
      setIsAttacking(distanceToPlayer < 2.5);

      if (enemy.type === "melee" || enemy.type === "giant" || enemy.type === "rat") {
        // Melee, Giant, and Rat: Contact damage
        if (distanceToPlayer < 1.5 && gameState.gamePhase === "playing") {
          setGameState((prev) => {
            if (
              currentTime - prev.lastDamageTime > enemyAttackInterval &&
              prev.gamePhase === "playing"
            ) {
              const damageReduction = Math.min(
                MAX_DAMAGE_RESISTANCE,
                prev.augmentLevels.userDamageResist * 0.06,
              );
              const reducedDamage = enemyDamage * (1 - damageReduction);
              const newHealth = Math.max(0, prev.health - reducedDamage);
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
      } else if (enemy.type === "boss") {
        // Boss: periodic tracking beam attack, boss pauses while channeling.
        if (!bossBeamActive && currentTime >= enemy.nextAttackAt) {
          setGameState((prev) => ({
            ...prev,
            enemies: prev.enemies.map((e) =>
              e.id === enemy.id
                ? {
                    ...e,
                    nextAttackAt: currentTime + BOSS_BEAM_COOLDOWN_MS,
                    bossBeamEndsAt: currentTime + BOSS_BEAM_DURATION_MS,
                  }
                : e,
            ),
          }));
        }

        if (bossBeamActive && distanceToPlayer <= BOSS_BEAM_RANGE) {
          const playerDirection = toPlayerDirection.clone().normalize();
          const beamDot = updatedFacingDirection.dot(playerDirection);
          const beamHitsPlayer = beamDot > 0.985;

          if (beamHitsPlayer && currentTime - (enemy.bossLastBeamDamageAt ?? 0) >= BOSS_BEAM_DAMAGE_TICK_MS) {
            setGameState((prev) => {
              if (prev.gamePhase !== "playing") return prev;

              const damageReduction = Math.min(
                MAX_DAMAGE_RESISTANCE,
                prev.augmentLevels.userDamageResist * 0.06,
              );
              const reducedDamage = BOSS_BEAM_DAMAGE_PER_TICK * (1 - damageReduction);
              const newHealth = Math.max(0, prev.health - reducedDamage);

              return {
                ...prev,
                health: newHealth,
                lastDamageTime: currentTime,
                gamePhase: newHealth <= 0 ? "gameover" : prev.gamePhase,
                enemies: prev.enemies.map((e) =>
                  e.id === enemy.id ? { ...e, bossLastBeamDamageAt: currentTime } : e,
                ),
              };
            });
          }
        }
      } else if (enemy.type === "ranged") {
        // Ranged: Shoot projectiles
        if (currentTime >= enemy.nextAttackAt && distanceToPlayer < 20) {
          // Spawn enemy projectile
          const projectileDir = normalizedDirection.clone();
          setGameState((prev) => ({
            ...prev,
            enemies: prev.enemies.map((e) =>
              e.id === enemy.id
                ? { ...e, nextAttackAt: currentTime + enemyAttackInterval }
                : e,
            ),
            enemyProjectiles: [
              ...prev.enemyProjectiles,
              {
                id: `enemyproj_${Date.now()}_${Math.random()}`,
                position: [enemyPos.x, enemyPos.y + 1, enemyPos.z],
                direction: [projectileDir.x, projectileDir.y, projectileDir.z],
                damage: enemyDamage,
              },
            ],
          }));
        }
      } else if (enemy.type === "flyingHybrid") {
        if (activePatternStep === "volley" && currentTime >= enemy.nextAttackAt && distanceToPlayer < 20) {
          const projectileOrigin: [number, number, number] = [enemyPos.x, enemyPos.y + 0.4, enemyPos.z];
          const shotAngles = [-0.14, 0, 0.14];
          const volleyProjectiles = shotAngles.map((angleOffset) => {
            const shotDirection = normalizedDirection
              .clone()
              .applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset)
              .normalize();

            return {
              id: `enemyproj_${Date.now()}_${Math.random()}`,
              position: projectileOrigin,
              direction: [shotDirection.x, shotDirection.y, shotDirection.z] as [
                number,
                number,
                number,
              ],
              damage: enemyDamage,
            };
          });

          setGameState((prev) => ({
            ...prev,
            enemies: prev.enemies.map((e) =>
              e.id === enemy.id
                ? {
                    ...e,
                    attackPatternStep: "melee",
                    behavior: "chase",
                    nextAttackAt: currentTime + enemyAttackInterval * 0.75,
                  }
                : e,
            ),
            enemyProjectiles: [...prev.enemyProjectiles, ...volleyProjectiles],
          }));
        } else if (activePatternStep === "melee") {
          if (distanceToPlayer < 1.8 && currentTime >= enemy.nextAttackAt) {
            setGameState((prev) => {
              if (prev.gamePhase !== "playing") return prev;

              const damageReduction = Math.min(
                MAX_DAMAGE_RESISTANCE,
                prev.augmentLevels.userDamageResist * 0.06,
              );
              const reducedDamage = enemyDamage * (1 - damageReduction);
              const newHealth = Math.max(0, prev.health - reducedDamage);

              return {
                ...prev,
                health: newHealth,
                lastDamageTime: currentTime,
                gamePhase: newHealth <= 0 ? "gameover" : prev.gamePhase,
                enemies: prev.enemies.map((e) =>
                  e.id === enemy.id
                    ? {
                        ...e,
                        attackPatternStep: "volley",
                        behavior: "kite",
                        nextAttackAt: currentTime + enemyAttackInterval,
                      }
                    : e,
                ),
              };
            });
          }
        }
      }
    }

    // Check bullet collisions
    gameState.bullets.forEach((bullet) => {
      const bulletPos = new THREE.Vector3(...bullet.position);
      const enemyPos = new THREE.Vector3(...enemy.position);

      const hitRadius = Math.max(0.9, 0.7 * (archetype.size || 1));
      if (bulletPos.distanceTo(enemyPos) < hitRadius) {
        // Hit enemy
        setGameState((prev) => {
          // Find current enemy health from state (not closure) to handle multiple pellet hits
          const currentEnemy = prev.enemies.find((e) => e.id === enemy.id);
          if (!currentEnemy) return prev; // Enemy already dead/removed

          const enemyKilled =
            currentEnemy.health > 0 && currentEnemy.health - bullet.damage <= 0;
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

          // Check victory condition - completed final level (story mode only)
          const completedFinalLevel = shouldLevelUp && !hasNextLevel;
          const isEndless = prev.gameMode === "endless";

          // Determine next game phase
          let nextPhase = prev.gamePhase;
          if (completedFinalLevel && !isEndless) {
            nextPhase = "victory";
          } else if (completedFinalLevel && isEndless) {
            // In endless mode, loop kills at max difficulty — no victory
            nextPhase = prev.gamePhase;
          } else if (shouldLevelUp && hasNextLevel) {
            nextPhase = "levelTransition";
          }

          return {
            ...prev,
            bullets: prev.bullets.filter((b) => b.id !== bullet.id),
            enemies: prev.enemies
              .map((e) =>
                e.id === enemy.id
                  ? {
                      ...e,
                      health: e.health - bullet.damage,
                      burningUntil:
                        bullet.burnDamagePerTick && bullet.burnDurationMs
                          ? Date.now() + bullet.burnDurationMs
                          : e.burningUntil,
                      nextBurnTickAt:
                        bullet.burnDamagePerTick && bullet.burnTickMs
                          ? Date.now() + bullet.burnTickMs
                          : e.nextBurnTickAt,
                      burnDamagePerTick:
                        bullet.burnDamagePerTick ?? e.burnDamagePerTick,
                      burnTickMs: bullet.burnTickMs ?? e.burnTickMs,
                    }
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
              killsThisLevel:
                completedFinalLevel && isEndless ? 0 : newLevelKills,
              giantsSpawnedThisLevel: prev.level.giantsSpawnedThisLevel,
            },
            gamePhase: nextPhase,
            sessionShotsHit: prev.sessionShotsHit + 1,
          };
        });
      }
    });
  });

  const enemySize = archetype.size || 1;
  const healthBarYPosition = enemySize > 1 ? 3 : 2;
  const bossBeamActive =
    enemy.type === "boss" &&
    typeof enemy.bossBeamEndsAt === "number" &&
    Date.now() < enemy.bossBeamEndsAt;
  const beamLength = 30;

  return (
    <group ref={enemyRef} position={enemy.position}>
      {/* Melee enemies use robot sprite; others keep the colored cube */}
      {enemy.type === "melee" ? (
        <Suspense
          fallback={
            <mesh>
              <boxGeometry
                args={[0.8 * enemySize, 1.5 * enemySize, 0.8 * enemySize]}
              />
              <meshStandardMaterial color={archetype.color} />
            </mesh>
          }
        >
          <RobotMeleeSprite size={enemySize} />
        </Suspense>
      ) : enemy.type === "flyingHybrid" ? (
        <group>
          <mesh>
            <sphereGeometry args={[0.45 * enemySize, 16, 16]} />
            <meshStandardMaterial color={archetype.color} emissive="#147c99" emissiveIntensity={0.45} />
          </mesh>
          <mesh position={[0.58 * enemySize, 0, 0]}>
            <boxGeometry args={[0.65 * enemySize, 0.08 * enemySize, 0.22 * enemySize]} />
            <meshStandardMaterial color="#9ceaff" />
          </mesh>
          <mesh position={[-0.58 * enemySize, 0, 0]}>
            <boxGeometry args={[0.65 * enemySize, 0.08 * enemySize, 0.22 * enemySize]} />
            <meshStandardMaterial color="#9ceaff" />
          </mesh>
        </group>
      ) : (
        <mesh>
          <boxGeometry
            args={[0.8 * enemySize, 1.5 * enemySize, 0.8 * enemySize]}
          />
          <meshStandardMaterial color={archetype.color} />
        </mesh>
      )}
      {/* Health bar above enemy */}
      <mesh position={[0, healthBarYPosition, 0]}>
        <planeGeometry args={[1 * enemySize, 0.1]} />
        <meshBasicMaterial
          color={enemy.health > archetype.health / 2 ? "#00ff00" : "#ff0000"}
          opacity={0.8}
          transparent
        />
      </mesh>
      {bossBeamActive && (
        <group position={[0, enemySize * 0.2, 0]}>
          <mesh position={[0, 0, beamLength / 2]}>
            <boxGeometry args={[0.16, 0.16, beamLength]} />
            <meshBasicMaterial color="#d956ff" transparent opacity={0.78} />
          </mesh>
          <pointLight
            color="#d956ff"
            intensity={1.5}
            distance={10}
            position={[0, 0, enemySize]}
          />
        </group>
      )}
    </group>
  );
}

// Bullet Component with comet tail effect
function Bullet({
  bullet,
}: {
  bullet: {
    id: string;
    position: [number, number, number];
    direction: [number, number, number];
  };
}) {
  const tailLength = 5;
  const tailSegments = useMemo(() => {
    const segments = [];
    for (let i = 0; i < tailLength; i++) {
      const t = i / tailLength;
      segments.push({
        offset: t * 0.4,
        scale: 1 - t * 0.7,
        opacity: 1 - t * 0.8,
      });
    }
    return segments;
  }, []);

  return (
    <group position={bullet.position}>
      {/* Main bullet - small white orb */}
      <mesh>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* Comet tail - fading trail segments */}
      {tailSegments.map((seg, i) => (
        <mesh
          key={i}
          position={[
            -bullet.direction[0] * seg.offset,
            -bullet.direction[1] * seg.offset,
            -bullet.direction[2] * seg.offset,
          ]}
        >
          <sphereGeometry args={[0.05 * seg.scale, 6, 6]} />
          <meshBasicMaterial
            color="#ffeecc"
            transparent
            opacity={seg.opacity * 0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

function GrenadeProjectile({
  grenade,
}: {
  grenade: {
    id: string;
    position: [number, number, number];
  };
}) {
  return (
    <group position={grenade.position}>
      <mesh>
        <boxGeometry args={[0.34, 0.34, 0.34]} />
        <meshStandardMaterial color="#4e6a77" metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color="#d9b74f" />
      </mesh>
    </group>
  );
}

function ExplosionEffect({
  explosion,
}: {
  explosion: {
    id: string;
    position: [number, number, number];
    startTime: number;
    duration: number;
    radius: number;
  };
}) {
  const elapsed = Date.now() - explosion.startTime;
  const progress = Math.min(1, elapsed / explosion.duration);
  const visualRadius = explosion.radius * (0.2 + progress * 0.8);
  const opacity = 1 - progress;

  return (
    <group position={explosion.position}>
      <mesh>
        <sphereGeometry args={[visualRadius, 20, 20]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={opacity * 0.35} />
      </mesh>
      <mesh>
        <sphereGeometry args={[visualRadius * 0.55, 16, 16]} />
        <meshBasicMaterial color="#ff6f3c" transparent opacity={opacity * 0.45} />
      </mesh>
    </group>
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
    const ramps = getRampsForLevel(gameState.level.currentLevel);
    if (checkWallCollision(newPos, walls, 0.3) || checkRampCollision(newPos, ramps, 0.3)) {
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
        const damageReduction = Math.min(
          MAX_DAMAGE_RESISTANCE,
          prev.augmentLevels.userDamageResist * 0.06,
        );
        const reducedDamage = projectile.damage * (1 - damageReduction);
        const newHealth = Math.max(0, prev.health - reducedDamage);
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

  // Skin color mappings for each weapon type
  const skinColors: Record<number, Record<string, string>> = {
    1: {
      // Pistol skins
      Default: "#888888",
      "Gold Plated": "#FFD700",
      "Neon Green": "#39FF14",
      "Shadow Black": "#1a1a1a",
    },
    2: {
      // Rifle skins
      Default: "#654321",
      "Desert Camo": "#C2B280",
      "Arctic White": "#F0F0F0",
      "Blood Red": "#8B0000",
    },
    3: {
      // Sniper skins
      Default: "#2e2e2e",
      Ghillie: "#355E3B",
      Chrome: "#C0C0C0",
      Midnight: "#191970",
    },
    4: {
      // Plasma/LMG skins
      Default: "#1a1a1a",
      "Electric Blue": "#00BFFF",
      Magma: "#FF4500",
      "Void Purple": "#8B008B",
    },
    6: {
      // Flamethrower skins
      Default: "#cc4b00",
      "Ember Orange": "#ff6a00",
      "Ash Gray": "#6e6e6e",
      "Inferno Gold": "#ffb000",
    },
  };

  // Get weapon color based on equipped skin from gameState
  const getWeaponColor = (weaponNum: number) => {
    const equippedSkin =
      gameState.equippedWeaponSkins?.[weaponNum] || "Default";
    const weaponSkins = skinColors[weaponNum] || skinColors[1];
    return weaponSkins[equippedSkin] || weaponSkins["Default"];
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
      case 6:
        return [0.55, 1.15]; // Flamethrower body
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

const INTRO_SCENES = [
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

// Intro Cutscene Component
function IntroCutscene({
  setGameState,
}: {
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const [currentScene, setCurrentScene] = useState(0);

  useEffect(() => {
    if (currentScene < INTRO_SCENES.length - 1) {
      const timer = setTimeout(() => {
        setCurrentScene(currentScene + 1);
      }, INTRO_SCENES[currentScene].duration);

      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setGameState((prev) => {
          // Check if admin has enabled full loadout
          const adminFullLoadout =
            localStorage.getItem("adminFullLoadout") === "true" && prev.isAdmin;
          const newUnlockedWeapons = adminFullLoadout
            ? [1, 2, 3, 4, 5, 6]
            : prev.unlockedWeapons;

          return {
            ...prev,
            gamePhase: "playing",
            unlockedWeapons: newUnlockedWeapons,
            gameStartTime: Date.now(),
            sessionShotsFired: 0,
            sessionShotsHit: 0,
          };
        });
        document.body.requestPointerLock();
      }, INTRO_SCENES[currentScene].duration);

      return () => clearTimeout(timer);
    }
  }, [currentScene, setGameState]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "#0d0a05",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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
          {INTRO_SCENES[currentScene].text}
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
            {INTRO_SCENES.map((_, index) => (
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
            setGameState((prev) => {
              // Check if admin has enabled full loadout
              const adminFullLoadout =
                localStorage.getItem("adminFullLoadout") === "true" &&
                prev.isAdmin;
              const newUnlockedWeapons = adminFullLoadout
                ? [1, 2, 3, 4, 5, 6]
                : prev.unlockedWeapons;

              return {
                ...prev,
                gamePhase: "playing",
                unlockedWeapons: newUnlockedWeapons,
                gameStartTime: Date.now(),
                sessionShotsFired: 0,
                sessionShotsHit: 0,
              };
            });
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
            fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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
  const [showLoadoutPopup, setShowLoadoutPopup] = useState(false);
  const [loadout, setLoadout] = useState<Record<number, number>>(
    gameState.loadout || { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6 },
  );
  const [selectedCrosshair, setSelectedCrosshair] = useState(() => {
    const saved = localStorage.getItem("selectedCrosshairId");
    return saved ?? "classic-dot";
  });

  // Define available weapons with their skins
  // shopPrefix must match the weapon names stored in the database items table
  const allWeapons = [
    {
      id: 1,
      name: "Ketchup Squirter",
      shopPrefix: "Ketchup Squirter",
      skins: ["Default", "Gold Plated", "Neon Green", "Shadow Black"],
      tier: 1,
    },
    {
      id: 2,
      name: "Mustard Launcher",
      shopPrefix: "Mustard Launcher",
      skins: ["Default", "Desert Camo", "Arctic White", "Blood Moon"],
      tier: 2,
    },
    {
      id: 3,
      name: "Topping Shooter",
      shopPrefix: "Topping Shooter",
      skins: ["Default", "Ghillie", "Chrome", "Midnight"],
      tier: 3,
    },
    {
      id: 4,
      name: "Lacerating Muffin Generator",
      shopPrefix: "Lacerating Muffin Generator",
      skins: ["Default", "Electric Blue", "Magma", "Void Purple"],
      tier: 4,
    },
    {
      id: 5,
      name: "Spreadshot",
      shopPrefix: "Spreadshot",
      skins: ["Default", "Buckshot Blue", "Scatter Red", "Pellet Storm"],
      tier: 2,
    },
    {
      id: 6,
      name: "Flamethrower",
      shopPrefix: "Flamethrower",
      skins: ["Default", "Ember Orange", "Ash Gray", "Inferno Gold"],
      tier: 5,
    },
  ];

  // Track equipped skins per weapon - initialize from gameState
  const [weaponSkins, setWeaponSkins] = useState<Record<number, string>>(
    gameState.equippedWeaponSkins || {
      1: "Default",
      2: "Default",
      3: "Default",
      4: "Default",
      5: "Default",
      6: "Default",
    },
  );

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
        background: "#0d0a05",
        display: "flex",
        flexDirection: "column",
        color: "rgba(220,210,195,0.9)",
        fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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
          padding: "16px 24px",
          background: "rgba(18,12,5,0.95)",
          borderBottom: "1px solid rgba(232,160,32,0.25)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "11px",
              color: "#c8a84b",
              letterSpacing: "3px",
              textTransform: "uppercase",
            }}
          >
            DOG: The Hotdog Wars
          </div>
          <h1
            style={{
              fontSize: "26px",
              margin: "2px 0 0 0",
              fontWeight: "700",
              color: "#e8a020",
              letterSpacing: "3px",
              textTransform: "uppercase",
            }}
          >
            INVENTORY
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <span style={{ fontSize: "18px", color: "#fdc830" }}>
            {currency === 67 ? "∞" : currency} Gold
          </span>
          <button
            onClick={() => setShowLoadoutPopup(true)}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: "700",
              background: "rgba(232,160,32,0.9)",
              color: "#0d0a05",
              border: "none",
              cursor: "pointer",
              letterSpacing: "1px",
              textTransform: "uppercase" as const,
            }}
          >
            LOADOUT
          </button>
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

      {/* Loadout Popup */}
      {showLoadoutPopup && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 2000,
            padding: "20px 14px",
            overflowY: "auto",
          }}
          onClick={() => setShowLoadoutPopup(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(18,12,5,0.97)",
              padding: "30px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "calc(100vh - 40px)",
              overflowY: "auto",
              border: "1px solid rgba(232,160,32,0.35)",
            }}
          >
            <h2
              style={{
                margin: "0 0 20px 0",
                fontSize: "28px",
                textAlign: "center",
              }}
            >
              WEAPON LOADOUT
            </h2>
            <p
              style={{
                textAlign: "center",
                opacity: 0.9,
                marginBottom: "25px",
              }}
            >
              Press 1-5 in game to switch between tier weapons
            </p>

            {/* Tier Slots */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "15px" }}
            >
              {[1, 2, 3, 4, 5].map((tier) => {
                const tierWeapons = allWeapons.filter((w) => w.tier === tier);
                const equippedWeaponId = loadout[tier];
                const equippedWeapon = allWeapons.find(
                  (w) => w.id === equippedWeaponId,
                );

                return (
                  <div
                    key={tier}
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: "10px",
                      padding: "15px",
                      border: "2px solid rgba(255,255,255,0.3)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "10px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: "bold",
                          color: "#FFC107",
                        }}
                      >
                        TIER {tier} (Key: {tier})
                      </span>
                      {tierWeapons.length > 1 && (
                        <span style={{ fontSize: "12px", opacity: 0.7 }}>
                          {tierWeapons.length} weapons available
                        </span>
                      )}
                    </div>

                    {tierWeapons.length === 1 ? (
                      // Single weapon tier - just display it
                      <div
                        style={{
                          padding: "12px",
                          background: "rgba(76, 175, 80, 0.3)",
                          borderRadius: "8px",
                          border: "2px solid #4CAF50",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontWeight: "bold",
                            fontSize: "18px",
                          }}
                        >
                          {tierWeapons[0].name}
                        </p>
                        <p
                          style={{
                            margin: "5px 0 0 0",
                            fontSize: "12px",
                            opacity: 0.8,
                          }}
                        >
                          {weapons[tierWeapons[0].id]?.maxAmmo} ammo |{" "}
                          {weapons[tierWeapons[0].id]?.pelletCount
                            ? `${weapons[tierWeapons[0].id].pelletCount} pellets`
                            : `${weapons[tierWeapons[0].id]?.damage} damage`}
                        </p>
                      </div>
                    ) : (
                      // Multiple weapons - allow selection
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "10px",
                        }}
                      >
                        {tierWeapons.map((weapon) => {
                          const isEquipped = equippedWeaponId === weapon.id;
                          const weaponStats = weapons[weapon.id];
                          return (
                            <div
                              key={weapon.id}
                              onClick={() => {
                                const newLoadout = {
                                  ...loadout,
                                  [tier]: weapon.id,
                                };
                                setLoadout(newLoadout);
                                setGameState((prev) => ({
                                  ...prev,
                                  loadout: newLoadout,
                                }));
                              }}
                              style={{
                                padding: "12px",
                                background: isEquipped
                                  ? "rgba(76, 175, 80, 0.5)"
                                  : "rgba(255,255,255,0.1)",
                                borderRadius: "8px",
                                border: isEquipped
                                  ? "2px solid #4CAF50"
                                  : "1px solid rgba(255,255,255,0.3)",
                                cursor: "pointer",
                                transition: "all 0.2s",
                              }}
                            >
                              <p
                                style={{
                                  margin: 0,
                                  fontWeight: "bold",
                                  fontSize: "16px",
                                }}
                              >
                                {weapon.name}
                              </p>
                              <p
                                style={{
                                  margin: "5px 0 0 0",
                                  fontSize: "11px",
                                  opacity: 0.8,
                                }}
                              >
                                {weaponStats?.maxAmmo} ammo |{" "}
                                {weaponStats?.pelletCount
                                  ? `${weaponStats.pelletCount} pellets, ${weaponStats.spreadAngle}° spread`
                                  : `${weaponStats?.damage} damage`}
                              </p>
                              {isEquipped && (
                                <p
                                  style={{
                                    margin: "5px 0 0 0",
                                    fontSize: "12px",
                                    color: "#4CAF50",
                                    fontWeight: "bold",
                                  }}
                                >
                                  EQUIPPED
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Crosshair Selection */}
            <div
              style={{
                marginTop: "25px",
                borderTop: "2px solid rgba(255,255,255,0.2)",
                paddingTop: "20px",
              }}
            >
              <h3
                style={{
                  margin: "0 0 15px 0",
                  fontSize: "20px",
                  textAlign: "center",
                }}
              >
                CROSSHAIR
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 1fr)",
                  gap: "8px",
                }}
              >
                {(() => {
                  const predefinedCrosshairs = [
                    {
                      id: "classic-dot",
                      name: "Classic Dot",
                      type: "dot",
                      size: 4,
                      color: "#ffffff",
                      thickness: 2,
                      gap: 4,
                    },
                    {
                      id: "large-dot",
                      name: "Large Dot",
                      type: "dot",
                      size: 8,
                      color: "#ff5555",
                      thickness: 2,
                      gap: 4,
                    },
                    {
                      id: "thin-cross",
                      name: "Thin Cross",
                      type: "cross",
                      size: 10,
                      thickness: 1,
                      gap: 4,
                      color: "#ffffff",
                    },
                    {
                      id: "bold-cross",
                      name: "Bold Cross",
                      type: "cross",
                      size: 14,
                      thickness: 3,
                      gap: 6,
                      color: "#00ff99",
                    },
                    {
                      id: "tight-cross",
                      name: "Tight Cross",
                      type: "cross",
                      size: 8,
                      thickness: 2,
                      gap: 2,
                      color: "#ffff00",
                    },
                    {
                      id: "circle-small",
                      name: "Small Circle",
                      type: "circle",
                      size: 6,
                      thickness: 2,
                      color: "#ffffff",
                      gap: 4,
                    },
                    {
                      id: "circle-large",
                      name: "Large Circle",
                      type: "circle",
                      size: 12,
                      thickness: 3,
                      color: "#ff8800",
                      gap: 4,
                    },
                    {
                      id: "minimal-green",
                      name: "Minimal Green",
                      type: "dot",
                      size: 3,
                      color: "#00ff00",
                      thickness: 2,
                      gap: 4,
                    },
                    {
                      id: "sniper-cross",
                      name: "Sniper Cross",
                      type: "cross",
                      size: 18,
                      thickness: 1,
                      gap: 10,
                      color: "#ff0000",
                    },
                    {
                      id: "training-default",
                      name: "Training Default",
                      type: "cross",
                      size: 12,
                      thickness: 2,
                      gap: 5,
                      color: "#ffffff",
                    },
                  ];

                  const customData = localStorage.getItem("customCrosshair");
                  let customCrosshairItem = null;
                  if (customData) {
                    try {
                      const parsed = JSON.parse(customData);
                      customCrosshairItem = {
                        id: "custom",
                        name: "Custom",
                        type: parsed.type || "cross",
                        size: parsed.size || 10,
                        thickness: parsed.thickness || 2,
                        gap: parsed.gap || 4,
                        color: parsed.color || "#ffffff",
                      };
                    } catch (e) {}
                  }

                  const allCrosshairs = customCrosshairItem
                    ? [...predefinedCrosshairs, customCrosshairItem]
                    : predefinedCrosshairs;

                  return allCrosshairs.map((c) => {
                    const isSelected = selectedCrosshair === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCrosshair(c.id);
                          localStorage.setItem("selectedCrosshairId", c.id);
                          window.dispatchEvent(new Event("crosshairChanged"));
                        }}
                        style={{
                          padding: "10px 5px",
                          background: isSelected
                            ? "rgba(76, 175, 80, 0.5)"
                            : c.id === "custom"
                              ? "rgba(255, 215, 0, 0.2)"
                              : "rgba(255,255,255,0.1)",
                          border: isSelected
                            ? "2px solid #4CAF50"
                            : c.id === "custom"
                              ? "2px solid #FFD700"
                              : "1px solid rgba(255,255,255,0.3)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: "30px",
                            height: "30px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(0,0,0,0.5)",
                            borderRadius: "4px",
                            position: "relative",
                          }}
                        >
                          {c.type === "dot" && (
                            <div
                              style={{
                                width: `${c.size}px`,
                                height: `${c.size}px`,
                                backgroundColor: c.color,
                                borderRadius: "50%",
                              }}
                            />
                          )}
                          {c.type === "circle" && (
                            <div
                              style={{
                                width: `${Math.min(c.size * 2, 24)}px`,
                                height: `${Math.min(c.size * 2, 24)}px`,
                                border: `${c.thickness}px solid ${c.color}`,
                                borderRadius: "50%",
                              }}
                            />
                          )}
                          {c.type === "cross" && (
                            <>
                              <div
                                style={{
                                  position: "absolute",
                                  top: `calc(50% - ${Math.min(c.gap || 3, 3) + Math.min(c.size, 8)}px)`,
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  width: `${c.thickness}px`,
                                  height: `${Math.min(c.size, 8)}px`,
                                  backgroundColor: c.color,
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  top: `calc(50% + ${Math.min(c.gap || 3, 3)}px)`,
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  width: `${c.thickness}px`,
                                  height: `${Math.min(c.size, 8)}px`,
                                  backgroundColor: c.color,
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  top: "50%",
                                  left: `calc(50% - ${Math.min(c.gap || 3, 3) + Math.min(c.size, 8)}px)`,
                                  transform: "translateY(-50%)",
                                  width: `${Math.min(c.size, 8)}px`,
                                  height: `${c.thickness}px`,
                                  backgroundColor: c.color,
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  top: "50%",
                                  left: `calc(50% + ${Math.min(c.gap || 3, 3)}px)`,
                                  transform: "translateY(-50%)",
                                  width: `${Math.min(c.size, 8)}px`,
                                  height: `${c.thickness}px`,
                                  backgroundColor: c.color,
                                }}
                              />
                            </>
                          )}
                        </div>
                        <span
                          style={{
                            color: c.id === "custom" ? "#FFD700" : "white",
                            fontSize: "9px",
                            textAlign: "center",
                            fontWeight: c.id === "custom" ? "bold" : "normal",
                          }}
                        >
                          {c.name}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            <button
              onClick={() => setShowLoadoutPopup(false)}
              style={{
                width: "100%",
                marginTop: "20px",
                padding: "15px",
                fontSize: "18px",
                fontWeight: "bold",
                background: "#fdc830",
                color: "#333",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              DONE
            </button>
          </div>
        </div>
      )}

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
                            // Also update gameState so skin persists to gameplay
                            setGameState((prev) => ({
                              ...prev,
                              equippedWeaponSkins: {
                                ...prev.equippedWeaponSkins,
                                [selectedWeapon]: skin,
                              },
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
                      Flamethrower: "#ff6a00",
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

// Leaderboard Page Component
function LeaderboardPage({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<"fastest_time" | "kills">("kills");

  useEffect(() => {
    fetchLeaderboard();
  }, [category]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?category=${category}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatRunTime = (timeStr: string | null): string => {
    if (!timeStr) return "--:--:--";
    return timeStr;
  };

  const formatNumber = (num: number): string => {
    if (!num) return "0";
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getValue = (entry: any): string => {
    switch (category) {
      case "fastest_time":
        return formatRunTime(entry.fastest_run_time);
      case "kills":
        return formatNumber(entry.total_kills);
    }
  };

  const getRankColor = (index: number): string => {
    if (index === 0) return "#FFD700";
    if (index === 1) return "#C0C0C0";
    if (index === 2) return "#CD7F32";
    return "#fff";
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "#0d0a05",
        display: "flex",
        flexDirection: "column",
        color: "rgba(220,210,195,0.9)",
        fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
        zIndex: 1000,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 30px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(232,160,32,0.2)",
          background: "rgba(18,12,5,0.95)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "11px",
              color: "#c8a84b",
              letterSpacing: "3px",
              textTransform: "uppercase",
            }}
          >
            DOG: The Hotdog Wars
          </div>
          <h1
            style={{
              margin: "2px 0 0 0",
              fontSize: "26px",
              fontWeight: "700",
              color: "#e8a020",
              letterSpacing: "3px",
              textTransform: "uppercase",
            }}
          >
            LEADERBOARD
          </h1>
        </div>
        <button
          onClick={onBack}
          style={{
            padding: "10px 22px",
            fontSize: "13px",
            fontWeight: "700",
            background: "transparent",
            color: "rgba(200,168,75,0.85)",
            border: "1px solid rgba(232,160,32,0.35)",
            cursor: "pointer",
            letterSpacing: "1px",
            textTransform: "uppercase",
            fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
          }}
        >
          ← Menu
        </button>
      </div>

      {/* Category Tabs */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "4px",
          padding: "20px 30px 0",
        }}
      >
        {[
          { key: "kills" as const, label: "Total Kills" },
          { key: "fastest_time" as const, label: "Fastest Time" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategory(tab.key)}
            style={{
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: "700",
              background:
                category === tab.key ? "rgba(232,160,32,0.15)" : "transparent",
              color:
                category === tab.key ? "#e8a020" : "rgba(160,145,120,0.75)",
              border: "none",
              borderBottom:
                category === tab.key
                  ? "2px solid #e8a020"
                  : "2px solid transparent",
              cursor: "pointer",
              fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leaderboard Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 30px 30px" }}>
        <div
          style={{
            maxWidth: "700px",
            margin: "0 auto",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "15px",
            overflow: "hidden",
          }}
        >
          {/* Table Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 120px",
              padding: "15px 20px",
              background: "rgba(0,0,0,0.3)",
              fontWeight: "bold",
              fontSize: "14px",
              color: "#888",
              textTransform: "uppercase",
            }}
          >
            <span>Rank</span>
            <span>Player</span>
            <span style={{ textAlign: "right" }}>
              {category === "fastest_time" ? "Time" : "Kills"}
            </span>
          </div>

          {/* Loading */}
          {loading && (
            <div
              style={{ padding: "50px", textAlign: "center", color: "#888" }}
            >
              Loading leaderboard...
            </div>
          )}

          {/* Empty State */}
          {!loading && entries.length === 0 && (
            <div
              style={{ padding: "50px", textAlign: "center", color: "#888" }}
            >
              <div style={{ fontSize: "48px", marginBottom: "15px" }}>🏆</div>
              <p style={{ fontSize: "18px", margin: 0 }}>
                No leaderboard data yet
              </p>
              <p style={{ fontSize: "14px", marginTop: "10px" }}>
                Be the first to make it on the board!
              </p>
            </div>
          )}

          {/* Entries */}
          {!loading &&
            entries.map((entry, index) => (
              <div
                key={entry.leaderboard_id || index}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 120px",
                  padding: "12px 20px",
                  alignItems: "center",
                  borderBottom:
                    index < entries.length - 1
                      ? "1px solid rgba(255,255,255,0.05)"
                      : "none",
                  background:
                    index < 3
                      ? `rgba(255,255,255,${0.05 - index * 0.015})`
                      : "transparent",
                }}
              >
                {/* Rank */}
                <div
                  style={{
                    width: "35px",
                    height: "35px",
                    borderRadius: "50%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontWeight: "bold",
                    fontSize: "16px",
                    background:
                      index === 0
                        ? "linear-gradient(135deg, #FFD700, #FFA500)"
                        : index === 1
                          ? "linear-gradient(135deg, #C0C0C0, #A0A0A0)"
                          : index === 2
                            ? "linear-gradient(135deg, #CD7F32, #8B4513)"
                            : "#2a3f5f",
                    color: index < 2 ? "#000" : "#fff",
                  }}
                >
                  {index + 1}
                </div>

                {/* Player */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "8px",
                      background: `linear-gradient(135deg, hsl(${(entry.user_id * 37) % 360}, 70%, 50%), hsl(${(entry.user_id * 37 + 40) % 360}, 70%, 40%))`,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: "18px",
                      fontWeight: "bold",
                    }}
                  >
                    {entry.username
                      ? entry.username.charAt(0).toUpperCase()
                      : "?"}
                  </div>
                  <div>
                    <div style={{ fontWeight: "600" }}>
                      {entry.username || `Player #${entry.user_id}`}
                    </div>
                    <div style={{ fontSize: "11px", color: "#888" }}>
                      ID: {entry.user_id}
                    </div>
                  </div>
                </div>

                {/* Score */}
                <div
                  style={{
                    textAlign: "right",
                    fontSize: "18px",
                    fontWeight: "bold",
                    color: getRankColor(index),
                  }}
                >
                  {getValue(entry)}
                </div>
              </div>
            ))}
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
    grenade_key: localStorage.getItem("grenade_key") || "KeyQ",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [listeningFor, setListeningFor] = useState<string | null>(null);

  // Custom crosshair state
  const [customCrosshair, setCustomCrosshair] = useState(() => {
    const saved = localStorage.getItem("customCrosshair");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {
          type: "cross",
          size: 10,
          thickness: 2,
          gap: 4,
          color: "#ffffff",
        };
      }
    }
    return { type: "cross", size: 10, thickness: 2, gap: 4, color: "#ffffff" };
  });

  const saveCustomCrosshair = () => {
    localStorage.setItem("customCrosshair", JSON.stringify(customCrosshair));
    localStorage.setItem("selectedCrosshairId", "custom");
    window.dispatchEvent(new Event("crosshairChanged"));
    setMessage("Custom crosshair saved and equipped!");
  };

  // Keybind display names
  const keybindLabels: Record<string, string> = {
    move_forward_key: "Move Forward",
    move_backward_key: "Move Backward",
    move_left_key: "Move Left",
    move_right_key: "Move Right",
    jump_key: "Jump",
    grenade_key: "Throw Grenade",
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
            grenade_key: s.grenade_key || "KeyQ",
          });
          // Also apply to global store immediately
          setKeybinding("forward", s.move_forward_key || "KeyW");
          setKeybinding("backward", s.move_backward_key || "KeyS");
          setKeybinding("leftward", s.move_left_key || "KeyA");
          setKeybinding("rightward", s.move_right_key || "KeyD");
          setKeybinding("jump", s.jump_key || "Space");
          setKeybinding("grenade", s.grenade_key || "KeyQ");
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
        setKeybinding("grenade", settings.grenade_key);
        localStorage.setItem("grenade_key", settings.grenade_key);
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
        background: "#0d0a05",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        color: "rgba(220,210,195,0.9)",
        fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
        zIndex: 1000,
        padding: "32px 20px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "44px 50px",
          margin: "12px 0 32px",
          background: "rgba(18,12,5,0.96)",
          border: "1px solid rgba(232,160,32,0.25)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
          maxWidth: "600px",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            color: "#c8a84b",
            letterSpacing: "3px",
            textTransform: "uppercase",
            marginBottom: "4px",
          }}
        >
          DOG: The Hotdog Wars
        </div>
        <h1
          style={{
            fontSize: "32px",
            fontWeight: "700",
            marginBottom: "28px",
            color: "#e8a020",
            letterSpacing: "3px",
            textTransform: "uppercase",
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
                    background: "rgba(18,12,5,0.7)",
                    border:
                      listeningFor === key
                        ? "1px solid rgba(232,160,32,0.8)"
                        : "1px solid rgba(232,160,32,0.2)",
                  }}
                >
                  <span style={{ fontSize: "16px" }}>{label}</span>
                  <button
                    onClick={() => setListeningFor(key)}
                    style={{
                      padding: "8px 20px",
                      fontSize: "13px",
                      fontWeight: "700",
                      background:
                        listeningFor === key
                          ? "rgba(232,160,32,0.9)"
                          : "rgba(18,12,5,0.9)",
                      color: listeningFor === key ? "#0d0a05" : "#c8a84b",
                      border:
                        listeningFor === key
                          ? "none"
                          : "1px solid rgba(232,160,32,0.3)",
                      cursor: "pointer",
                      minWidth: "100px",
                      letterSpacing: "1px",
                      textTransform: "uppercase" as const,
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

            {/* Custom Crosshair Creator */}
            <h2
              style={{
                fontSize: "24px",
                marginBottom: "15px",
                marginTop: "30px",
                textAlign: "left",
              }}
            >
              Custom Crosshair
            </h2>
            <p
              style={{
                fontSize: "14px",
                opacity: 0.8,
                marginBottom: "15px",
                textAlign: "left",
              }}
            >
              Create your own crosshair. After saving, go to Loadout to equip
              it.
            </p>

            <div
              style={{
                background: "rgba(18,12,5,0.8)",
                border: "1px solid rgba(232,160,32,0.2)",
                padding: "20px",
                marginBottom: "20px",
              }}
            >
              {/* Preview */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    background: "rgba(0,0,0,0.8)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  {customCrosshair.type === "dot" && (
                    <div
                      style={{
                        width: `${customCrosshair.size}px`,
                        height: `${customCrosshair.size}px`,
                        backgroundColor: customCrosshair.color,
                        borderRadius: "50%",
                      }}
                    />
                  )}
                  {customCrosshair.type === "circle" && (
                    <div
                      style={{
                        width: `${customCrosshair.size * 2}px`,
                        height: `${customCrosshair.size * 2}px`,
                        border: `${customCrosshair.thickness}px solid ${customCrosshair.color}`,
                        borderRadius: "50%",
                      }}
                    />
                  )}
                  {customCrosshair.type === "cross" && (
                    <>
                      <div
                        style={{
                          position: "absolute",
                          top: `calc(50% - ${customCrosshair.gap + customCrosshair.size}px)`,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: `${customCrosshair.thickness}px`,
                          height: `${customCrosshair.size}px`,
                          backgroundColor: customCrosshair.color,
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          top: `calc(50% + ${customCrosshair.gap}px)`,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: `${customCrosshair.thickness}px`,
                          height: `${customCrosshair.size}px`,
                          backgroundColor: customCrosshair.color,
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: `calc(50% - ${customCrosshair.gap + customCrosshair.size}px)`,
                          transform: "translateY(-50%)",
                          width: `${customCrosshair.size}px`,
                          height: `${customCrosshair.thickness}px`,
                          backgroundColor: customCrosshair.color,
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: `calc(50% + ${customCrosshair.gap}px)`,
                          transform: "translateY(-50%)",
                          width: `${customCrosshair.size}px`,
                          height: `${customCrosshair.thickness}px`,
                          backgroundColor: customCrosshair.color,
                        }}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Type Selection */}
              <div style={{ marginBottom: "15px" }}>
                <label
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    display: "block",
                    marginBottom: "8px",
                  }}
                >
                  Type
                </label>
                <div style={{ display: "flex", gap: "10px" }}>
                  {["dot", "cross", "circle"].map((t) => (
                    <button
                      key={t}
                      onClick={() =>
                        setCustomCrosshair((prev: any) => ({
                          ...prev,
                          type: t,
                        }))
                      }
                      style={{
                        padding: "8px 16px",
                        background:
                          customCrosshair.type === t
                            ? "rgba(232,160,32,0.9)"
                            : "rgba(18,12,5,0.85)",
                        border:
                          customCrosshair.type === t
                            ? "none"
                            : "1px solid rgba(232,160,32,0.25)",
                        color:
                          customCrosshair.type === t ? "#0d0a05" : "#c8a84b",
                        cursor: "pointer",
                        fontWeight: "bold",
                        textTransform: "capitalize",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div style={{ marginBottom: "15px" }}>
                <label
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    display: "block",
                    marginBottom: "8px",
                  }}
                >
                  Color
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    "#ffffff",
                    "#00ff00",
                    "#ff0000",
                    "#ffff00",
                    "#00ffff",
                    "#ff00ff",
                    "#ff8800",
                    "#00ff99",
                  ].map((c) => (
                    <button
                      key={c}
                      onClick={() =>
                        setCustomCrosshair((prev: any) => ({
                          ...prev,
                          color: c,
                        }))
                      }
                      style={{
                        width: "30px",
                        height: "30px",
                        background: c,
                        border:
                          customCrosshair.color === c
                            ? "3px solid white"
                            : "2px solid rgba(255,255,255,0.3)",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={customCrosshair.color}
                    onChange={(e) =>
                      setCustomCrosshair((prev: any) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    style={{
                      width: "30px",
                      height: "30px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  />
                </div>
              </div>

              {/* Size */}
              <div style={{ marginBottom: "15px" }}>
                <label
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    display: "block",
                    marginBottom: "8px",
                  }}
                >
                  Size: {customCrosshair.size}
                </label>
                <input
                  type="range"
                  min="2"
                  max="20"
                  value={customCrosshair.size}
                  onChange={(e) =>
                    setCustomCrosshair((prev: any) => ({
                      ...prev,
                      size: parseInt(e.target.value),
                    }))
                  }
                  style={{ width: "100%" }}
                />
              </div>

              {/* Thickness (for cross and circle) */}
              {(customCrosshair.type === "cross" ||
                customCrosshair.type === "circle") && (
                <div style={{ marginBottom: "15px" }}>
                  <label
                    style={{
                      fontSize: "14px",
                      fontWeight: "bold",
                      display: "block",
                      marginBottom: "8px",
                    }}
                  >
                    Thickness: {customCrosshair.thickness}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    value={customCrosshair.thickness}
                    onChange={(e) =>
                      setCustomCrosshair((prev: any) => ({
                        ...prev,
                        thickness: parseInt(e.target.value),
                      }))
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              {/* Gap (for cross only) */}
              {customCrosshair.type === "cross" && (
                <div style={{ marginBottom: "15px" }}>
                  <label
                    style={{
                      fontSize: "14px",
                      fontWeight: "bold",
                      display: "block",
                      marginBottom: "8px",
                    }}
                  >
                    Gap: {customCrosshair.gap}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    value={customCrosshair.gap}
                    onChange={(e) =>
                      setCustomCrosshair((prev: any) => ({
                        ...prev,
                        gap: parseInt(e.target.value),
                      }))
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              <button
                onClick={saveCustomCrosshair}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: "14px",
                  fontWeight: "700",
                  background: "rgba(232,160,32,0.9)",
                  color: "#0d0a05",
                  border: "none",
                  cursor: "pointer",
                  letterSpacing: "2px",
                  textTransform: "uppercase" as const,
                }}
              >
                SAVE CUSTOM CROSSHAIR
              </button>
            </div>

            {/* Message */}
            {message && (
              <p
                style={{
                  marginTop: "20px",
                  padding: "10px",
                  background:
                    message.includes("success") || message.includes("saved")
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
                  padding: "14px 36px",
                  fontSize: "15px",
                  fontWeight: "700",
                  background: saving
                    ? "rgba(130,110,70,0.5)"
                    : "rgba(232,160,32,0.9)",
                  color: saving ? "rgba(200,180,140,0.6)" : "#0d0a05",
                  border: "none",
                  cursor: saving ? "not-allowed" : "pointer",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  fontFamily:
                    '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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
                    previousGamePhase: null,
                  }))
                }
                style={{
                  padding: "13px 32px",
                  fontSize: "14px",
                  fontWeight: "600",
                  background: "transparent",
                  color: "rgba(200,168,75,0.85)",
                  border: "1px solid rgba(232,160,32,0.35)",
                  cursor: "pointer",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  fontFamily:
                    '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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
    warning_count: number;
    isAdmin: boolean;
  } | null>(null);
  const [fullLoadoutEnabled, setFullLoadoutEnabled] = useState(() => {
    return localStorage.getItem("adminFullLoadout") === "true";
  });
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

  // Tab state
  const [activeTab, setActiveTab] = useState<"profile" | "stats">("profile");

  // Stats state
  const [stats, setStats] = useState<{
    total_shots: number;
    shots_hit: number;
    deaths: number;
    minutes_played: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Load profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  // Load stats when switching to stats tab
  useEffect(() => {
    if (activeTab !== "stats" || stats !== null) return;
    setStatsLoading(true);
    fetch("/api/stats", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() =>
        setStats({
          total_shots: 0,
          shots_hit: 0,
          deaths: 0,
          minutes_played: 0,
        }),
      )
      .finally(() => setStatsLoading(false));
  }, [activeTab]);

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
          setGameState((prev) => ({
            ...prev,
            gamePhase: "login",
            equippedWeaponSkins: {
              1: "Default",
              2: "Default",
              3: "Default",
              4: "Default",
              5: "Default",
            },
            loadout: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6 },
          }));
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
          background: "#0d0a05",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#c8a84b",
          fontSize: "18px",
          letterSpacing: "3px",
          textTransform: "uppercase",
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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
        background: "#0d0a05",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "40px",
        color: "rgba(220,210,195,0.9)",
        fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
        zIndex: 1000,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          maxWidth: "600px",
          width: "100%",
          padding: "36px",
          background: "rgba(18,12,5,0.96)",
          border: "1px solid rgba(232,160,32,0.22)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            color: "#c8a84b",
            letterSpacing: "3px",
            textTransform: "uppercase",
            marginBottom: "4px",
            textAlign: "center",
          }}
        >
          DOG: The Hotdog Wars
        </div>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: "700",
            marginBottom: "20px",
            textAlign: "center",
            color: "#e8a020",
            letterSpacing: "3px",
            textTransform: "uppercase",
          }}
        >
          {activeTab === "stats" ? "STATS" : "PROFILE"}
        </h1>

        {/* Tab navigation */}
        <div
          style={{
            display: "flex",
            marginBottom: "28px",
            borderBottom: "1px solid rgba(232,160,32,0.25)",
          }}
        >
          {(["profile", "stats"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "10px",
                background:
                  activeTab === tab ? "rgba(232,160,32,0.15)" : "transparent",
                border: "none",
                borderBottom:
                  activeTab === tab
                    ? "2px solid #e8a020"
                    : "2px solid transparent",
                color: activeTab === tab ? "#e8a020" : "rgba(200,168,75,0.6)",
                fontSize: "13px",
                fontWeight: "700",
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

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

        {/* ── PROFILE TAB ───────────────────────────────────── */}
        {activeTab === "profile" && (
          <>
            {/* Warning Count Display */}
            {profile && profile.warning_count > 0 && (
              <div
                style={{
                  background: "rgba(255,165,0,0.2)",
                  border: "1px solid #f39c12",
                  borderRadius: "8px",
                  padding: "15px",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span style={{ fontSize: "28px" }}>⚠️</span>
                <div>
                  <div
                    style={{
                      fontWeight: "bold",
                      color: "#f39c12",
                      marginBottom: "4px",
                    }}
                  >
                    Account Warnings: {profile.warning_count}
                  </div>
                  <div style={{ fontSize: "13px", color: "#e0e0e0" }}>
                    Your account has received warnings from administrators.
                    Please follow the rules to avoid further action.
                  </div>
                </div>
              </div>
            )}

            {/* Admin Full Loadout Checkbox */}
            {profile?.isAdmin && (
              <div
                style={{
                  background: "rgba(18,12,5,0.7)",
                  border: "1px solid rgba(232,160,32,0.3)",
                  padding: "15px",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    color: "#c8a84b",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span style={{ fontSize: "18px" }}>👑</span> Admin Options
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={fullLoadoutEnabled}
                    onChange={(e) => {
                      setFullLoadoutEnabled(e.target.checked);
                      localStorage.setItem(
                        "adminFullLoadout",
                        e.target.checked ? "true" : "false",
                      );
                    }}
                    style={{ width: "20px", height: "20px", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "14px" }}>
                    Enable full loadout at game start (all weapons unlocked)
                  </span>
                </label>
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
                    : "rgba(32,22,8,0.9)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  border: "3px solid rgba(232,160,32,0.6)",
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
                        background: "rgba(232,160,32,0.9)",
                        border: "none",
                        padding: "10px",
                        color: "#0d0a05",
                        cursor: loadingUrlPicture ? "wait" : "pointer",
                        fontWeight: "700",
                        letterSpacing: "1px",
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
              <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>
                Username
              </h3>
              {!editingUsername ? (
                <div
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
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
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
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
                        background: "rgba(232,160,32,0.9)",
                        border: "none",
                        padding: "10px",
                        color: "#0d0a05",
                        cursor: "pointer",
                        fontWeight: "700",
                        letterSpacing: "1px",
                        textTransform: "uppercase" as const,
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
              <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>
                Password
              </h3>
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
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
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
                        background: "rgba(232,160,32,0.9)",
                        border: "none",
                        padding: "10px",
                        color: "#0d0a05",
                        cursor: "pointer",
                        fontWeight: "700",
                        letterSpacing: "1px",
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

            {/* Admin Button - only shown if user is admin */}
            {gameState.isAdmin && (
              <button
                onClick={() => (window.location.href = "/admin")}
                style={{
                  width: "100%",
                  background: "#27ae60",
                  border: "2px solid #2ecc71",
                  borderRadius: "12px",
                  padding: "12px",
                  color: "white",
                  fontSize: "18px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  marginBottom: "10px",
                }}
              >
                ADMIN
              </button>
            )}
          </>
        )}
        {/* ── STATS TAB ─────────────────────────────────────── */}
        {activeTab === "stats" && (
          <div>
            {statsLoading && (
              <div
                style={{
                  textAlign: "center",
                  color: "#c8a84b",
                  padding: "40px 0",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  fontSize: "14px",
                }}
              >
                Loading stats...
              </div>
            )}
            {!statsLoading && !stats && (
              <div
                style={{
                  textAlign: "center",
                  color: "rgba(200,168,75,0.5)",
                  padding: "40px 0",
                }}
              >
                No stats available yet. Play a game to start tracking!
              </div>
            )}
            {!statsLoading && stats && (
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "rgba(200,168,75,0.6)",
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    marginBottom: "20px",
                    textAlign: "center",
                  }}
                >
                  Career Overview
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                    marginBottom: "24px",
                  }}
                >
                  {[
                    {
                      label: "Shots Fired",
                      value: stats.total_shots.toLocaleString(),
                      icon: "🔫",
                    },
                    {
                      label: "Shots Hit",
                      value: stats.shots_hit.toLocaleString(),
                      icon: "🎯",
                    },
                    {
                      label: "Accuracy",
                      value: `${stats.total_shots > 0 ? ((stats.shots_hit / stats.total_shots) * 100).toFixed(1) : "0.0"}%`,
                      icon: "📊",
                    },
                    {
                      label: "Deaths",
                      value: stats.deaths.toLocaleString(),
                      icon: "💀",
                    },
                    {
                      label: "Time Played",
                      value:
                        Math.floor(stats.minutes_played / 60) > 0
                          ? `${Math.floor(stats.minutes_played / 60)}h ${stats.minutes_played % 60}m`
                          : `${stats.minutes_played}m`,
                      icon: "⏱",
                    },
                  ].map((card) => (
                    <div
                      key={card.label}
                      style={{
                        background: "rgba(12,8,2,0.8)",
                        border: "1px solid rgba(232,160,32,0.2)",
                        padding: "18px 14px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "22px", marginBottom: "6px" }}>
                        {card.icon}
                      </div>
                      <div
                        style={{
                          fontSize: "26px",
                          fontWeight: "700",
                          color: "#e8a020",
                          letterSpacing: "1px",
                          marginBottom: "4px",
                        }}
                      >
                        {card.value}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "rgba(200,168,75,0.6)",
                          letterSpacing: "2px",
                          textTransform: "uppercase",
                        }}
                      >
                        {card.label}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    background: "rgba(12,8,2,0.8)",
                    border: "1px solid rgba(232,160,32,0.2)",
                    padding: "16px",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        letterSpacing: "2px",
                        textTransform: "uppercase",
                        color: "rgba(200,168,75,0.7)",
                      }}
                    >
                      Accuracy
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "700",
                        color: "#e8a020",
                      }}
                    >
                      {stats.total_shots > 0
                        ? ((stats.shots_hit / stats.total_shots) * 100).toFixed(
                            1,
                          )
                        : "0.0"}
                      %
                    </span>
                  </div>
                  <div
                    style={{
                      height: "6px",
                      background: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${stats.total_shots > 0 ? Math.min((stats.shots_hit / stats.total_shots) * 100, 100) : 0}%`,
                        background: "linear-gradient(90deg, #c8a84b, #e8a020)",
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Back to Menu */}
        <button
          onClick={() =>
            setGameState((prev) => ({ ...prev, gamePhase: "menu" }))
          }
          style={{
            width: "100%",
            marginTop: "8px",
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

// Doom-style menu button used on the home screen
function MenuButton({
  label,
  onClick,
  onHover,
}: {
  label: string;
  onClick: () => void;
  onHover: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => {
        setHovered(true);
        onHover();
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        background: hovered ? "rgba(200, 120, 20, 0.82)" : "rgba(0,0,0,0.0)",
        border: "none",
        borderLeft: hovered ? "4px solid #e8a020" : "4px solid transparent",
        color: hovered ? "#fff" : "rgba(220,210,195,0.88)",
        fontSize: "20px",
        fontWeight: hovered ? "700" : "500",
        fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
        letterSpacing: "1px",
        textTransform: "uppercase",
        padding: "10px 20px 10px 16px",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "all 0.12s ease",
        textShadow: hovered
          ? "0 0 12px rgba(255,180,60,0.7)"
          : "0 1px 4px rgba(0,0,0,0.9)",
        boxShadow: hovered ? "inset 0 0 20px rgba(0,0,0,0.3)" : "none",
      }}
    >
      {hovered && (
        <span
          style={{
            color: "#e8a020",
            fontSize: "18px",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ▶
        </span>
      )}
      {label}
    </button>
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
  const [paymentModal, setPaymentModal] = useState<{
    id: number;
    price: string;
    gold: number;
    amountUSD: number;
  } | null>(null);
  const [payCardNumber, setPayCardNumber] = useState("");
  const [payExpiry, setPayExpiry] = useState("");
  const [payCVC, setPayCVC] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [ownedItemIds, setOwnedItemIds] = useState<number[]>([]);
  const [showAugmentCategoryModal, setShowAugmentCategoryModal] =
    useState(false);
  const [selectedAugmentCategory, setSelectedAugmentCategory] = useState<
    "weapons" | "user" | null
  >(null);

  // Reset augment modal when leaving level transition (prevents UI from persisting between waves)
  useEffect(() => {
    if (gameState.gamePhase !== "levelTransition") {
      setShowAugmentCategoryModal(false);
      setSelectedAugmentCategory(null);
    }
  }, [gameState.gamePhase]);

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

  // Save leaderboard data only when completing the entire game (victory)
  const victorySavedRef = React.useRef<number | null>(null);

  useEffect(() => {
    // Only save on victory (completing entire campaign)
    if (gameState.gamePhase !== "victory") return;
    if (gameState.adminLevelTestMode) return;

    // Only save for logged-in users (not guests)
    if (gameState.user.isGuest) return;

    // Prevent duplicate saves for the same victory (using gameStartTime as unique identifier)
    if (victorySavedRef.current === gameState.gameStartTime) return;
    victorySavedRef.current = gameState.gameStartTime;

    // Calculate run time
    let fastestRunTime: string | null = null;
    if (gameState.gameStartTime) {
      const runTimeMs = Date.now() - gameState.gameStartTime;
      const totalSeconds = Math.floor(runTimeMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      fastestRunTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    console.log(
      `Saving campaign victory leaderboard: fastestRunTime=${fastestRunTime}`,
    );

    // Save to leaderboard — only run time for campaign
    fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fastestRunTime: fastestRunTime,
      }),
    })
      .then((res) => {
        if (res.ok) {
          console.log(
            `Campaign victory leaderboard saved: time=${fastestRunTime}`,
          );
        } else {
          res
            .text()
            .then((text) =>
              console.error("Failed to save leaderboard entry:", text),
            );
        }
      })
      .catch((err) => console.error("Error saving leaderboard:", err));
  }, [gameState.gamePhase, gameState.gameStartTime, gameState.user.isGuest]);

  // Save total kills to localStorage after every wave (level transition)
  const levelTransitionSavedRef = React.useRef<number>(-1);

  useEffect(() => {
    if (gameState.gamePhase !== "levelTransition") return;
    if (gameState.adminLevelTestMode) return;

    // Prevent duplicate saves for the same level
    if (levelTransitionSavedRef.current === gameState.level.currentLevel)
      return;
    levelTransitionSavedRef.current = gameState.level.currentLevel;

    const totalKills = gameState.story.totalKills;
    const savedKills = getLocalStorage("savedTotalKills") || 0;

    // Only save if current kills are higher
    if (totalKills > savedKills) {
      setLocalStorage("savedTotalKills", totalKills);
      console.log(`Saved total kills after wave: ${totalKills}`);
    }
  }, [
    gameState.gamePhase,
    gameState.level.currentLevel,
    gameState.story.totalKills,
  ]);

  // Save fastest time to localStorage when completing the whole game (victory)
  const fastestTimeSavedRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (gameState.gamePhase !== "victory") return;
    if (gameState.adminLevelTestMode) return;

    // Prevent duplicate saves for the same victory
    if (fastestTimeSavedRef.current === gameState.gameStartTime) return;
    fastestTimeSavedRef.current = gameState.gameStartTime;

    if (gameState.gameStartTime) {
      const runTimeMs = Date.now() - gameState.gameStartTime;
      const savedFastestTime = getLocalStorage("savedFastestTime") as
        | number
        | null;

      // Only save if this is a new best time (or first completion)
      if (savedFastestTime === null || runTimeMs < savedFastestTime) {
        setLocalStorage("savedFastestTime", runTimeMs);
        const totalSeconds = Math.floor(runTimeMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        console.log(`New fastest time saved: ${timeStr}`);
      }
    }

    // Also save final total kills on victory
    const totalKills = gameState.story.totalKills;
    const savedKills = getLocalStorage("savedTotalKills") || 0;
    if (totalKills > savedKills) {
      setLocalStorage("savedTotalKills", totalKills);
      console.log(`Saved final total kills: ${totalKills}`);
    }
  }, [
    gameState.gamePhase,
    gameState.gameStartTime,
    gameState.story.totalKills,
  ]);

  // Save total kills to leaderboard on death in endless mode
  const endlessDeathSavedRef = React.useRef<number | null>(null);

  useEffect(() => {
    // Only trigger on gameover in endless mode
    if (gameState.gamePhase !== "gameover") return;
    if (gameState.gameMode !== "endless") return;
    if (gameState.adminLevelTestMode) return;

    // Only save for logged-in users (not guests)
    if (gameState.user.isGuest) return;

    // Prevent duplicate saves using gameStartTime as unique identifier
    if (endlessDeathSavedRef.current === gameState.gameStartTime) return;
    endlessDeathSavedRef.current = gameState.gameStartTime;

    const totalKills = gameState.story.totalKills;

    // Save to leaderboard
    fetch("/api/leaderboard", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalKills }),
    })
      .then((res) => {
        if (res.ok) {
          console.log(
            `Endless mode: Saved ${totalKills} kills to leaderboard on death`,
          );
        }
      })
      .catch((error) => {
        console.error(
          "Failed to save endless mode kills to leaderboard:",
          error,
        );
      });

    // Also save to localStorage
    const savedKills = getLocalStorage("savedTotalKills") || 0;
    if (totalKills > savedKills) {
      setLocalStorage("savedTotalKills", totalKills);
      console.log(
        `Saved endless mode total kills to localStorage: ${totalKills}`,
      );
    }
  }, [
    gameState.gamePhase,
    gameState.gameMode,
    gameState.gameStartTime,
    gameState.story.totalKills,
    gameState.user.isGuest,
  ]);

  // Save shots/hits/deaths to DB on game over (logged-in users only)
  const statsSavedRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (gameState.gamePhase !== "gameover") return;
    if (gameState.adminLevelTestMode) return;
    if (gameState.user.isGuest) return;
    if (statsSavedRef.current === gameState.gameStartTime) return;
    statsSavedRef.current = gameState.gameStartTime;

    const shots = gameState.sessionShotsFired;
    const hits = gameState.sessionShotsHit;
    fetch("/api/stats/update", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shots, hits, deaths: 1 }),
    }).catch((err) => console.error("Failed to save stats:", err));
  }, [
    gameState.gamePhase,
    gameState.gameStartTime,
    gameState.user.isGuest,
    gameState.sessionShotsFired,
    gameState.sessionShotsHit,
  ]);

  // Currency bundle options (mock purchases - no real payment yet)
  const currencyBundles = [
    { id: 1, price: "$1", gold: 100, popular: false },
    { id: 2, price: "$5", gold: 520, popular: false },
    { id: 3, price: "$10", gold: 1100, popular: true },
    { id: 4, price: "$50", gold: 6000, popular: false },
  ];

  // Open payment modal for currency purchase
  const handleBuyCurrency = (bundle: (typeof currencyBundles)[0]) => {
    if (gameState.user.isGuest) {
      alert("Please log in to purchase gold!");
      return;
    }
    if (gameState.user.currency === 67) {
      alert("You already have unlimited gold!");
      return;
    }
    const amountUSD = parseFloat(bundle.price.replace("$", ""));
    setPaymentModal({
      id: bundle.id,
      price: bundle.price,
      gold: bundle.gold,
      amountUSD,
    });
    setPayCardNumber("");
    setPayExpiry("");
    setPayCVC("");
    setPaymentError("");
  };

  // Format card number with spaces every 4 digits
  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  // Format expiry as MM/YY
  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  // Submit payment
  const handleSubmitPayment = async () => {
    if (!paymentModal) return;
    setPaymentError("");

    const rawCard = payCardNumber.replace(/\s/g, "");
    if (rawCard.length !== 16) {
      setPaymentError("Card number must be 16 digits.");
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(payExpiry)) {
      setPaymentError("Expiry must be MM/YY.");
      return;
    }
    if (!/^\d{3,4}$/.test(payCVC)) {
      setPaymentError("CVC must be 3 or 4 digits.");
      return;
    }

    setPaymentLoading(true);
    try {
      const res = await fetch("/api/buy-currency", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardNumber: rawCard,
          cardExpiry: payExpiry,
          cardCVC: payCVC,
          amountUSD: paymentModal.amountUSD,
          goldAmount: paymentModal.gold,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPaymentError(data.error || "Payment failed. Please try again.");
        return;
      }
      setGameState((prev) => ({
        ...prev,
        user: { ...prev.user, currency: data.newGold },
      }));
      setPaymentModal(null);
      alert(
        `✅ ${paymentModal.gold.toLocaleString()} gold added to your account!`,
      );
    } catch (err) {
      setPaymentError("Network error. Please try again.");
    } finally {
      setPaymentLoading(false);
    }
  };

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
          background: "#0d0a05",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(220,210,195,0.9)",
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "44px 48px",
            background: "rgba(18,12,5,0.96)",
            border: "1px solid rgba(232,160,32,0.25)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
            maxWidth: "400px",
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              color: "#c8a84b",
              letterSpacing: "3px",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            DOG: THE HOTDOG WARS
          </div>
          <h2
            style={{
              fontSize: "28px",
              fontWeight: "700",
              marginBottom: "28px",
              color: "#e8a020",
              letterSpacing: "2px",
              textTransform: "uppercase",
              margin: "0 0 28px 0",
            }}
          >
            Sign In
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                padding: "12px 14px",
                fontSize: "15px",
                background: "#1a1005",
                border: "1px solid rgba(232,160,32,0.3)",
                outline: "none",
                color: "rgba(220,210,195,0.9)",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                padding: "12px 14px",
                fontSize: "15px",
                background: "#1a1005",
                border: "1px solid rgba(232,160,32,0.3)",
                outline: "none",
                color: "rgba(220,210,195,0.9)",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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
                      // Reset weapon skins to default for new login session
                      equippedWeaponSkins: {
                        1: "Default",
                        2: "Default",
                        3: "Default",
                        4: "Default",
                        5: "Default",
                      },
                      loadout: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6 },
                      isAdmin: data.isAdmin || false,
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
                        setKeybinding("grenade", s.grenade_key || "KeyQ");
                        const sens = parseFloat(s.mouse_sensitivity);
                        setNormalSensitivity(isNaN(sens) ? 1 : sens);
                      }
                    } catch (e) {
                      console.error("Failed to load settings:", e);
                    }
                  } else {
                    const error = await response.json();
                    if (error.banned) {
                      alert(
                        `⛔ ACCOUNT BANNED\n\nReason: ${error.ban_reason}\n\nContact an administrator if you believe this is a mistake.`,
                      );
                    } else {
                      alert(error.error || "Login failed");
                    }
                  }
                } catch (error) {
                  alert("Network error during login");
                }
              }}
              style={{
                padding: "13px 20px",
                fontSize: "16px",
                fontWeight: "700",
                background: "rgba(232,160,32,0.9)",
                color: "#0d0a05",
                border: "none",
                cursor: "pointer",
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
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
                fontSize: "14px",
                background: "transparent",
                color: "rgba(200,168,75,0.85)",
                border: "1px solid rgba(232,160,32,0.3)",
                cursor: "pointer",
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
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
          background: "#0d0a05",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(220,210,195,0.9)",
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "44px 48px",
            background: "rgba(18,12,5,0.96)",
            border: "1px solid rgba(232,160,32,0.25)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
            maxWidth: "400px",
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              color: "#c8a84b",
              letterSpacing: "3px",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            DOG: THE HOTDOG WARS
          </div>
          <h2
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: "#e8a020",
              letterSpacing: "2px",
              textTransform: "uppercase",
              margin: "0 0 28px 0",
            }}
          >
            Create Account
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                padding: "12px 14px",
                fontSize: "15px",
                background: "#1a1005",
                border: "1px solid rgba(232,160,32,0.3)",
                outline: "none",
                color: "rgba(220,210,195,0.9)",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
              }}
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                padding: "12px 14px",
                fontSize: "15px",
                background: "#1a1005",
                border: "1px solid rgba(232,160,32,0.3)",
                outline: "none",
                color: "rgba(220,210,195,0.9)",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                padding: "12px 14px",
                fontSize: "15px",
                background: "#1a1005",
                border: "1px solid rgba(232,160,32,0.3)",
                outline: "none",
                color: "rgba(220,210,195,0.9)",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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
                        currency: 500,
                        cosmetics: [],
                        equippedSkin: null,
                      },
                      // Reset weapon skins to default for new account
                      equippedWeaponSkins: {
                        1: "Default",
                        2: "Default",
                        3: "Default",
                        4: "Default",
                        5: "Default",
                      },
                      loadout: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6 },
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
                padding: "13px 20px",
                fontSize: "16px",
                fontWeight: "700",
                background: "rgba(232,160,32,0.9)",
                color: "#0d0a05",
                border: "none",
                cursor: "pointer",
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
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
                fontSize: "14px",
                background: "transparent",
                color: "rgba(200,168,75,0.85)",
                border: "1px solid rgba(232,160,32,0.3)",
                cursor: "pointer",
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
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
    const playHover = () => {
      try {
        const a = new Audio("/sounds/hit.mp3");
        a.volume = 0.18;
        a.play().catch(() => {});
      } catch {}
    };
    const playClick = () => {
      try {
        const a = new Audio("/sounds/success.mp3");
        a.volume = 0.35;
        a.play().catch(() => {});
      } catch {}
    };

    const menuItems: { label: string; onClick: () => void }[] = [
      {
        label: "Story Mode",
        onClick: () => {
          playClick();
          setGameState((prev) => ({
            ...prev,
            gamePhase: "difficultySelect",
          }));
        },
      },
      {
        label: "Endless Wave",
        onClick: () => {
          playClick();
          setGameState((prev) => ({
            ...prev,
            gamePhase: "playing",
            gameMode: "endless",
            gameStartTime: Date.now(),
            health: prev.maxHealth,
            ammo: weapons[1].maxAmmo,
            reserveAmmo: getStartingReserveAmmo(1),
            grenades: 3,
            maxGrenades: 6,
            coins: 0,
            enemies: [],
            bullets: [],
            grenadeProjectiles: [],
            explosions: [],
            enemyProjectiles: [],
            story: {
              currentSettlement: 0,
              alliesRescued: 0,
              settlementsConquered: [],
              totalKills: 0,
            },
            sessionShotsFired: 0,
            sessionShotsHit: 0,
            level: {
              currentLevel: 1,
              killsThisLevel: 0,
              giantsSpawnedThisLevel: 0,
            },
          }));
          document.body.requestPointerLock();
        },
      },
      {
        label: "Leaderboard",
        onClick: () => {
          playClick();
          setGameState((prev) => ({ ...prev, gamePhase: "leaderboard" }));
        },
      },
      {
        label: "Shop",
        onClick: () => {
          playClick();
          setGameState((prev) => ({ ...prev, gamePhase: "shop" }));
        },
      },
      {
        label: "Inventory",
        onClick: () => {
          playClick();
          setGameState((prev) => ({ ...prev, gamePhase: "inventory" }));
        },
      },
      {
        label: "Settings",
        onClick: () => {
          playClick();
          setGameState((prev) => ({
            ...prev,
            gamePhase: "settings",
            previousGamePhase: "menu",
          }));
        },
      },
      {
        label: "Profile",
        onClick: () => {
          playClick();
          setGameState((prev) => ({ ...prev, gamePhase: "profile" }));
        },
      },
    ];

    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundImage: 'url("/HomeScreen.png")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          zIndex: 1000,
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
        }}
      >
        {/* Dark gradient overlay on the left so text stays readable */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 45%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Left-side menu panel */}
        <div
          style={{
            position: "relative",
            paddingLeft: "60px",
            paddingTop: "40px",
            paddingBottom: "40px",
            maxWidth: "420px",
          }}
        >
          <div
            style={{
              fontSize: "35px",
              color: "#c8a84b",
              letterSpacing: "10px",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            DOG: THE HOTDOG WARS
          </div>
          {/* Player info */}
          <div style={{ marginBottom: "32px" }}>
            <div
              style={{
                fontSize: "25px",
                color: "#c8a84b",
                letterSpacing: "2px",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              {gameState.user.isGuest ? "Playing as Guest" : `Welcome back`}
            </div>
            <div
              style={{
                fontSize: "29px",
                fontWeight: "bold",
                color: "#fff",
                textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              }}
            >
              {gameState.user.username}
            </div>
            {!gameState.user.isGuest && (
              <div
                style={{ fontSize: "14px", color: "#e8c96a", marginTop: "4px" }}
              >
                🪙{" "}
                {gameState.user.currency === 67 ? "∞" : gameState.user.currency}{" "}
                Gold
              </div>
            )}
          </div>

          {/* Menu items */}
          <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {menuItems.map((item) => (
              <MenuButton
                key={item.label}
                label={item.label}
                onClick={item.onClick}
                onHover={playHover}
              />
            ))}
          </nav>
        </div>
      </div>
    );
  }

  if (gameState.gamePhase === "difficultySelect") {
    const startStoryModeAtDifficulty = (difficulty: Difficulty) => {
      setGameState((prev) => ({
        ...prev,
        difficulty,
        gamePhase: "introCutscene",
        gameMode: "story",
        gameStartTime: null,
        health: prev.maxHealth,
        ammo: weapons[1].maxAmmo,
        reserveAmmo: getStartingReserveAmmo(1),
        grenades: 3,
        maxGrenades: 6,
        coins: 0,
        enemies: [],
        bullets: [],
        grenadeProjectiles: [],
        explosions: [],
        enemyProjectiles: [],
        story: {
          currentSettlement: 0,
          alliesRescued: 0,
          settlementsConquered: [],
          totalKills: 0,
        },
        sessionShotsFired: 0,
        sessionShotsHit: 0,
        level: {
          currentLevel: 0,
          killsThisLevel: 0,
          giantsSpawnedThisLevel: 0,
        },
        adminLevelTestMode: false,
        adminTestStartLevel: null,
      }));
    };

    const difficultyCards: Array<{
      key: Difficulty;
      subtitle: string;
      details: string;
    }> = [
      {
        key: "normal",
        subtitle: "Balanced baseline experience",
        details: "Standard enemy damage and health.",
      },
      {
        key: "hard",
        subtitle: "Enemies hit harder and survive longer",
        details: "Higher enemy damage and health.",
      },
      {
        key: "extreme",
        subtitle: "Maximum pressure combat",
        details:
          "Hard bonuses plus faster enemy movement and faster attacks.",
      },
    ];

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: 'url("/HomeScreen.png")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.68)",
          }}
        />
        <div
          style={{
            position: "relative",
            width: "min(960px, 92vw)",
            padding: "28px",
            border: "1px solid rgba(232,160,32,0.35)",
            background: "rgba(14,9,4,0.92)",
          }}
        >
          <div
            style={{
              color: "#e8c96a",
              letterSpacing: "3px",
              textTransform: "uppercase",
              fontSize: "30px",
              marginBottom: "8px",
            }}
          >
            Select Difficulty
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", marginBottom: "20px" }}>
            Pick how dangerous story mode enemies should be.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            {difficultyCards.map((difficultyCard) => {
              const config = DIFFICULTY_SETTINGS[difficultyCard.key];
              return (
                <button
                  key={difficultyCard.key}
                  onClick={() => startStoryModeAtDifficulty(difficultyCard.key)}
                  style={{
                    textAlign: "left",
                    padding: "16px",
                    border: "1px solid rgba(232,160,32,0.4)",
                    background: "rgba(35,20,8,0.95)",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontSize: "24px",
                      color: "#f0d28a",
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    {config.label}
                  </div>
                  <div style={{ fontSize: "14px", opacity: 0.95, marginBottom: "6px" }}>
                    {difficultyCard.subtitle}
                  </div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.72)" }}>
                    {difficultyCard.details}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setGameState((prev) => ({ ...prev, gamePhase: "menu" }))}
            style={{
              padding: "10px 16px",
              background: "rgba(45,28,11,0.95)",
              color: "#f3dca2",
              border: "1px solid rgba(232,160,32,0.35)",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            Back
          </button>
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
      <LeaderboardPage
        onBack={() => setGameState((prev) => ({ ...prev, gamePhase: "menu" }))}
      />
    );
  }

  // Settings Page
  if (gameState.gamePhase === "settings") {
    return <SettingsPage gameState={gameState} setGameState={setGameState} />;
  }

  // Shop Page
  if (gameState.gamePhase === "shop") {
    return (
      <>
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "#0d0a05",
            display: "flex",
            flexDirection: "column",
            color: "rgba(220,210,195,0.9)",
            fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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
              padding: "16px 24px",
              background: "rgba(18,12,5,0.95)",
              borderBottom: "1px solid rgba(232,160,32,0.25)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#c8a84b",
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                }}
              >
                DOG: The Hotdog Wars
              </div>
              <h1
                style={{
                  fontSize: "28px",
                  margin: "2px 0 0 0",
                  fontWeight: "700",
                  color: "#e8a020",
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                }}
              >
                ARMORY
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "17px", color: "#c8a84b" }}>
                🪙{" "}
                {gameState.user.currency === 67 ? "∞" : gameState.user.currency}
              </span>
              <button
                onClick={() =>
                  setGameState((prev) => ({ ...prev, gamePhase: "menu" }))
                }
                style={{
                  padding: "10px 22px",
                  fontSize: "13px",
                  fontWeight: "700",
                  background: "transparent",
                  color: "rgba(200,168,75,0.85)",
                  border: "1px solid rgba(232,160,32,0.35)",
                  cursor: "pointer",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  fontFamily:
                    '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                }}
              >
                ← BACK
              </button>
            </div>
          </div>

          {/* Buy Gold Section - Compact */}
          <div
            style={{
              marginBottom: "15px",
              padding: "12px 18px",
              background: "rgba(18,12,5,0.95)",
              border: "1px solid rgba(232,160,32,0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "15px",
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <span style={{ fontSize: "16px", fontWeight: "bold" }}>
                  💎 BUY GOLD
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {currencyBundles.map((bundle) => (
                  <button
                    key={bundle.id}
                    onClick={() => handleBuyCurrency(bundle)}
                    style={{
                      background: bundle.popular
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(0,0,0,0.3)",
                      border: bundle.popular
                        ? "2px solid #fff"
                        : "1px solid rgba(255,255,255,0.3)",
                      borderRadius: "6px",
                      padding: "6px 12px",
                      cursor: "pointer",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span style={{ fontSize: "14px", fontWeight: "bold" }}>
                      {bundle.gold.toLocaleString()} 💰
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        background: "rgba(232,160,32,0.9)",
                        color: "#0d0a05",
                        padding: "2px 8px",
                        fontWeight: "700",
                      }}
                    >
                      {bundle.price}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p
              style={{
                margin: "8px 0 0 0",
                fontSize: "11px",
                textAlign: "center",
                opacity: 0.7,
              }}
            >
              ⚠️ Test mode - No real charges
            </p>
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
              const canAfford =
                hasUnlimitedGold || gameState.user.currency >= item.price;

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
                Flamethrower: "#ff6a00",
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
                        fontSize: "13px",
                        background: canAfford
                          ? "rgba(232,160,32,0.9)"
                          : "rgba(60,50,35,0.7)",
                        color: canAfford ? "#0d0a05" : "rgba(160,140,110,0.6)",
                        border: "none",
                        cursor: canAfford ? "pointer" : "not-allowed",
                        fontWeight: "700",
                        letterSpacing: "1px",
                        textTransform: "uppercase" as const,
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
        {paymentModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.85)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
              pointerEvents: "all",
            }}
          >
            <div
              style={{
                background: "#1a1a2e",
                border: "1px solid #333",
                borderRadius: "14px",
                padding: "32px",
                width: "100%",
                maxWidth: "420px",
                color: "white",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
              }}
            >
              <h2 style={{ margin: "0 0 6px 0", fontSize: "22px" }}>
                💳 Purchase Gold
              </h2>
              <p
                style={{
                  margin: "0 0 20px 0",
                  color: "#aaa",
                  fontSize: "14px",
                }}
              >
                {paymentModal.gold.toLocaleString()} 💰 for{" "}
                <strong style={{ color: "#f39c12" }}>
                  {paymentModal.price}
                </strong>
              </p>
              <p
                style={{
                  margin: "0 0 20px 0",
                  padding: "10px",
                  borderRadius: "8px",
                  background: "rgba(255,193,7,0.15)",
                  border: "1px solid rgba(255,193,7,0.3)",
                  color: "#ffc107",
                  fontSize: "12px",
                  textAlign: "center",
                }}
              >
                ⚠️ Test mode — no real charges will be made
              </p>
              <label style={{ display: "block", marginBottom: "14px" }}>
                <span style={{ fontSize: "13px", color: "#aaa" }}>
                  Card Number
                </span>
                <input
                  type="text"
                  placeholder="1234 5678 9012 3456"
                  value={payCardNumber}
                  onChange={(e) =>
                    setPayCardNumber(formatCardNumber(e.target.value))
                  }
                  maxLength={19}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "6px",
                    padding: "10px 12px",
                    borderRadius: "7px",
                    border: "1px solid #444",
                    background: "#0f1a30",
                    color: "white",
                    fontSize: "16px",
                    letterSpacing: "2px",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <div
                style={{ display: "flex", gap: "12px", marginBottom: "14px" }}
              >
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: "13px", color: "#aaa" }}>
                    Expiry (MM/YY)
                  </span>
                  <input
                    type="text"
                    placeholder="MM/YY"
                    value={payExpiry}
                    onChange={(e) => setPayExpiry(formatExpiry(e.target.value))}
                    maxLength={5}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "6px",
                      padding: "10px 12px",
                      borderRadius: "7px",
                      border: "1px solid #444",
                      background: "#0f1a30",
                      color: "white",
                      fontSize: "15px",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: "13px", color: "#aaa" }}>CVC</span>
                  <input
                    type="text"
                    placeholder="123"
                    value={payCVC}
                    onChange={(e) =>
                      setPayCVC(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    maxLength={4}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "6px",
                      padding: "10px 12px",
                      borderRadius: "7px",
                      border: "1px solid #444",
                      background: "#0f1a30",
                      color: "white",
                      fontSize: "15px",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
              </div>
              {paymentError && (
                <p
                  style={{
                    margin: "0 0 14px 0",
                    padding: "10px",
                    borderRadius: "7px",
                    background: "rgba(231,76,60,0.15)",
                    border: "1px solid rgba(231,76,60,0.4)",
                    color: "#e74c3c",
                    fontSize: "13px",
                  }}
                >
                  {paymentError}
                </p>
              )}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={handleSubmitPayment}
                  disabled={paymentLoading}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "8px",
                    border: "none",
                    background: paymentLoading
                      ? "rgba(130,110,70,0.5)"
                      : "rgba(232,160,32,0.9)",
                    color: paymentLoading ? "rgba(200,180,140,0.6)" : "#0d0a05",
                    fontSize: "15px",
                    fontWeight: "700",
                    cursor: paymentLoading ? "not-allowed" : "pointer",
                    fontFamily:
                      '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                  }}
                >
                  {paymentLoading
                    ? "Processing..."
                    : `Pay ${paymentModal.price}`}
                </button>
                <button
                  onClick={() => {
                    setPaymentModal(null);
                    setPaymentError("");
                  }}
                  disabled={paymentLoading}
                  style={{
                    padding: "12px 20px",
                    borderRadius: "8px",
                    border: "1px solid #555",
                    background: "transparent",
                    color: "#aaa",
                    fontSize: "15px",
                    cursor: "pointer",
                    fontFamily:
                      '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Level Transition Cutscene with Shop
  if (gameState.gamePhase === "levelTransition") {
    const completedLevel = LEVELS[gameState.level.currentLevel];
    const nextLevel = LEVELS[gameState.level.currentLevel + 1];

    // Determine weapon unlock for this level
    // Weapons are grouped by tier: T1=[1], T2=[2,5], T3=[3], T4=[4], T5=[6]
    let weaponUnlock = null;
    let additionalUnlocks: number[] = [];
    if (gameState.level.currentLevel === 0) {
      weaponUnlock = { id: 2, name: weapons[2].name }; // Mustard Launcher after level 1
      additionalUnlocks = [5]; // Also unlock Spreadshot (both are tier 2)
    } else if (gameState.level.currentLevel === 1) {
      weaponUnlock = { id: 3, name: weapons[3].name }; // Topping Shooter after level 2
    } else if (gameState.level.currentLevel === 3) {
      weaponUnlock = { id: 4, name: weapons[4].name }; // Lacerating Muffin Generator after level 4
    }

    const tokenCost = 2 + gameState.tokensPurchased;
    const canAffordToken = gameState.coins >= tokenCost;

    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "#0d0a05",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(220,210,195,0.9)",
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
          zIndex: 1000,
          overflow: "auto",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "44px 50px",
            background: "rgba(18,12,5,0.96)",
            border: "1px solid rgba(232,160,32,0.3)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
            maxWidth: "800px",
            margin: "20px",
            width: "100%",
          }}
        >
          <h2
            style={{
              fontSize: "40px",
              fontWeight: "700",
              marginBottom: "20px",
              color: "#e8a020",
              letterSpacing: "4px",
              textTransform: "uppercase",
              textShadow: "0 0 20px rgba(232,160,32,0.4)",
            }}
          >
            LEVEL COMPLETE
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
                🔓{" "}
                {additionalUnlocks.length > 0
                  ? "TIER 2 WEAPONS UNLOCKED!"
                  : "WEAPON UNLOCKED!"}
              </h3>
              <p style={{ fontSize: "18px", fontWeight: "bold" }}>
                {weaponUnlock.name}
                {additionalUnlocks.length > 0 && (
                  <> & {weapons[additionalUnlocks[0]]?.name}</>
                )}
              </p>
              {additionalUnlocks.length > 0 && (
                <p style={{ fontSize: "14px", opacity: 0.8, marginTop: "5px" }}>
                  Use the Loadout menu to switch between tier 2 weapons!
                </p>
              )}
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "15px",
                alignItems: "stretch",
              }}
            >
              {/* Health Buff Card */}
              <div
                style={{
                  padding: "15px",
                  background: "rgba(0,0,0,0.4)",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: "180px",
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
                        marginTop: "8px",
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
                        coins: prev.coins - tokenCost,
                        maxHealth: prev.maxHealth + 10,
                        health: Math.min(prev.health + 10, prev.maxHealth + 10),
                        tokensPurchased: prev.tokensPurchased + 1,
                      }));
                    }
                  }}
                  disabled={!canAffordToken}
                  style={{
                    marginTop: "15px",
                    padding: "10px 20px",
                    fontSize: "16px",
                    fontWeight: "bold",
                    background: canAffordToken ? "#4caf50" : "#444",
                    color: canAffordToken ? "white" : "#666",
                    border: "none",
                    borderRadius: "8px",
                    cursor: canAffordToken ? "pointer" : "not-allowed",
                    fontFamily:
                      '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                  }}
                >
                  BUY - {tokenCost} 💰
                </button>
              </div>

              {/* Weapon Augments Card */}
              <div
                style={{
                  padding: "15px",
                  background: "rgba(0,0,0,0.4)",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: "180px",
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
                    ⚔️ Weapon Augments
                  </div>
                  <div style={{ fontSize: "14px", opacity: 0.7 }}>
                    Spend coins on run-based weapon and player upgrades.
                  </div>
                </div>

                <button
                  onClick={() => setShowAugmentCategoryModal(true)}
                  style={{
                    marginTop: "15px",
                    padding: "10px 20px",
                    fontSize: "16px",
                    fontWeight: "bold",
                    background: "#ff9800",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontFamily:
                      '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                  }}
                >
                  OPEN AUGMENTS
                </button>
              </div>
            </div>
          </div>

          {showAugmentCategoryModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                background: "rgba(0,0,0,0.78)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1200,
                padding: "20px",
              }}
              onClick={() => {
                setShowAugmentCategoryModal(false);
                setSelectedAugmentCategory(null);
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  maxWidth: "620px",
                  background: "rgba(18,12,5,0.98)",
                  border: "1px solid rgba(255,152,0,0.45)",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.85)",
                  padding: "30px",
                  textAlign: "center",
                }}
              >
                {selectedAugmentCategory === null ? (
                  <>
                    <h3
                      style={{
                        fontSize: "28px",
                        marginBottom: "10px",
                        color: "#ff9800",
                        letterSpacing: "2px",
                        textTransform: "uppercase",
                      }}
                    >
                      Weapon Augments
                    </h3>

                    <p
                      style={{
                        fontSize: "15px",
                        opacity: 0.8,
                        marginBottom: "24px",
                        lineHeight: "1.6",
                      }}
                    >
                      Choose which upgrade path to improve this run.
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "14px",
                        marginBottom: "18px",
                      }}
                    >
                      <button
                        onClick={() => setSelectedAugmentCategory("weapons")}
                        style={{
                          padding: "18px 16px",
                          fontSize: "18px",
                          fontWeight: "bold",
                          background: "rgba(33,150,243,0.85)",
                          color: "white",
                          border: "none",
                          borderRadius: "10px",
                          cursor: "pointer",
                        }}
                      >
                        Weapons
                      </button>

                      <button
                        onClick={() => setSelectedAugmentCategory("user")}
                        style={{
                          padding: "18px 16px",
                          fontSize: "18px",
                          fontWeight: "bold",
                          background: "rgba(156,39,176,0.85)",
                          color: "white",
                          border: "none",
                          borderRadius: "10px",
                          cursor: "pointer",
                        }}
                      >
                        User
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setShowAugmentCategoryModal(false);
                        setSelectedAugmentCategory(null);
                      }}
                      style={{
                        padding: "12px 20px",
                        fontSize: "14px",
                        fontWeight: "bold",
                        background: "transparent",
                        color: "rgba(200,168,75,0.9)",
                        border: "1px solid rgba(232,160,32,0.35)",
                        cursor: "pointer",
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                        fontFamily:
                          '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                      }}
                    >
                      Close
                    </button>
                  </>
                ) : (
                  <>
                    <h3
                      style={{
                        fontSize: "28px",
                        marginBottom: "10px",
                        color:
                          selectedAugmentCategory === "weapons"
                            ? "#42a5f5"
                            : "#ba68c8",
                        letterSpacing: "2px",
                        textTransform: "uppercase",
                      }}
                    >
                      {selectedAugmentCategory === "weapons"
                        ? "Weapons Upgrades"
                        : "User Upgrades"}
                    </h3>

                    <p
                      style={{
                        fontSize: "15px",
                        opacity: 0.8,
                        marginBottom: "24px",
                        lineHeight: "1.6",
                      }}
                    >
                      Buy active upgrades now. Placeholder cards are marked
                      "coming soon".
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "14px",
                        marginBottom: "18px",
                      }}
                    >
                      {selectedAugmentCategory === "weapons" ? (
                        <>
                          <div
                            style={{
                              padding: "16px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(66,165,245,0.35)",
                              borderRadius: "10px",
                              textAlign: "left",
                            }}
                          >
                            <button
                              onClick={() => {
                                const damageCost = 3 + gameState.augmentLevels.weaponDamage;

                                if (gameState.coins < damageCost) return;

                                setGameState((prev) => ({
                                  ...prev,
                                  coins: prev.coins - damageCost,
                                  augmentLevels: {
                                    ...prev.augmentLevels,
                                    weaponDamage: prev.augmentLevels.weaponDamage + 1,
                                  },
                                }));
                              }}
                              style={{
                                padding: "16px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(66,165,245,0.35)",
                                borderRadius: "10px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontSize: "17px", fontWeight: "bold", marginBottom: "6px" }}>
                                Damage
                              </div>
                              <div style={{ fontSize: "13px", opacity: 0.75, marginBottom: "8px" }}>
                                Increase weapon damage per shot.
                              </div>
                              <div style={{ fontSize: "12px", color: "#90caf9" }}>
                                Level: {gameState.augmentLevels.weaponDamage}
                              </div>
                              <div style={{ fontSize: "12px", color: "#ffd54f", marginTop: "4px" }}>
                                Cost: {3 + gameState.augmentLevels.weaponDamage} coins
                              </div>
                            </button>
                            
                            <div style={{ fontSize: "13px", opacity: 0.75 }}>
                              Increase weapon damage per shot.
                            </div>
                          </div>

                          <div
                            style={{
                              padding: "16px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(66,165,245,0.35)",
                              borderRadius: "10px",
                              textAlign: "left",
                            }}
                          >
                            <button
                              onClick={() => {
                                const fireRateCost = 3 + gameState.augmentLevels.weaponFireRate;

                                if (gameState.coins < fireRateCost) return;

                                setGameState((prev) => ({
                                  ...prev,
                                  coins: prev.coins - fireRateCost,
                                  augmentLevels: {
                                    ...prev.augmentLevels,
                                    weaponFireRate: prev.augmentLevels.weaponFireRate + 1,
                                  },
                                }));
                              }}
                              style={{
                                padding: "16px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(66,165,245,0.35)",
                                borderRadius: "10px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontSize: "17px", fontWeight: "bold", marginBottom: "6px" }}>
                                Fire Rate
                              </div>
                              <div style={{ fontSize: "13px", opacity: 0.75, marginBottom: "8px" }}>
                                Increase firing speed and reduce shot delay.
                              </div>
                              <div style={{ fontSize: "12px", color: "#90caf9" }}>
                                Level: {gameState.augmentLevels.weaponFireRate}
                              </div>
                              <div style={{ fontSize: "12px", color: "#ffd54f", marginTop: "4px" }}>
                                Cost: {3 + gameState.augmentLevels.weaponFireRate} coins
                              </div>
                            </button>
                          </div>

                          <div
                            style={{
                              padding: "16px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(66,165,245,0.35)",
                              borderRadius: "10px",
                              textAlign: "left",
                            }}
                          >
                            <button
                              onClick={() => {
                                const reloadCost = 3 + gameState.augmentLevels.weaponReloadSpeed;

                                if (gameState.coins < reloadCost) return;

                                setGameState((prev) => ({
                                  ...prev,
                                  coins: prev.coins - reloadCost,
                                  augmentLevels: {
                                    ...prev.augmentLevels,
                                    weaponReloadSpeed: prev.augmentLevels.weaponReloadSpeed + 1,
                                  },
                                }));
                              }}
                              style={{
                                padding: "16px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(66,165,245,0.35)",
                                borderRadius: "10px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontSize: "17px", fontWeight: "bold", marginBottom: "6px" }}>
                                Reload Speed
                              </div>
                              <div style={{ fontSize: "13px", opacity: 0.75, marginBottom: "8px" }}>
                                Reduce reload downtime.
                              </div>
                              <div style={{ fontSize: "12px", color: "#90caf9" }}>
                                Level: {gameState.augmentLevels.weaponReloadSpeed}
                              </div>
                              <div style={{ fontSize: "12px", color: "#ffd54f", marginTop: "4px" }}>
                                Cost: {3 + gameState.augmentLevels.weaponReloadSpeed} coins
                              </div>
                            </button>
                          </div>

                          <div
                            style={{
                              padding: "16px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(66,165,245,0.35)",
                              borderRadius: "10px",
                              textAlign: "left",
                            }}
                          >
                            <button
                              onClick={() => {
                                const spreadCost = 3 + gameState.augmentLevels.weaponSpreadControl;

                                if (gameState.coins < spreadCost) return;

                                setGameState((prev) => ({
                                  ...prev,
                                  coins: prev.coins - spreadCost,
                                  augmentLevels: {
                                    ...prev.augmentLevels,
                                    weaponSpreadControl: prev.augmentLevels.weaponSpreadControl + 1,
                                  },
                                }));
                              }}
                              style={{
                                padding: "16px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(66,165,245,0.35)",
                                borderRadius: "10px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontSize: "17px", fontWeight: "bold", marginBottom: "6px" }}>
                                Spread Control
                              </div>
                              <div style={{ fontSize: "13px", opacity: 0.75, marginBottom: "8px" }}>
                                Tighten pellet spread and improve accuracy.
                              </div>
                              <div style={{ fontSize: "12px", color: "#90caf9" }}>
                                Level: {gameState.augmentLevels.weaponSpreadControl}
                              </div>
                              <div style={{ fontSize: "12px", color: "#ffd54f", marginTop: "4px" }}>
                                Cost: {3 + gameState.augmentLevels.weaponSpreadControl} coins
                              </div>
                            </button>
                          </div>

                        </>
                      ) : (
                        <>
                          <div
                            style={{
                              padding: "16px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(186,104,200,0.35)",
                              borderRadius: "10px",
                              textAlign: "left",
                            }}
                          >
                            <button
                              onClick={() => {
                                const healthCost = 3 + gameState.augmentLevels.userMaxHealth;

                                if (gameState.coins < healthCost) return;

                                setGameState((prev) => ({
                                  ...prev,
                                  coins: prev.coins - healthCost,
                                  maxHealth: prev.maxHealth + 10,
                                  health: Math.min(prev.health + 10, prev.maxHealth + 10),
                                  augmentLevels: {
                                    ...prev.augmentLevels,
                                    userMaxHealth: prev.augmentLevels.userMaxHealth + 1,
                                  },
                                }));
                              }}
                              style={{
                                padding: "16px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(186,104,200,0.35)",
                                borderRadius: "10px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontSize: "17px", fontWeight: "bold", marginBottom: "6px" }}>
                                Max Health
                              </div>
                              <div style={{ fontSize: "13px", opacity: 0.75, marginBottom: "8px" }}>
                                Increase total health pool by +10.
                              </div>
                              <div style={{ fontSize: "12px", color: "#ce93d8" }}>
                                Level: {gameState.augmentLevels.userMaxHealth}
                              </div>
                              <div style={{ fontSize: "12px", color: "#ffd54f", marginTop: "4px" }}>
                                Cost: {3 + gameState.augmentLevels.userMaxHealth} coins
                              </div>
                            </button>
                            
                            <div style={{ fontSize: "13px", opacity: 0.75 }}>
                              Increase total health pool.
                            </div>
                          </div>

                          <div
                            style={{
                              padding: "16px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(186,104,200,0.35)",
                              borderRadius: "10px",
                              textAlign: "left",
                            }}
                          >
                            <button
                              onClick={() => {
                                const moveSpeedCost = 3 + gameState.augmentLevels.userMoveSpeed;

                                if (gameState.coins < moveSpeedCost) return;

                                setGameState((prev) => ({
                                  ...prev,
                                  coins: prev.coins - moveSpeedCost,
                                  augmentLevels: {
                                    ...prev.augmentLevels,
                                    userMoveSpeed: prev.augmentLevels.userMoveSpeed + 1,
                                  },
                                }));
                              }}
                              style={{
                                padding: "16px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(186,104,200,0.35)",
                                borderRadius: "10px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontSize: "17px", fontWeight: "bold", marginBottom: "6px" }}>
                                Move Speed
                              </div>
                              <div style={{ fontSize: "13px", opacity: 0.75, marginBottom: "8px" }}>
                                Increase movement speed for this run.
                              </div>
                              <div style={{ fontSize: "12px", color: "#ce93d8" }}>
                                Level: {gameState.augmentLevels.userMoveSpeed}
                              </div>
                              <div style={{ fontSize: "12px", color: "#ffd54f", marginTop: "4px" }}>
                                Cost: {3 + gameState.augmentLevels.userMoveSpeed} coins
                              </div>
                            </button>
                          </div>

                          <div
                            style={{
                              padding: "16px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(186,104,200,0.35)",
                              borderRadius: "10px",
                              textAlign: "left",
                            }}
                          >
                            <button
                              onClick={() => {
                                const regenCost = 3 + gameState.augmentLevels.userRegen;

                                if (gameState.coins < regenCost) return;

                                setGameState((prev) => ({
                                  ...prev,
                                  coins: prev.coins - regenCost,
                                  augmentLevels: {
                                    ...prev.augmentLevels,
                                    userRegen: prev.augmentLevels.userRegen + 1,
                                  },
                                }));
                              }}
                              style={{
                                padding: "16px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(186,104,200,0.35)",
                                borderRadius: "10px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontSize: "17px", fontWeight: "bold", marginBottom: "6px" }}>
                                Regen
                              </div>
                              <div style={{ fontSize: "13px", opacity: 0.75, marginBottom: "8px" }}>
                                Regenerate health over time.
                              </div>
                              <div style={{ fontSize: "12px", color: "#ce93d8" }}>
                                Level: {gameState.augmentLevels.userRegen}
                              </div>
                              <div style={{ fontSize: "12px", color: "#ffd54f", marginTop: "4px" }}>
                                Cost: {3 + gameState.augmentLevels.userRegen} coins
                              </div>
                            </button>
                          </div>

                          <div
                            style={{
                              padding: "16px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(186,104,200,0.35)",
                              borderRadius: "10px",
                              textAlign: "left",
                            }}
                          >
                            <button
                              onClick={() => {
                                const resistCost = 3 + gameState.augmentLevels.userDamageResist;

                                if (gameState.coins < resistCost) return;

                                setGameState((prev) => ({
                                  ...prev,
                                  coins: prev.coins - resistCost,
                                  augmentLevels: {
                                    ...prev.augmentLevels,
                                    userDamageResist: prev.augmentLevels.userDamageResist + 1,
                                  },
                                }));
                              }}
                              style={{
                                padding: "16px",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(186,104,200,0.35)",
                                borderRadius: "10px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontSize: "17px", fontWeight: "bold", marginBottom: "6px" }}>
                                Damage Resist
                              </div>
                              <div style={{ fontSize: "13px", opacity: 0.75, marginBottom: "8px" }}>
                                Reduce incoming enemy damage.
                              </div>
                              <div style={{ fontSize: "12px", color: "#ce93d8" }}>
                                Level: {gameState.augmentLevels.userDamageResist}
                              </div>
                              <div style={{ fontSize: "12px", color: "#ffd54f", marginTop: "4px" }}>
                                Cost: {3 + gameState.augmentLevels.userDamageResist} coins
                              </div>
                            </button>
                          </div>

                        </>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        onClick={() => setSelectedAugmentCategory(null)}
                        style={{
                          padding: "12px 20px",
                          fontSize: "14px",
                          fontWeight: "bold",
                          background: "transparent",
                          color: "rgba(200,168,75,0.9)",
                          border: "1px solid rgba(232,160,32,0.35)",
                          cursor: "pointer",
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          fontFamily:
                            '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                        }}
                      >
                        Back
                      </button>

                      <button
                        onClick={() => {
                          setShowAugmentCategoryModal(false);
                          setSelectedAugmentCategory(null);
                        }}
                        style={{
                          padding: "12px 20px",
                          fontSize: "14px",
                          fontWeight: "bold",
                          background: "transparent",
                          color: "rgba(200,168,75,0.9)",
                          border: "1px solid rgba(232,160,32,0.35)",
                          cursor: "pointer",
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          fontFamily:
                            '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

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
                let newUnlockedWeapons = prev.unlockedWeapons;

                if (
                  weaponUnlock &&
                  !prev.unlockedWeapons.includes(weaponUnlock.id)
                ) {
                  newUnlockedWeapons = [...newUnlockedWeapons, weaponUnlock.id];
                }

                for (const additionalId of additionalUnlocks) {
                  if (!newUnlockedWeapons.includes(additionalId)) {
                    newUnlockedWeapons = [...newUnlockedWeapons, additionalId];
                  }
                }

                return {
                  ...prev,
                  gamePhase: "playing",
                  health: prev.maxHealth,
                  ammo: weapons[prev.currentWeapon].maxAmmo,
                  reserveAmmo: getStartingReserveAmmo(prev.currentWeapon),
                  grenades: 3,
                  maxGrenades: 6,
                  enemies: [],
                  bullets: [],
                  grenadeProjectiles: [],
                  explosions: [],
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
              padding: "16px 40px",
              fontSize: "17px",
              fontWeight: "700",
              background: "rgba(232,160,32,0.9)",
              color: "#0d0a05",
              border: "none",
              cursor: "pointer",
              letterSpacing: "2px",
              textTransform: "uppercase",
              fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
            }}
          >
            CONTINUE →
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
          background: "#0d0a05",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(220,210,195,0.9)",
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "50px",
            background: "rgba(18,12,5,0.96)",
            border: "1px solid rgba(232,160,32,0.3)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
            maxWidth: "700px",
          }}
        >
          <h2
            style={{
              fontSize: "48px",
              fontWeight: "700",
              marginBottom: "20px",
              color: "#e8a020",
              textShadow: "0 0 20px rgba(232,160,32,0.4)",
              letterSpacing: "4px",
              textTransform: "uppercase",
            }}
          >
            VICTORY
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

                if (
                  !gameState.adminLevelTestMode &&
                  !gameState.user.isGuest &&
                  gameState.user.username
                ) {
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

                  // Save run time to leaderboard
                  if (gameState.gameStartTime) {
                    const runTimeMs = Date.now() - gameState.gameStartTime;
                    const totalSeconds = Math.floor(runTimeMs / 1000);
                    const hours = Math.floor(totalSeconds / 3600);
                    const minutes = Math.floor((totalSeconds % 3600) / 60);
                    const seconds = totalSeconds % 60;
                    const fastestRunTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

                    try {
                      await fetch("/api/leaderboard", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ fastestRunTime }),
                      });
                      console.log("Leaderboard entry saved:", fastestRunTime);
                    } catch (error) {
                      console.error("Failed to save leaderboard entry:", error);
                    }
                  }
                }

                setGameState((prev) => ({
                  ...prev,
                  health: 100,
                  ammo: weapons[1].maxAmmo,
                  reserveAmmo: getStartingReserveAmmo(1),
                  grenades: 3,
                  maxGrenades: 6,
                  coins: 0,
                  gamePhase: "playing",
                  enemies: [],
                  bullets: [],
                  grenadeProjectiles: [],
                  explosions: [],
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
                  unlockedWeapons: [1, 6],
                  inventory: [],
                  augmentLevels: {
                    weaponDamage: 0,
                    weaponFireRate: 0,
                    weaponReloadSpeed: 0,
                    weaponSpreadControl: 0,
                    userMaxHealth: 0,
                    userMoveSpeed: 0,
                    userRegen: 0,
                    userDamageResist: 0,
                  },
                  gameStartTime: Date.now(),
                  user: {
                    ...prev.user,
                    currency: newCurrency,
                  },
                }));
                document.body.requestPointerLock();
              }}
              style={{
                padding: "14px 30px",
                fontSize: "16px",
                fontWeight: "700",
                background: "rgba(232,160,32,0.9)",
                color: "#0d0a05",
                border: "none",
                cursor: "pointer",
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
              }}
            >
              PLAY AGAIN
            </button>
            <button
              onClick={async () => {
                const newCurrency = gameState.user.isGuest
                  ? gameState.user.currency
                  : gameState.user.currency + currencyEarned;

                if (
                  !gameState.adminLevelTestMode &&
                  !gameState.user.isGuest &&
                  gameState.user.username
                ) {
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

                  // Save run time to leaderboard
                  if (gameState.gameStartTime) {
                    const runTimeMs = Date.now() - gameState.gameStartTime;
                    const totalSeconds = Math.floor(runTimeMs / 1000);
                    const hours = Math.floor(totalSeconds / 3600);
                    const minutes = Math.floor((totalSeconds % 3600) / 60);
                    const seconds = totalSeconds % 60;
                    const fastestRunTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

                    try {
                      await fetch("/api/leaderboard", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ fastestRunTime }),
                      });
                      console.log("Leaderboard entry saved:", fastestRunTime);
                    } catch (error) {
                      console.error("Failed to save leaderboard entry:", error);
                    }
                  }
                }

                setGameState((prev) => ({
                  ...prev,
                  health: 100,
                  ammo: weapons[1].maxAmmo,
                  reserveAmmo: getStartingReserveAmmo(1),
                  grenades: 3,
                  maxGrenades: 6,
                  coins: 0,
                  gamePhase: "menu",
                  enemies: [],
                  bullets: [],
                  grenadeProjectiles: [],
                  explosions: [],
                  enemyProjectiles: [],
                  lastDamageTime: 0,
                  gameStartTime: null,
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
                padding: "12px 30px",
                fontSize: "15px",
                fontWeight: "600",
                background: "transparent",
                color: "rgba(200,168,75,0.85)",
                border: "1px solid rgba(232,160,32,0.35)",
                cursor: "pointer",
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
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
          background: "#0d0a05",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(220,210,195,0.9)",
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "44px 48px",
            background: "rgba(18,12,5,0.96)",
            border: "1px solid rgba(180,40,40,0.4)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.9)",
          }}
        >
          <h2
            style={{
              fontSize: "48px",
              fontWeight: "700",
              marginBottom: "20px",
              color: "#c0392b",
              letterSpacing: "4px",
              textTransform: "uppercase",
              textShadow: "0 0 20px rgba(192,57,43,0.5)",
            }}
          >
            GAME OVER
          </h2>
          <div style={{ marginBottom: "30px", fontSize: "20px" }}>
            {gameState.gameMode === "endless" && (
              <div style={{ marginBottom: "10px" }}>
                Total Kills:{" "}
                <span style={{ color: "#E91E63" }}>
                  {gameState.story.totalKills}
                </span>
              </div>
            )}
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
                {gameState.gameMode === "endless"
                  ? "Kills saved to leaderboard!"
                  : "Currency added to your account!"}
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
                if (
                  !gameState.adminLevelTestMode &&
                  !gameState.user.isGuest &&
                  gameState.user.username
                ) {
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
                  health: prev.maxHealth,
                  ammo: weapons[1].maxAmmo,
                  reserveAmmo: getStartingReserveAmmo(1),
                  grenades: 3,
                  maxGrenades: 6,
                  coins: 0,
                  gamePhase: "playing",
                  gameStartTime: Date.now(),
                  enemies: [],
                  bullets: [],
                  grenadeProjectiles: [],
                  explosions: [],
                  enemyProjectiles: [],
                  lastDamageTime: 0,
                  story: {
                    currentSettlement: 0,
                    alliesRescued: 0,
                    settlementsConquered: [],
                    totalKills: 0,
                  },
                  level: {
                    currentLevel: prev.gameMode === "endless" ? 1 : 0,
                    killsThisLevel: 0,
                    giantsSpawnedThisLevel: 0,
                  },
                  unlockedWeapons: [1, 6],
                  inventory: [],
                  user: {
                    ...prev.user,
                    currency: newCurrency,
                  },
                }));
                document.body.requestPointerLock();
              }}
              style={{
                padding: "14px 30px",
                fontSize: "16px",
                fontWeight: "700",
                background: "rgba(232,160,32,0.9)",
                color: "#0d0a05",
                border: "none",
                cursor: "pointer",
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
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
                if (
                  !gameState.adminLevelTestMode &&
                  !gameState.user.isGuest &&
                  gameState.user.username
                ) {
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
                  ammo: weapons[1].maxAmmo,
                  reserveAmmo: getStartingReserveAmmo(1),
                  grenades: 3,
                  maxGrenades: 6,
                  coins: 0,
                  gamePhase: "menu",
                  enemies: [],
                  bullets: [],
                  grenadeProjectiles: [],
                  explosions: [],
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
                padding: "12px 30px",
                fontSize: "15px",
                fontWeight: "600",
                background: "transparent",
                color: "rgba(200,168,75,0.85)",
                border: "1px solid rgba(232,160,32,0.35)",
                cursor: "pointer",
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
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
          background: "rgba(8,5,2,0.88)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(220,210,195,0.9)",
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "48px 56px",
            background: "rgba(18,12,5,0.97)",
            border: "1px solid rgba(232,160,32,0.28)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.9)",
            minWidth: "320px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              color: "#c8a84b",
              letterSpacing: "3px",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Paused
          </div>
          <h2
            style={{
              fontSize: "36px",
              fontWeight: "700",
              marginBottom: "32px",
              color: "#e8a020",
              letterSpacing: "4px",
              textTransform: "uppercase",
            }}
          >
            GAME PAUSED
          </h2>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <button
              onClick={() => {
                setGameState((prev) => ({ ...prev, gamePhase: "playing" }));
                document.body.requestPointerLock();
              }}
              style={{
                padding: "14px 30px",
                fontSize: "16px",
                fontWeight: "700",
                background: "rgba(232,160,32,0.9)",
                color: "#0d0a05",
                border: "none",
                cursor: "pointer",
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
              }}
            >
              RESUME
            </button>
            <button
              onClick={() => {
                setGameState((prev) => ({
                  ...prev,
                  gamePhase: "settings",
                  previousGamePhase: "paused",
                }));
              }}
              style={{
                padding: "12px 30px",
                fontSize: "15px",
                fontWeight: "600",
                background: "transparent",
                color: "rgba(200,168,75,0.85)",
                border: "1px solid rgba(232,160,32,0.35)",
                cursor: "pointer",
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
              }}
            >
              SETTINGS
            </button>
            <button
              onClick={() => {
                setGameState((prev) => ({
                  ...prev,
                  gamePhase: "menu",
                  health: 100,
                  ammo: weapons[1].maxAmmo,
                  reserveAmmo: getStartingReserveAmmo(1),
                  grenades: 3,
                  maxGrenades: 6,
                  coins: 0,
                  enemies: [],
                  bullets: [],
                  grenadeProjectiles: [],
                  explosions: [],
                  enemyProjectiles: [],
                  lastDamageTime: 0,
                  gameStartTime: null,
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
                }));
              }}
              style={{
                padding: "11px 30px",
                fontSize: "13px",
                fontWeight: "500",
                background: "transparent",
                color: "rgba(160,100,80,0.75)",
                border: "1px solid rgba(160,80,60,0.25)",
                cursor: "pointer",
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
                width: "100%",
              }}
            >
              EXIT TO MAIN MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.gamePhase !== "playing") return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 100,
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
        }}
      >
        <Crosshair />
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
          <div
            style={{
              marginTop: "6px",
              fontSize: "12px",
              color: "#ffcc80",
              fontWeight: "bold",
            }}
          >
            💣 Grenades: {gameState.grenades}/{gameState.maxGrenades}
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
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              marginBottom: "4px",
            }}
          >
            {gameState.isReloading ? "RELOADING..." : gameState.ammo}
          </div>
          <div style={{ fontSize: "12px", opacity: 0.8 }}>
            / {weapons[gameState.currentWeapon].maxAmmo}
          </div>
          <div style={{ fontSize: "11px", marginTop: "4px", opacity: 0.9 }}>
            Reserve: {gameState.reserveAmmo}
          </div>
          <div style={{ fontSize: "10px", marginTop: "4px", opacity: 0.6 }}>
            AMMO
          </div>
          <div style={{ fontSize: "8px", marginTop: "4px", opacity: 0.5 }}>
            Keys: 1-4 switch | R reload | Q hold/throw grenade
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
            fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
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

        {(() => {
          const bossEnemy = gameState.enemies.find((enemy) => enemy.type === "boss");
          if (!bossEnemy) return null;
          const bossMaxHealth =
            ENEMY_ARCHETYPES.boss.health *
            DIFFICULTY_SETTINGS[gameState.difficulty].enemyHealthMultiplier;
          const bossHealthPercent = Math.max(
            0,
            Math.min(100, (bossEnemy.health / bossMaxHealth) * 100),
          );

          return (
            <div
              style={{
                position: "absolute",
                top: "26px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "min(820px, 74vw)",
                background: "rgba(15,0,18,0.82)",
                border: "2px solid rgba(186,104,200,0.85)",
                borderRadius: "10px",
                padding: "8px 12px 10px",
                color: "white",
                textAlign: "center",
                fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
              }}
            >
              <div style={{ fontSize: "15px", letterSpacing: "2px", marginBottom: "6px" }}>
                BOSS
              </div>
              <div
                style={{
                  width: "100%",
                  height: "18px",
                  background: "rgba(255,255,255,0.2)",
                  borderRadius: "999px",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.35)",
                }}
              >
                <div
                  style={{
                    width: `${bossHealthPercent}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #6a1b9a, #ba68c8)",
                    transition: "width 0.25s ease",
                  }}
                />
              </div>
              <div style={{ marginTop: "4px", fontSize: "12px", opacity: 0.95 }}>
                {Math.max(0, Math.ceil(bossEnemy.health))} / {Math.ceil(bossMaxHealth)}
              </div>
            </div>
          );
        })()}
      </div>
    </>
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

  // Heartbeat: send +1 minute to the server every 60 seconds while playing
  useEffect(() => {
    if (gameState.user.isGuest) return;

    const interval = setInterval(() => {
      fetch("/api/stats/heartbeat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: 1 }),
      }).catch((err) => console.error("Heartbeat failed:", err));
    }, 60000);

    return () => clearInterval(interval);
  }, [gameState.user.isGuest]);

  useFrame((state) => {
    if (gameState.gamePhase !== "playing") return;

    const currentLevel = gameState.level.currentLevel;

    // Boss arena: force a single boss spawn and block all regular wave spawns.
    if (currentLevel === 7) {
      const bossAlreadyAlive = gameState.enemies.some((enemy) => enemy.type === "boss");
      if (!bossAlreadyAlive) {
        const difficulty = DIFFICULTY_SETTINGS[gameState.difficulty];
        const bossArchetype = ENEMY_ARCHETYPES.boss;

        setGameState((prev) => ({
          ...prev,
          enemies: [
            ...prev.enemies,
            {
              id: `boss_${Date.now()}_${Math.random()}`,
              type: "boss",
              behavior: "chase",
              position: [0, 1, 0],
              velocity: [0, 0, 0],
              movementDirection: [0, 0, 1],
              isMoving: false,
              health: bossArchetype.health * difficulty.enemyHealthMultiplier,
              nextAttackAt: Date.now() + 5000,
              bossBeamEndsAt: 0,
              bossLastBeamDamageAt: 0,
            },
          ],
        }));
      }
      return;
    }

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
      // Level 0 (Bun Valley):       melee only
      // Level 1 (Robot Factory):    40% melee, 30% ranged, 30% rat
      // Level 2 (Palace):           25% melee, 25% ranged, 20% giant (max 3), 30% rat
      // Level 3 (Crimson Battlefield): 20% melee, 15% ranged, 30% giant (max 8), 35% rat
      // Level 4 (Mustard Mountain): 20% melee, 10% ranged, 30% giant (max 10), 40% rat
      let enemyType: EnemyType = "melee";

      if (currentLevel === 0) {
        // Level 1 (Bun Valley): melee only
        enemyType = "melee";
      } else if (currentLevel === 1) {
        // Level 2 (Robot Factory): 40% melee, 30% ranged, 30% rat
        const roll = Math.random();
        if (roll < 0.4) {
          enemyType = "melee";
        } else if (roll < 0.7) {
          enemyType = "ranged";
        } else {
          enemyType = "rat";
        }
      } else if (currentLevel === 2) {
        // Level 3 (Palace): 25% melee, 25% ranged, 20% giant (max 3), 30% rat
        const roll = Math.random();
        if (roll < 0.2 && gameState.level.giantsSpawnedThisLevel < 3) {
          enemyType = "giant";
        } else if (roll < 0.45) {
          enemyType = "melee";
        } else if (roll < 0.7) {
          enemyType = "ranged";
        } else {
          enemyType = "rat";
        }
      } else if (currentLevel === 3) {
      // Level 4 (Crimson Battlefield): 18% melee, 14% ranged, 14% flying hybrid, 30% giant (max 8), 24% rat
        const roll = Math.random();
        if (roll < 0.3 && gameState.level.giantsSpawnedThisLevel < 8) {
          enemyType = "giant";
        } else if (roll < 0.44) {
          enemyType = "melee";
        } else if (roll < 0.58) {
          enemyType = "ranged";
        } else if (roll < 0.72) {
          enemyType = "flyingHybrid";
        } else {
          enemyType = "rat";
        }
      } else if (currentLevel === 4) {
        // Level 5 (Mustard Mountain): 16% melee, 10% ranged, 14% flying hybrid, 30% giant (max 10), 30% rat
        const roll = Math.random();
        if (roll < 0.3 && gameState.level.giantsSpawnedThisLevel < 10) {
          enemyType = "giant";
        } else if (roll < 0.46) {
          enemyType = "melee";
        } else if (roll < 0.56) {
          enemyType = "ranged";
        } else if (roll < 0.7) {
          enemyType = "flyingHybrid";
        } else {
          enemyType = "rat";
        }
      } else if (currentLevel === 5) {
        // Level 6 (Skybridge): 13% melee, 18% ranged, 14% flying hybrid, 35% giant (max 14), 20% rat
        const roll = Math.random();
        if (roll < 0.35 && gameState.level.giantsSpawnedThisLevel < 14) {
          enemyType = "giant";
        } else if (roll < 0.48) {
          enemyType = "melee";
        } else if (roll < 0.66) {
          enemyType = "ranged";
        } else if (roll < 0.8) {
          enemyType = "flyingHybrid";
        } else {
          enemyType = "rat";
        }
      } else {
        // Level 7+ (Reactor): 8% melee, 20% ranged, 17% flying hybrid, 40% giant (max 18), 15% rat
        const roll = Math.random();
        if (roll < 0.4 && gameState.level.giantsSpawnedThisLevel < 18) {
          enemyType = "giant";
        } else if (roll < 0.48) {
          enemyType = "melee";
        } else if (roll < 0.68) {
          enemyType = "ranged";
        } else if (roll < 0.85) {
          enemyType = "flyingHybrid";
        } else {
          enemyType = "rat";
        }
      }

      const archetype = ENEMY_ARCHETYPES[enemyType];
      const difficulty = DIFFICULTY_SETTINGS[gameState.difficulty];

      setGameState((prev) => ({
        ...prev,
        enemies: [
          ...prev.enemies,
          {
            id: `enemy_${Date.now()}_${Math.random()}`,
            type: enemyType,
            behavior: ENEMY_BEHAVIOR_BY_TYPE[enemyType],
            position: [x, enemyType === "flyingHybrid" ? 2.6 : 1, z],
            velocity: [0, 0, 0],
            movementDirection: [0, 0, 1],
            isMoving: false,
            health: archetype.health * difficulty.enemyHealthMultiplier,
            nextAttackAt: 0,
            attackPatternStep: enemyType === "flyingHybrid" ? "volley" : undefined,
            bossBeamEndsAt: 0,
            bossLastBeamDamageAt: 0,
            burningUntil: 0,
            nextBurnTickAt: 0,
            burnDamagePerTick: 0,
            burnTickMs: 0,
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
    ammo: weapons[1].maxAmmo,
    reserveAmmo: getStartingReserveAmmo(1),
    grenades: 3,
    maxGrenades: 6,
    coins: 0, // Changed from score to coins
    gamePhase: "login",
    enemies: [],
    bullets: [],
    grenadeProjectiles: [],
    explosions: [],
    enemyProjectiles: [],
    pickups: [],
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
    unlockedWeapons: [1, 6], // Start with pistol and flamethrower
    inventory: [], // No items purchased yet
    tokensPurchased: 0, // No health buff tokens purchased yet
    augmentLevels: {
      weaponDamage: 0,
      weaponFireRate: 0,
      weaponReloadSpeed: 0,
      weaponSpreadControl: 0,
      userMaxHealth: 0,
      userMoveSpeed: 0,
      userRegen: 0,
      userDamageResist: 0,
    },
    lastDamageTime: 0,
    currentWeapon: 1, // Start with pistol
    isReloading: false,
    reloadStartTime: 0,
    reloadDuration: 0,
    lastShotTime: 0,
    previousGamePhase: null,
    equippedWeaponSkins: {
      1: "Default",
      2: "Default",
      3: "Default",
      4: "Default",
      5: "Default",
      6: "Default",
    },
    loadout: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6 }, // Tier -> weapon ID: T1=Ketchup, T2=Mustard(default), T3=Topping, T4=Muffin, T5=Flamethrower
    isAdmin: false,
    gameStartTime: null,
    gameMode: "story",
    difficulty: "normal",
    sessionShotsFired: 0,
    sessionShotsHit: 0,
    adminLevelTestMode: false,
    adminTestStartLevel: null,
  });

  // On mount, check if the user already has an active session
  const [sessionChecking, setSessionChecking] = useState(true);
  useEffect(() => {
    const { setKeybinding, setNormalSensitivity } = useSettings.getState();
    fetch("/api/session", { credentials: "include" })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const params = new URLSearchParams(window.location.search);
          const adminTestLevelParam = params.get("adminTestLevel");
          const parsedAdminTestLevel = adminTestLevelParam
            ? parseInt(adminTestLevelParam, 10)
            : NaN;
          const hasValidAdminTestLevel =
            !Number.isNaN(parsedAdminTestLevel) &&
            parsedAdminTestLevel >= 1 &&
            parsedAdminTestLevel <= LEVELS.length;
          const shouldStartAdminLevelTest =
            !!data.isAdmin && hasValidAdminTestLevel;
          const adminFullLoadoutEnabled =
            !!data.isAdmin &&
            (localStorage.getItem("adminFullLoadout") === "true" ||
              shouldStartAdminLevelTest);
          const unlockedWeaponsAtStart = adminFullLoadoutEnabled
            ? [1, 2, 3, 4, 5, 6]
            : [1, 6];

          setGameState((prev) => ({
            ...prev,
            gamePhase: shouldStartAdminLevelTest ? "playing" : "menu",
            user: {
              username: data.user.username,
              isGuest: false,
              currency: data.currency,
              cosmetics: data.cosmetics || [],
              equippedSkin: null,
            },
            isAdmin: data.isAdmin || false,
            gameMode: "story",
            gameStartTime: shouldStartAdminLevelTest ? Date.now() : null,
            health: prev.maxHealth,
            ammo: weapons[1].maxAmmo,
            reserveAmmo: getStartingReserveAmmo(1),
            grenades: 3,
            maxGrenades: 6,
            coins: 0,
            enemies: [],
            bullets: [],
            grenadeProjectiles: [],
            explosions: [],
            enemyProjectiles: [],
            story: {
              currentSettlement: 0,
              alliesRescued: 0,
              settlementsConquered: [],
              totalKills: 0,
            },
            sessionShotsFired: 0,
            sessionShotsHit: 0,
            level: {
              currentLevel: shouldStartAdminLevelTest
                ? parsedAdminTestLevel - 1
                : 0,
              killsThisLevel: 0,
              giantsSpawnedThisLevel: 0,
            },
            unlockedWeapons: unlockedWeaponsAtStart,
            adminLevelTestMode: shouldStartAdminLevelTest,
            adminTestStartLevel: shouldStartAdminLevelTest
              ? parsedAdminTestLevel
              : null,
          }));
          if (adminTestLevelParam) {
            window.history.replaceState({}, "", window.location.pathname);
          }
          // Restore saved settings
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
              setKeybinding("grenade", s.grenade_key || "KeyQ");
              const sens = parseFloat(s.mouse_sensitivity);
              setNormalSensitivity(isNaN(sens) ? 1 : sens);
            }
          } catch (_) {}
        }
      })
      .catch(() => {})
      .finally(() => setSessionChecking(false));
  }, []);

  // Reset test-mode progress when returning to menu so future runs start fresh.
  useEffect(() => {
    if (gameState.gamePhase !== "menu" || !gameState.adminLevelTestMode) return;
    setGameState((prev) => ({
      ...prev,
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
      adminLevelTestMode: false,
      adminTestStartLevel: null,
    }));
  }, [gameState.gamePhase, gameState.adminLevelTestMode]);

  // Release pointer lock when entering non-game phases so UI is clickable
  useEffect(() => {
    if (
      gameState.gamePhase === "levelTransition" ||
      gameState.gamePhase === "paused"
    ) {
      document.exitPointerLock();
    }
  }, [gameState.gamePhase]);

  useEffect(() => {
    if (gameState.gamePhase !== "playing") {
      return;
    }

    const spawnSupplyCrate = () => {
      setGameState((prev) => {
        if (prev.gamePhase !== "playing") {
          return prev;
        }

        const activeSupplyCrates = prev.pickups.filter(
          (pickup) => pickup.type === "supplyCrate",
        ).length;
        if (activeSupplyCrates >= MAX_ACTIVE_SUPPLY_CRATES) {
          return prev;
        }

        const spawnPositions = getPickupSpawnPositionsForLevel(
          prev.level.currentLevel,
        );

        const occupiedPositions = new Set(
          prev.pickups.map((pickup) => pickup.position.join(",")),
        );
        const availablePositions = spawnPositions.filter(
          (position) => !occupiedPositions.has(position.join(",")),
        );

        if (availablePositions.length === 0) {
          return prev;
        }

        const randomPosition =
          availablePositions[Math.floor(Math.random() * availablePositions.length)];

        return {
          ...prev,
          pickups: [
            ...prev.pickups,
            createSupplyCrate(prev.level.currentLevel, randomPosition),
          ],
        };
      });
    };

    const spawnAmmoCrate = () => {
      setGameState((prev) => {
        if (prev.gamePhase !== "playing") {
          return prev;
        }

        const activeAmmoCrates = prev.pickups.filter(
          (pickup) => pickup.type === "ammoCrate",
        ).length;
        if (activeAmmoCrates >= MAX_ACTIVE_AMMO_CRATES) {
          return prev;
        }

        const spawnPositions = getPickupSpawnPositionsForLevel(
          prev.level.currentLevel,
        );

        const occupiedPositions = new Set(
          prev.pickups.map((pickup) => pickup.position.join(",")),
        );
        const availablePositions = spawnPositions.filter(
          (position) => !occupiedPositions.has(position.join(",")),
        );

        if (availablePositions.length === 0) {
          return prev;
        }

        const randomPosition =
          availablePositions[Math.floor(Math.random() * availablePositions.length)];

        return {
          ...prev,
          pickups: [
            ...prev.pickups,
            createAmmoCrate(prev.level.currentLevel, randomPosition),
          ],
        };
      });
    };

    setGameState((prev) => ({
      ...prev,
      pickups: [],
    }));

    spawnSupplyCrate();
    spawnAmmoCrate();
    const spawnTimer = window.setInterval(
      spawnSupplyCrate,
      SUPPLY_CRATE_SPAWN_INTERVAL_MS,
    );
    const ammoSpawnTimer = window.setInterval(
      spawnAmmoCrate,
      AMMO_CRATE_SPAWN_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(spawnTimer);
      window.clearInterval(ammoSpawnTimer);
    };
  }, [gameState.gamePhase, gameState.level.currentLevel]);

  // Show a brief loading screen while checking session to avoid login flash
  if (sessionChecking) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#0d0a05",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: '"Trebuchet MS", "Arial Narrow", Arial, sans-serif',
          color: "rgba(232,160,32,0.9)",
          fontSize: "22px",
          letterSpacing: "3px",
          textTransform: "uppercase",
        }}
      >
        Loading...
      </div>
    );
  }

  if (
    gameState.gamePhase !== "playing" &&
    gameState.gamePhase !== "paused" &&
    gameState.gamePhase !== "levelTransition"
  ) {
    return <HUD gameState={gameState} setGameState={setGameState} />;
  }

  return (
    <>
      <Canvas
        camera={{ position: [0, 2.4, 0], fov: 75, near: 0.1, far: 1000 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ width: "100vw", height: "100vh" }}
        onClick={() => {
          if (
            gameState.gamePhase === "playing" &&
            !document.pointerLockElement
          ) {
            document.body.requestPointerLock();
          }
        }}
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

          {gameState.grenadeProjectiles.map((grenade) => (
            <GrenadeProjectile key={grenade.id} grenade={grenade} />
          ))}

          {gameState.explosions.map((explosion) => (
            <ExplosionEffect key={explosion.id} explosion={explosion} />
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
