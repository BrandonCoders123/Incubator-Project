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

import { useSettings } from "./lib/stores/useSettings";
import { getLocalStorage, setLocalStorage } from "./lib/utils";

import Crosshair from "./api/components/fps/Crosshair";

import Menu from "./api/components/fps/Menu";
import { useGame } from "./lib/stores/useGame";
import { updateDeaths, updateTimePlayed } from "./api/backend";

// ... (previous code remains unchanged)

export default function SimpleFPS() {
  const { gameState, setGameState, userId } = useGame();
  // ... (other code remains unchanged)

  // Time tracking
  useEffect(() => {
    const interval = setInterval(() => {
      if (gameState.gamePhase === 'playing' && userId) {
        updateTimePlayed(userId);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [gameState.gamePhase, userId]);

  // Death tracking
  useEffect(() => {
    if (gameState.health <= 0 && gameState.gamePhase === 'playing') {
      updateDeaths(userId);
    }
  }, [gameState.health, gameState.gamePhase, userId]);

  // ... (rest of the code remains unchanged)
}