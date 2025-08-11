import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { useFPS } from '../../lib/stores/useFPS';
import { useAudio } from '../../lib/stores/useAudio';
import * as THREE from 'three';

export default function Player() {
  const { camera } = useThree();
  const { 
    gameState, 
    shoot, 
    addBullet, 
    isPointerLocked,
    playerStats 
  } = useFPS();
  const { playHit } = useAudio();
  
  const [, getKeys] = useKeyboardControls();
  
  const playerRef = useRef<THREE.Group>(null);
  const velocityRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const directionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const mouseMovementRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isOnGroundRef = useRef<boolean>(true);
  const lastShotTime = useRef<number>(0);
  
  // Mouse look controls
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isPointerLocked || gameState !== 'playing') return;
      
      const sensitivity = 0.002;
      mouseMovementRef.current.x -= event.movementX * sensitivity;
      mouseMovementRef.current.y -= event.movementY * sensitivity;
      
      // Clamp vertical rotation
      mouseMovementRef.current.y = Math.max(
        -Math.PI / 2, 
        Math.min(Math.PI / 2, mouseMovementRef.current.y)
      );
    };
    
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 0 && gameState === 'playing' && isPointerLocked) {
        handleShoot();
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isPointerLocked, gameState]);
  
  const handleShoot = () => {
    const currentTime = Date.now();
    if (currentTime - lastShotTime.current < 100) return; // Rate limit shooting
    
    if (shoot()) {
      // Get camera direction
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      // Create bullet
      const bulletPosition = camera.position.clone();
      bulletPosition.add(direction.clone().multiplyScalar(1)); // Start bullet in front of camera
      
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
    
    // Get camera forward and right vectors
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    
    camera.getWorldDirection(forward);
    forward.y = 0; // Remove vertical component for movement
    forward.normalize();
    
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    
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
    
    // Update camera position
    const newPosition = camera.position.clone();
    newPosition.add(velocityRef.current.clone().multiplyScalar(deltaTime));
    
    // Simple ground collision (y = 1.6 is player height)
    if (newPosition.y < 1.6) {
      newPosition.y = 1.6;
      velocityRef.current.y = 0;
      isOnGroundRef.current = true;
    }
    
    // Simple boundary collision
    const boundary = 25;
    newPosition.x = THREE.MathUtils.clamp(newPosition.x, -boundary, boundary);
    newPosition.z = THREE.MathUtils.clamp(newPosition.z, -boundary, boundary);
    
    camera.position.copy(newPosition);
    
    // Apply mouse look
    camera.rotation.y = mouseMovementRef.current.x;
    camera.rotation.x = mouseMovementRef.current.y;
    
    // Handle reload
    if (keys.reload) {
      // Handle reload logic here if needed
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
    <group ref={playerRef}>
      {/* Player model is just the camera, no visual representation needed */}
    </group>
  );
}
