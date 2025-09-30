import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type GameState = "menu" | "introCutscene" | "playing" | "paused" | "gameOver" | "victory";

export interface PlayerStats {
  health: number;
  maxHealth: number;
  ammo: number;
  maxAmmo: number;
  score: number;
  kills: number;
}

export interface StoryProgress {
  currentSettlement: number;
  totalSettlements: number;
  alliesRescued: number;
  settlementsConquered: string[];
}

export const SETTLEMENTS = [
  "Bun Valley Outpost",
  "Condiment Creek Base",
  "Relish Ridge Fortress",
  "Mustard Mountain Stronghold"
];

export interface Enemy {
  id: string;
  position: [number, number, number];
  health: number;
  maxHealth: number;
  isAlive: boolean;
}

export interface Bullet {
  id: string;
  position: [number, number, number];
  direction: [number, number, number];
  speed: number;
  damage: number;
  timeToLive: number;
}

interface FPSState {
  gameState: GameState;
  playerStats: PlayerStats;
  storyProgress: StoryProgress;
  enemies: Enemy[];
  bullets: Bullet[];
  isPointerLocked: boolean;
  
  // Actions
  setGameState: (state: GameState) => void;
  startGame: () => void;
  startIntroCutscene: () => void;
  skipCutscene: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => void;
  
  // Player actions
  takeDamage: (damage: number) => void;
  heal: (amount: number) => void;
  shoot: () => boolean;
  reload: () => void;
  addScore: (points: number) => void;
  
  // Story actions
  rescueAlly: () => void;
  conquerSettlement: () => void;
  
  // Enemy actions
  spawnEnemy: (position: [number, number, number]) => void;
  removeEnemy: (id: string) => void;
  damageEnemy: (id: string, damage: number) => void;
  
  // Bullet actions
  addBullet: (bullet: Omit<Bullet, 'id'>) => void;
  removeBullet: (id: string) => void;
  updateBullets: (deltaTime: number) => void;
  
  // Pointer lock
  setPointerLocked: (locked: boolean) => void;
}

export const useFPS = create<FPSState>()(
  subscribeWithSelector((set, get) => ({
    gameState: "menu",
    playerStats: {
      health: 100,
      maxHealth: 100,
      ammo: 30,
      maxAmmo: 30,
      score: 0,
      kills: 0,
    },
    storyProgress: {
      currentSettlement: 0,
      totalSettlements: SETTLEMENTS.length,
      alliesRescued: 0,
      settlementsConquered: [],
    },
    enemies: [],
    bullets: [],
    isPointerLocked: false,
    
    setGameState: (state) => set({ gameState: state }),
    
    startIntroCutscene: () => {
      set({ gameState: "introCutscene" });
    },
    
    skipCutscene: () => {
      set({ gameState: "playing" });
    },
    
    startGame: () => {
      set({
        gameState: "playing",
        playerStats: {
          health: 100,
          maxHealth: 100,
          ammo: 30,
          maxAmmo: 30,
          score: 0,
          kills: 0,
        },
        storyProgress: {
          currentSettlement: 0,
          totalSettlements: SETTLEMENTS.length,
          alliesRescued: 0,
          settlementsConquered: [],
        },
        enemies: [],
        bullets: [],
      });
    },
    
    pauseGame: () => {
      const { gameState } = get();
      if (gameState === "playing") {
        set({ gameState: "paused" });
      }
    },
    
    resumeGame: () => {
      const { gameState } = get();
      if (gameState === "paused") {
        set({ gameState: "playing" });
      }
    },
    
    endGame: () => {
      set({ gameState: "gameOver" });
    },
    
    takeDamage: (damage) => {
      set((state) => {
        const newHealth = Math.max(0, state.playerStats.health - damage);
        const newStats = { ...state.playerStats, health: newHealth };
        
        if (newHealth <= 0) {
          return {
            playerStats: newStats,
            gameState: "gameOver"
          };
        }
        
        return { playerStats: newStats };
      });
    },
    
    heal: (amount) => {
      set((state) => ({
        playerStats: {
          ...state.playerStats,
          health: Math.min(state.playerStats.maxHealth, state.playerStats.health + amount)
        }
      }));
    },
    
    shoot: () => {
      const state = get();
      if (state.playerStats.ammo > 0) {
        set((state) => ({
          playerStats: {
            ...state.playerStats,
            ammo: state.playerStats.ammo - 1
          }
        }));
        return true;
      }
      return false;
    },
    
    reload: () => {
      set((state) => ({
        playerStats: {
          ...state.playerStats,
          ammo: state.playerStats.maxAmmo
        }
      }));
    },
    
    addScore: (points) => {
      set((state) => ({
        playerStats: {
          ...state.playerStats,
          score: state.playerStats.score + points,
          kills: state.playerStats.kills + 1
        }
      }));
    },
    
    rescueAlly: () => {
      set((state) => ({
        storyProgress: {
          ...state.storyProgress,
          alliesRescued: state.storyProgress.alliesRescued + 1
        }
      }));
    },
    
    conquerSettlement: () => {
      set((state) => {
        const nextSettlement = state.storyProgress.currentSettlement + 1;
        const settlementName = SETTLEMENTS[state.storyProgress.currentSettlement];
        const newConquered = [...state.storyProgress.settlementsConquered, settlementName];
        
        // Check if all settlements are conquered (victory condition)
        if (nextSettlement >= SETTLEMENTS.length) {
          return {
            storyProgress: {
              ...state.storyProgress,
              currentSettlement: nextSettlement,
              settlementsConquered: newConquered
            },
            gameState: "victory" as GameState
          };
        }
        
        return {
          storyProgress: {
            ...state.storyProgress,
            currentSettlement: nextSettlement,
            settlementsConquered: newConquered
          }
        };
      });
    },
    
    spawnEnemy: (position) => {
      const enemy: Enemy = {
        id: `enemy_${Date.now()}_${Math.random()}`,
        position,
        health: 50,
        maxHealth: 50,
        isAlive: true,
      };
      
      set((state) => ({
        enemies: [...state.enemies, enemy]
      }));
    },
    
    removeEnemy: (id) => {
      set((state) => ({
        enemies: state.enemies.filter(enemy => enemy.id !== id)
      }));
    },
    
    damageEnemy: (id, damage) => {
      set((state) => ({
        enemies: state.enemies.map(enemy => {
          if (enemy.id === id) {
            const newHealth = Math.max(0, enemy.health - damage);
            return {
              ...enemy,
              health: newHealth,
              isAlive: newHealth > 0
            };
          }
          return enemy;
        })
      }));
    },
    
    addBullet: (bulletData) => {
      const bullet: Bullet = {
        ...bulletData,
        id: `bullet_${Date.now()}_${Math.random()}`,
      };
      
      set((state) => ({
        bullets: [...state.bullets, bullet]
      }));
    },
    
    removeBullet: (id) => {
      set((state) => ({
        bullets: state.bullets.filter(bullet => bullet.id !== id)
      }));
    },
    
    updateBullets: (deltaTime) => {
      set((state) => ({
        bullets: state.bullets
          .map(bullet => ({
            ...bullet,
            position: [
              bullet.position[0] + bullet.direction[0] * bullet.speed * deltaTime,
              bullet.position[1] + bullet.direction[1] * bullet.speed * deltaTime,
              bullet.position[2] + bullet.direction[2] * bullet.speed * deltaTime,
            ] as [number, number, number],
            timeToLive: bullet.timeToLive - deltaTime
          }))
          .filter(bullet => bullet.timeToLive > 0)
      }));
    },
    
    setPointerLocked: (locked) => set({ isPointerLocked: locked }),
  }))
);
