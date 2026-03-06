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

// Inside the SimpleFPS component, add the following useEffect for time tracking
// This should be placed where the game state is managed

// Example placement (adjust according to your actual component structure):
// useEffect(() => {
//   const interval = setInterval(() => {
//     if (gameState.gamePhase === 'playing' && userId) {
//       updateTimePlayed(userId);
//     }
//   }, 60000);
//   return () => clearInterval(interval);
// }, [gameState.gamePhase, userId]);

// Example placement for death tracking:
// When the player dies, call:
// updateDeaths(userId);

// ... (rest of the code remains unchanged)

// Note: The actual placement of the above useEffect and updateDeaths call
// depends on where your game state and userId are defined and managed.

// ... (rest of the file remains unchanged)

// Add the following useEffect to the SimpleFPS component to handle time tracking
// This should be placed where the game state is managed

// Example placement:
// useEffect(() => {
//   const interval = setInterval(() => {
//     if (gameState.gamePhase === 'playing' && userId) {
//       updateTimePlayed(userId);
//     }
//   }, 60000);
//   return () => clearInterval(interval);
// }, [gameState.gamePhase, userId]);

// Add the following logic to call updateDeaths when the player dies
// This should be placed where the player's health reaches zero

// Example placement:
// useEffect(() => {
//   if (gameState.health <= 0 && gameState.gamePhase === 'playing') {
//     updateDeaths(userId);
//   }
// }, [gameState.health, gameState.gamePhase, userId]);

// ... (rest of the file remains unchanged)