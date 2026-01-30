import { create } from "zustand";

/**
 * Game modes
 */
export type GameMode = "story" | "endless";

/**
 * Game phases
 */
export type GamePhase =
  | "menu"
  | "playing"
  | "levelTransition"
  | "victory"
  | "gameover";

/**
 * Game store
 */
interface GameState {
  gamePhase: GamePhase;
  setGamePhase: (phase: GamePhase) => void;

  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;
}

export const useGame = create<GameState>((set) => ({
  // Default state
  gamePhase: "menu",
  gameMode: "story",

  // Setters
  setGamePhase: (phase) => set({ gamePhase: phase }),
  setGameMode: (mode) => set({ gameMode: mode }),
}));
