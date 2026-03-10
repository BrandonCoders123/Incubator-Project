import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useFPS } from '../../lib/stores/useFPS';
import { useAudio } from '../../lib/stores/useAudio';
import { sendGameEnd, updateShots } from '../../api/backend';

import Player from './Player';
import Environment from './Environment';
import Enemy from './Enemy';
import Bullet from './Bullet';

export default function Game() {
  const {
    gameState,
    enemies,
    bullets,
    updateBullets,
    spawnEnemy,
    setPointerLocked,
    pauseGame,
    resumeGame,
    enemiesKilled,
    runTimeSeconds,
    userId
  } = useFPS();

  const { camera, gl } = useThree();
  const gameRef = useRef<boolean>(false);
  const lastSpawnTime = useRef<number>(0);

  // Initialize audio
  const { setBackgroundMusic, setHitSound, setSuccessSound } = useAudio();

  useEffect(() => {
    // Load audio files
    const bgMusic = new Audio('/sounds/background.mp3');
    const hitSound = new Audio('/sounds/hit.mp3');
    const successSound = new Audio('/sounds/success.mp3');

    bgMusic.loop = true;
    bgMusic.volume = 0.3;

    setBackgroundMusic(bgMusic);
    setHitSound(hitSound);
    setSuccessSound(successSound);
  }, [setBackgroundMusic, setHitSound, setSuccessSound]);

  // Handle pointer lock
  useEffect(() => {
    const canvas = gl.domElement;

    const handlePointerLockChange = () => {
      const isLocked = document.pointerLockElement === canvas;
      setPointerLocked(isLocked);

      if (!isLocked && gameState === 'playing') {
        pauseGame();
      }
    };

    const handleClick = () => {
      if (gameState === 'playing') {
        canvas.requestPointerLock();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        if (gameState === 'playing') {
          pauseGame();
        } else if (gameState === 'paused') {
          resumeGame();
          canvas.requestPointerLock();
        }
      }
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    canvas.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      canvas.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gl.domElement, gameState, setPointerLocked, pauseGame, resumeGame]);

  // Send score to backend when game ends
  useEffect(() => {
    if (gameState === 'ended') {
      sendGameEnd(userId, enemiesKilled, runTimeSeconds)
        .then(() => console.log('Game stats sent to backend'))
        .catch(err => console.error('Failed to send game stats:', err));
    }
  }, [gameState, userId, enemiesKilled, runTimeSeconds]);

  // Game loop
  useFrame((state, deltaTime) => {
    if (gameState !== 'playing') return;

    // Update bullets and check for hits
    updateBullets(deltaTime);

    // Check for bullet hits on enemies
    bullets.forEach(bullet => {
      enemies.forEach(enemy => {
        const bulletPos = new THREE.Vector3(...bullet.position);
        const enemyPos = new THREE.Vector3(...enemy.position);
        const distance = bulletPos.distanceTo(enemyPos);

        if (distance < 1.5) {
          updateShots(userId, 0, 1);
        }
      });
    });

    // Spawn enemies periodically
    const currentTime = state.clock.elapsedTime;
    if (currentTime - lastSpawnTime.current > 3 && enemies.length < 5) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 15 + Math.random() * 10;
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;

      spawnEnemy([x, 1, z]);
      lastSpawnTime.current = currentTime;
    }
  });

  // Lighting setup
  return (
    <>
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

      {/* Game components */}
      <Player />
      <Environment />

      {/* Render enemies */}
      {enemies.map((enemy) => (
        <Enemy key={enemy.id} enemy={enemy} />
      ))}

      {/* Render bullets */}
      {bullets.map((bullet) => (
        <Bullet key={bullet.id} bullet={bullet} />
      ))}
    </>
  );
}