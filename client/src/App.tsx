import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import { KeyboardControls } from "@react-three/drei";
import { useAudio } from "./lib/stores/useAudio";
import { useFPS } from "./lib/stores/useFPS";
import "@fontsource/inter";

// Import our FPS game components
import Game from "./components/fps/Game";
import Menu from "./components/fps/Menu";
import HUD from "./components/fps/HUD";

// Define control keys for the FPS game
const controls = [
  { name: "forward", keys: ["KeyW", "ArrowUp"] },
  { name: "backward", keys: ["KeyS", "ArrowDown"] },
  { name: "leftward", keys: ["KeyA", "ArrowLeft"] },
  { name: "rightward", keys: ["KeyD", "ArrowRight"] },
  { name: "jump", keys: ["Space"] },
  { name: "shoot", keys: ["MouseLeft"] },
  { name: "reload", keys: ["KeyR"] },
  { name: "pause", keys: ["Escape"] },
];

// Main App component
function App() {
  const { gameState } = useFPS();
  const [showCanvas, setShowCanvas] = useState(false);

  // Show the canvas once everything is loaded
  useEffect(() => {
    setShowCanvas(true);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {showCanvas && (
        <KeyboardControls map={controls}>
          {gameState === 'menu' && <Menu />}

          {(gameState === 'playing' || gameState === 'paused') && (
            <>
              <Canvas
                shadows
                camera={{
                  position: [0, 1.6, 0], // Player height
                  fov: 75,
                  near: 0.1,
                  far: 1000
                }}
                gl={{
                  antialias: true,
                  powerPreference: "high-performance"
                }}
              >
                <color attach="background" args={["#87CEEB"]} />
                
                <Suspense fallback={null}>
                  <Game />
                </Suspense>
              </Canvas>
              <HUD />
            </>
          )}
        </KeyboardControls>
      )}
    </div>
  );
}

export default App;
