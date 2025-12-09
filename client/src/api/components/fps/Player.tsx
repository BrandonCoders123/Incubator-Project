import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { useFPS } from '../../lib/stores/useFPS';
import { useAudio } from '../../lib/stores/useAudio';
import { useSettings } from '../../lib/stores/useSettings';
import * as THREE from 'three';


export default function Player() {
  const { camera } = useThree();
  const { 
    gameState, 
    shoot, 
    reload,
    addBullet, 
    isPointerLocked,
    playerStats 
  } = useFPS();
  const { playHit } = useAudio();
  
  const [, getKeys] = useKeyboardControls();
  
  const playerRef = useRef<THREE.Group>(null);
  const velocityRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const directionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const rotationRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isOnGroundRef = useRef<boolean>(true);
  const lastShotTime = useRef<number>(0);
  const isAimingRef = useRef<boolean>(false); // 👈 NEW
  
  // Mouse look controls with sensitivity + aiming
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isPointerLocked || gameState !== 'playing') return;

      const baseSensitivity = 0.002;
      const multiplier = isAimingRef.current ? aimSensitivity : normalSensitivity;
      const sensitivity = baseSensitivity * multiplier;

      rotationRef.current.y -= event.movementX * sensitivity;
      rotationRef.current.x -= event.movementY * sensitivity;

      // Clamp vertical rotation
      rotationRef.current.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, rotationRef.current.x)
      );
    };

    const handleMouseDown = (event: MouseEvent) => {
      // Left click: shoot
      if (event.button === 0 && gameState === 'playing' && isPointerLocked) {
        handleShoot();
      }

      // Right click: start aiming (lower sensitivity)
      if (event.button === 2 && gameState === 'playing' && isPointerLocked) {
        event.preventDefault();
        isAimingRef.current = true;
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      // Stop aiming when right button is released
      if (event.button === 2) {
        isAimingRef.current = false;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPointerLocked, gameState, normalSensitivity, aimSensitivity, handleShoot]);
  
  const handleShoot = () => {
    const currentTime = Date.now();
    if (currentTime - lastShotTime.current < 100) return; // Rate limit shooting
    
    if (shoot()) {
      // Get shooting direction based on player rotation
      const direction = new THREE.Vector3();
      direction.set(
        -Math.sin(rotationRef.current.y),
        Math.sin(rotationRef.current.x),
        -Math.cos(rotationRef.current.y)
      );
      direction.normalize();
      
      // Create bullet from player position
      const bulletPosition = camera.position.clone();
      bulletPosition.add(direction.clone().multiplyScalar(1)); // Start bullet in front of player
      
      addBullet({
        position: [bulletPosition.x, bulletPosition.y, bulletPosition.z],
        direction: [direction.x, direction.y, direction.z],
        speed: 50,
        damage: 25,
        timeToLive: 5,
      });
      
      playHit();
      lastShotTime.current = currentTime;
      
      console.log('Shot fired!', {
        ammo: playerStats.ammo,
        position: bulletPosition,
        direction: direction
      });
    }
  };
  
  useFrame((state, deltaTime) => {
    if (gameState !== 'playing') return;
    
    const keys = getKeys();
    
    // Movement
    const moveSpeed = 8;
    const jumpSpeed = 12;
    
    // Reset direction
    directionRef.current.set(0, 0, 0);
    
    // Update player model rotation and camera
    if (playerRef.current) {
      playerRef.current.rotation.y = rotationRef.current.y;
      
      // Position camera relative to player model
      const cameraOffset = new THREE.Vector3(0, 1.4, 0); // Camera height offset
      camera.position.copy(playerRef.current.position).add(cameraOffset);
      camera.rotation.y = rotationRef.current.y;
      camera.rotation.x = rotationRef.current.x;
    }
    
    // Get forward and right vectors based on player rotation
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    
    forward.set(
      -Math.sin(rotationRef.current.y),
      0,
      -Math.cos(rotationRef.current.y)
    );
    
    right.set(
      Math.cos(rotationRef.current.y),
      0,
      -Math.sin(rotationRef.current.y)
    );
    
    // Apply movement input
    if (keys.forward) {
      directionRef.current.add(forward);
    }
    if (keys.backward) {
      directionRef.current.sub(forward);
    }
    if (keys.leftward) {
      directionRef.current.sub(right);
    }
    if (keys.rightward) {
      directionRef.current.add(right);
    }
    
    // Normalize movement direction
    if (directionRef.current.length() > 0) {
      directionRef.current.normalize();
    }
    
    // Apply movement to velocity
    velocityRef.current.x = directionRef.current.x * moveSpeed;
    velocityRef.current.z = directionRef.current.z * moveSpeed;
    
    // Jump
    if (keys.jump && isOnGroundRef.current) {
      velocityRef.current.y = jumpSpeed;
      isOnGroundRef.current = false;
    }
    
    // Apply gravity
    velocityRef.current.y -= 30 * deltaTime;
    
    // Update player position
    if (playerRef.current) {
      const newPosition = playerRef.current.position.clone();
      newPosition.add(velocityRef.current.clone().multiplyScalar(deltaTime));
      
      // Simple ground collision (y = 1 is player model center height)
      if (newPosition.y < 1) {
        newPosition.y = 1;
        velocityRef.current.y = 0;
        isOnGroundRef.current = true;
      }
      
      // Simple boundary collision
      const boundary = 25;
      newPosition.x = THREE.MathUtils.clamp(newPosition.x, -boundary, boundary);
      newPosition.z = THREE.MathUtils.clamp(newPosition.z, -boundary, boundary);
      
      playerRef.current.position.copy(newPosition);
    }
    
    // Handle reload
    if (keys.reload) {
      reload();
      console.log('Reloaded! Ammo:', playerStats.maxAmmo);
    }
    
    // Log player state for debugging
    if (Math.floor(state.clock.elapsedTime) % 2 === 0 && state.clock.elapsedTime % 1 < deltaTime) {
      console.log('Player state:', {
        position: camera.position,
        velocity: velocityRef.current,
        onGround: isOnGroundRef.current,
        health: playerStats.health,
        ammo: playerStats.ammo
      });
    }
  });
  
  return (
    <group ref={playerRef} position={[0, 1, 0]}>
      {/* Visible player model - blue box to represent the player */}
      <mesh castShadow>
        <boxGeometry args={[0.8, 2, 0.8]} />
        <meshLambertMaterial color="#4444ff" />
      </mesh>
    </group>
  );
}
