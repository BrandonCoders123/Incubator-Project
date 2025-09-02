import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { KeyboardControls, useKeyboardControls, useTexture } from "@react-three/drei";
import { Suspense, useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import "@fontsource/inter";

// Simple game state
interface GameState {
  health: number;
  ammo: number;
  score: number;
  gamePhase: 'menu' | 'playing' | 'paused';
  enemies: Array<{
    id: string;
    position: [number, number, number];
    health: number;
  }>;
  bullets: Array<{
    id: string;
    position: [number, number, number];
    direction: [number, number, number];
  }>;
}

// Controls configuration
const controls = [
  { name: "forward", keys: ["KeyW", "ArrowUp"] },
  { name: "backward", keys: ["KeyS", "ArrowDown"] },
  { name: "leftward", keys: ["KeyA", "ArrowLeft"] },
  { name: "rightward", keys: ["KeyD", "ArrowRight"] },
  { name: "jump", keys: ["Space"] },
  { name: "reload", keys: ["KeyR"] },
];

// Environment Component
function Environment() {
  const grassTexture = useTexture('/textures/grass.png');
  const asphaltTexture = useTexture('/textures/asphalt.png');
  const woodTexture = useTexture('/textures/wood.jpg');
  
  grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(10, 10);
  
  return (
    <>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshLambertMaterial map={grassTexture} />
      </mesh>
      
      {/* Walls */}
      <mesh position={[25, 5, 0]} castShadow>
        <boxGeometry args={[1, 10, 50]} />
        <meshLambertMaterial map={woodTexture} />
      </mesh>
      <mesh position={[-25, 5, 0]} castShadow>
        <boxGeometry args={[1, 10, 50]} />
        <meshLambertMaterial map={woodTexture} />
      </mesh>
      <mesh position={[0, 5, 25]} castShadow>
        <boxGeometry args={[50, 10, 1]} />
        <meshLambertMaterial map={woodTexture} />
      </mesh>
      <mesh position={[0, 5, -25]} castShadow>
        <boxGeometry args={[50, 10, 1]} />
        <meshLambertMaterial map={woodTexture} />
      </mesh>

      {/* Central platform */}
      <mesh position={[0, 0.5, 0]} receiveShadow castShadow>
        <boxGeometry args={[8, 1, 8]} />
        <meshLambertMaterial map={asphaltTexture} />
      </mesh>
    </>
  );
}

// Player Component
function Player({ 
  gameState, 
  setGameState 
}: { 
  gameState: GameState; 
  setGameState: React.Dispatch<React.SetStateAction<GameState>> 
}) {
  const { camera } = useThree();
  const [, getKeys] = useKeyboardControls();
  
  const playerRef = useRef<THREE.Group>(null);
  const velocityRef = useRef(new THREE.Vector3());
  const rotationRef = useRef({ x: 0, y: 0 });
  const isOnGroundRef = useRef(true);
  const lastShotTime = useRef(0);
  
  // Mouse controls - simplified approach
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement && gameState.gamePhase === 'playing') {
        const sensitivity = 0.002;
        rotationRef.current.y -= event.movementX * sensitivity;
        rotationRef.current.x -= event.movementY * sensitivity;
        rotationRef.current.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotationRef.current.x));
      }
    };
    
    const handleClick = () => {
      if (gameState.gamePhase === 'playing' && gameState.ammo > 0) {
        const now = Date.now();
        if (now - lastShotTime.current > 100) {
          // Shoot bullet
          const direction = new THREE.Vector3(
            -Math.sin(rotationRef.current.y),
            Math.sin(rotationRef.current.x),
            -Math.cos(rotationRef.current.y)
          ).normalize();
          
          const bulletPos = camera.position.clone().add(direction.clone().multiplyScalar(1));
          
          setGameState(prev => ({
            ...prev,
            ammo: prev.ammo - 1,
            bullets: [...prev.bullets, {
              id: `bullet_${Date.now()}`,
              position: [bulletPos.x, bulletPos.y, bulletPos.z],
              direction: [direction.x, direction.y, direction.z]
            }]
          }));
          
          lastShotTime.current = now;
          console.log('Shot fired!');
        }
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
    };
  }, [gameState.gamePhase, gameState.ammo, camera, setGameState]);
  
  useFrame((state, deltaTime) => {
    if (gameState.gamePhase !== 'playing') return;
    
    const keys = getKeys();
    
    // Movement
    const moveSpeed = 8;
    const jumpSpeed = 12;
    
    // Update player rotation
    if (playerRef.current) {
      playerRef.current.rotation.y = rotationRef.current.y;
      
      // Update camera
      const cameraOffset = new THREE.Vector3(0, 1.4, 0);
      camera.position.copy(playerRef.current.position).add(cameraOffset);
      camera.rotation.y = rotationRef.current.y;
      camera.rotation.x = rotationRef.current.x;
    }
    
    // Movement direction
    const forward = new THREE.Vector3(-Math.sin(rotationRef.current.y), 0, -Math.cos(rotationRef.current.y));
    const right = new THREE.Vector3(Math.cos(rotationRef.current.y), 0, -Math.sin(rotationRef.current.y));
    
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
      const newPos = playerRef.current.position.clone().add(velocityRef.current.clone().multiplyScalar(deltaTime));
      
      // Ground collision
      if (newPos.y < 1) {
        newPos.y = 1;
        velocityRef.current.y = 0;
        isOnGroundRef.current = true;
      }
      
      // Boundary
      const boundary = 24;
      newPos.x = THREE.MathUtils.clamp(newPos.x, -boundary, boundary);
      newPos.z = THREE.MathUtils.clamp(newPos.z, -boundary, boundary);
      
      playerRef.current.position.copy(newPos);
    }
    
    // Reload
    if (keys.reload) {
      setGameState(prev => ({ ...prev, ammo: 30 }));
    }
    
    // Update bullets
    setGameState(prev => ({
      ...prev,
      bullets: prev.bullets.map(bullet => ({
        ...bullet,
        position: [
          bullet.position[0] + bullet.direction[0] * 50 * deltaTime,
          bullet.position[1] + bullet.direction[1] * 50 * deltaTime,
          bullet.position[2] + bullet.direction[2] * 50 * deltaTime,
        ] as [number, number, number]
      })).filter(bullet => 
        Math.abs(bullet.position[0]) < 30 && 
        Math.abs(bullet.position[2]) < 30 && 
        bullet.position[1] > 0 && 
        bullet.position[1] < 20
      )
    }));
  });
  
  return (
    <group ref={playerRef} position={[0, 1, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.8, 2, 0.8]} />
        <meshLambertMaterial color="#4444ff" />
      </mesh>
    </group>
  );
}

// Enemy Component
function Enemy({ 
  enemy, 
  gameState, 
  setGameState 
}: { 
  enemy: { id: string; position: [number, number, number]; health: number };
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
}) {
  const enemyRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    // Check bullet collisions
    gameState.bullets.forEach(bullet => {
      const bulletPos = new THREE.Vector3(...bullet.position);
      const enemyPos = new THREE.Vector3(...enemy.position);
      
      if (bulletPos.distanceTo(enemyPos) < 1) {
        // Hit enemy
        setGameState(prev => ({
          ...prev,
          bullets: prev.bullets.filter(b => b.id !== bullet.id),
          enemies: prev.enemies.map(e => 
            e.id === enemy.id ? { ...e, health: e.health - 25 } : e
          ).filter(e => e.health > 0),
          score: enemy.health <= 25 ? prev.score + 100 : prev.score
        }));
      }
    });
  });
  
  return (
    <mesh ref={enemyRef} position={enemy.position} castShadow>
      <boxGeometry args={[1, 2, 1]} />
      <meshLambertMaterial color="#ff4444" />
    </mesh>
  );
}

// Bullet Component
function Bullet({ bullet }: { bullet: { id: string; position: [number, number, number] } }) {
  return (
    <mesh position={bullet.position}>
      <sphereGeometry args={[0.1]} />
      <meshBasicMaterial color="#ffff00" />
    </mesh>
  );
}

// HUD Component
function HUD({ 
  gameState, 
  setGameState 
}: { 
  gameState: GameState; 
  setGameState: React.Dispatch<React.SetStateAction<GameState>> 
}) {
  if (gameState.gamePhase === 'menu') {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontFamily: 'Inter, sans-serif', zIndex: 1000
      }}>
        <div style={{
          textAlign: 'center', padding: '40px', background: 'rgba(0,0,0,0.3)',
          borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}>
          <h1 style={{ fontSize: '64px', fontWeight: 'bold', marginBottom: '20px' }}>FPS ARENA</h1>
          <p style={{ fontSize: '18px', marginBottom: '30px' }}>
            Fast-paced first-person shooting. Eliminate enemies and survive!
          </p>
          <div style={{ marginBottom: '30px', fontSize: '16px' }}>
            <div><strong>WASD</strong> - Move</div>
            <div><strong>MOUSE</strong> - Look</div>
            <div><strong>CLICK</strong> - Shoot</div>
            <div><strong>R</strong> - Reload</div>
          </div>
          <button
            onClick={() => {
              setGameState(prev => ({ ...prev, gamePhase: 'playing' }));
              document.body.requestPointerLock();
            }}
            style={{
              padding: '20px 40px', fontSize: '24px', fontWeight: 'bold',
              background: '#4CAF50', color: 'white', border: 'none',
              borderRadius: '12px', cursor: 'pointer'
            }}
          >
            START GAME
          </button>
        </div>
      </div>
    );
  }
  
  if (gameState.gamePhase !== 'playing') return null;
  
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      pointerEvents: 'none', zIndex: 100, fontFamily: 'Inter, sans-serif'
    }}>
      {/* Crosshair */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '20px', height: '20px', pointerEvents: 'none'
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '2px', height: '20px', backgroundColor: 'white', boxShadow: '0 0 2px black'
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '20px', height: '2px', backgroundColor: 'white', boxShadow: '0 0 2px black'
        }} />
      </div>
      
      {/* Health */}
      <div style={{
        position: 'absolute', bottom: '40px', left: '40px',
        background: 'rgba(0,0,0,0.7)', padding: '15px', borderRadius: '8px',
        color: 'white', border: '2px solid rgba(255,255,255,0.3)'
      }}>
        <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>HEALTH</div>
        <div style={{
          width: '200px', height: '20px', background: 'rgba(255,255,255,0.2)',
          borderRadius: '4px', overflow: 'hidden'
        }}>
          <div style={{
            width: `${gameState.health}%`, height: '100%',
            background: gameState.health > 30 ? '#00ff00' : '#ff0000',
            transition: 'width 0.3s ease'
          }} />
        </div>
        <div style={{ marginTop: '4px', fontSize: '12px' }}>{gameState.health} / 100</div>
      </div>
      
      {/* Ammo */}
      <div style={{
        position: 'absolute', bottom: '40px', right: '40px',
        background: 'rgba(0,0,0,0.7)', padding: '15px', borderRadius: '8px',
        color: 'white', textAlign: 'center', border: '2px solid rgba(255,255,255,0.3)'
      }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '4px' }}>{gameState.ammo}</div>
        <div style={{ fontSize: '12px', opacity: 0.8 }}>/ 30</div>
        <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.6 }}>AMMO</div>
      </div>
      
      {/* Score */}
      <div style={{
        position: 'absolute', top: '40px', left: '40px',
        background: 'rgba(0,0,0,0.7)', padding: '15px', borderRadius: '8px',
        color: 'white', border: '2px solid rgba(255,255,255,0.3)'
      }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>SCORE: {gameState.score}</div>
      </div>
    </div>
  );
}

// Game Logic Component
function GameLogic({ 
  gameState, 
  setGameState 
}: { 
  gameState: GameState; 
  setGameState: React.Dispatch<React.SetStateAction<GameState>> 
}) {
  const lastSpawnTime = useRef(0);
  
  useFrame((state) => {
    if (gameState.gamePhase !== 'playing') return;
    
    // Spawn enemies
    const currentTime = state.clock.elapsedTime;
    if (currentTime - lastSpawnTime.current > 3 && gameState.enemies.length < 5) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 15 + Math.random() * 8;
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;
      
      setGameState(prev => ({
        ...prev,
        enemies: [...prev.enemies, {
          id: `enemy_${Date.now()}`,
          position: [x, 1, z],
          health: 50
        }]
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
    ammo: 30,
    score: 0,
    gamePhase: 'menu',
    enemies: [],
    bullets: []
  });
  
  if (gameState.gamePhase === 'menu') {
    return <HUD gameState={gameState} setGameState={setGameState} />;
  }
  
  return (
    <>
      <Canvas
        shadows
        camera={{ position: [0, 2.4, 0], fov: 75, near: 0.1, far: 1000 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ width: '100vw', height: '100vh' }}
      >
        <color attach="background" args={["#87CEEB"]} />
        
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[50, 50, 25]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.1}
          shadow-camera-far={200}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
        />
        
        <Suspense fallback={null}>
          <Environment />
          <Player gameState={gameState} setGameState={setGameState} />
          
          {gameState.enemies.map(enemy => (
            <Enemy key={enemy.id} enemy={enemy} gameState={gameState} setGameState={setGameState} />
          ))}
          
          {gameState.bullets.map(bullet => (
            <Bullet key={bullet.id} bullet={bullet} />
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
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <KeyboardControls map={controls}>
        <Game />
      </KeyboardControls>
    </div>
  );
}