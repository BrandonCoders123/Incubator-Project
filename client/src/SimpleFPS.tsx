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

// HomeScreen Component
const HomeScreen = ({ onStartGame, onSettings, onLeaderboard, onQuit }: {
  onStartGame: () => void;
  onSettings: () => void;
  onLeaderboard: () => void;
  onQuit: () => void;
}) => (
  <div style={
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundImage: 'url("/HomeScreen.png")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'white',
    fontFamily: 'Arial, sans-serif',
    zIndex: 1000,
  }}>
    <h1 style={{ fontSize: '48px', marginBottom: '20px', textShadow: '2px 2px 4px #000000' }}>DOOM-STYLE GAME</h1>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <button
        style={
          padding: '12px 24px',
          fontSize: '20px',
          backgroundColor: '#ff0000',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
          transition: 'background-color 0.3s',
        }}
        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#cc0000'}
        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ff0000'}
        onClick={onStartGame}
      >
        Start Game
      </button>
      <button
        style={
          padding: '12px 24px',
          fontSize: '20px',
          backgroundColor: '#ff0000',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
          transition: 'background-color 0.3s',
        }}
        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#cc0000'}
        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ff0000'}
        onClick={onSettings}
      >
        Settings
      </button>
      <button
        style={
          padding: '12px 24px',
          fontSize: '20px',
          backgroundColor: '#ff0000',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
          transition: 'background-color 0.3s',
        }}
        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#cc0000'}
        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ff0000'}
        onClick={onLeaderboard}
      >
        Leaderboard
      </button>
      <button
        style={
          padding: '12px 24px',
          fontSize: '20px',
          backgroundColor: '#ff0000',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
          transition: 'background-color 0.3s',
        }}
        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#cc0000'}
        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ff0000'}
        onClick={onQuit}
      >
        Quit
      </button>
    </div>
  </div>
);

export default function SimpleFPS() {
  const { gameState, setGameState, userId } = useGame();

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

  return (
    <>
      {gameState.gamePhase === "menu" && (
        <HomeScreen
          onStartGame={() => setGameState(prev => ({ ...prev, gamePhase: "playing" }))}
          onSettings={() => setGameState(prev => ({ ...prev, gamePhase: "settings" }))}
          onLeaderboard={() => setGameState(prev => ({ ...prev, gamePhase: "leaderboard" }))}
          onQuit={() => setGameState(prev => ({ ...prev, gamePhase: "quit" }))}
        />
      )}
      {/* Existing Canvas and other components */}
      <Canvas>
        {/* Your existing canvas content */}
      </Canvas>
    </>
  );
}

// Rest of your existing code remains unchanged
// ...