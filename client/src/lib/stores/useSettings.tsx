import { create } from "zustand";

export type ActionName =
  | "forward"
  | "backward"
  | "leftward"
  | "rightward"
  | "jump"
  | "reload"
  | "pause"
  | "weapon1"
  | "weapon2"
  | "weapon3"
  | "weapon4";

export type Keybindings = Record<ActionName, string[]>;

// Default controls – this matches what you already had in SimpleFPS.tsx
const defaultKeybindings: Keybindings = {
  forward: ["KeyW", "ArrowUp"],
  backward: ["KeyS", "ArrowDown"],
  leftward: ["KeyA", "ArrowLeft"],
  rightward: ["KeyD", "ArrowRight"],
  jump: ["Space"],
  reload: ["KeyR"],
  pause: ["Escape"],
  weapon1: ["Digit1"],
  weapon2: ["Digit2"],
  weapon3: ["Digit3"],
  weapon4: ["Digit4"],
};

interface SettingsState {
  // Controls
  keybindings: Keybindings;
  setKeybinding: (action: ActionName, keyCode: string) => void;
  resetDefaults: () => void;

  // Sensitivity multipliers (1 = default, 0.5 = half, 2 = double, etc)
  normalSensitivity: number;
  aimSensitivity: number;
  setNormalSensitivity: (value: number) => void;
  setAimSensitivity: (value: number) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  keybindings: { ...defaultKeybindings },

  normalSensitivity: 1,   // 1x base sensitivity
  aimSensitivity: 0.5,    // 0.5x base sensitivity when aiming

  setKeybinding: (action, keyCode) =>
    set((state) => ({
      keybindings: {
        ...state.keybindings,
        [action]: [keyCode],
      },
    })),

  resetDefaults: () =>
    set(() => ({
      keybindings: { ...defaultKeybindings },
      normalSensitivity: 1,
      aimSensitivity: 0.5,
    })),

  setNormalSensitivity: (value) => set({ normalSensitivity: value }),
  setAimSensitivity: (value) => set({ aimSensitivity: value }),
}));
