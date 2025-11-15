
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

export default function Environment() {
  // Load textures
  const grassTexture = useTexture('/textures/grass.png');
  const asphaltTexture = useTexture('/textures/asphalt.png');
  const woodTexture = useTexture('/textures/wood.jpg');
  
  // Configure texture repeating
  grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(10, 10);
  
  asphaltTexture.wrapS = asphaltTexture.wrapT = THREE.RepeatWrapping;
  asphaltTexture.repeat.set(5, 5);
  
  woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
  woodTexture.repeat.set(2, 2);
  
  return (
    <>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshLambertMaterial map={grassTexture} />
      </mesh>
      
      {/* Central platform */}
      <mesh position={[0, 0.5, 0]} receiveShadow castShadow>
        <boxGeometry args={[10, 1, 10]} />
        <meshLambertMaterial map={asphaltTexture} />
      </mesh>
      
      {/* Boundary walls */}
      <mesh position={[30, 5, 0]} castShadow>
        <boxGeometry args={[1, 10, 60]} />
        <meshLambertMaterial map={woodTexture} />
      </mesh>
      
      <mesh position={[-30, 5, 0]} castShadow>
        <boxGeometry args={[1, 10, 60]} />
        <meshLambertMaterial map={woodTexture} />
      </mesh>
      
      <mesh position={[0, 5, 30]} castShadow>
        <boxGeometry args={[60, 10, 1]} />
        <meshLambertMaterial map={woodTexture} />
      </mesh>
      
      <mesh position={[0, 5, -30]} castShadow>
        <boxGeometry args={[60, 10, 1]} />
        <meshLambertMaterial map={woodTexture} />
      </mesh>
      
      {/* Some cover objects */}
      <mesh position={[8, 1.5, 8]} castShadow>
        <boxGeometry args={[2, 3, 2]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      
      <mesh position={[-8, 1.5, 8]} castShadow>
        <boxGeometry args={[2, 3, 2]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      
      <mesh position={[8, 1.5, -8]} castShadow>
        <boxGeometry args={[2, 3, 2]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      
      <mesh position={[-8, 1.5, -8]} castShadow>
        <boxGeometry args={[2, 3, 2]} />
        <meshLambertMaterial color="#8B4513" />
      </mesh>
      
      {/* Additional platforms */}
      <mesh position={[15, 2, 15]} receiveShadow castShadow>
        <boxGeometry args={[6, 1, 6]} />
        <meshLambertMaterial map={asphaltTexture} />
      </mesh>
      
      <mesh position={[-15, 2, 15]} receiveShadow castShadow>
        <boxGeometry args={[6, 1, 6]} />
        <meshLambertMaterial map={asphaltTexture} />
      </mesh>
      
      <mesh position={[15, 2, -15]} receiveShadow castShadow>
        <boxGeometry args={[6, 1, 6]} />
        <meshLambertMaterial map={asphaltTexture} />
      </mesh>
      
      <mesh position={[-15, 2, -15]} receiveShadow castShadow>
        <boxGeometry args={[6, 1, 6]} />
        <meshLambertMaterial map={asphaltTexture} />
      </mesh>
    </>
  );
}
