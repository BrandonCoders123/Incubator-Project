import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useFPS, type Bullet as BulletType } from '../../lib/stores/useFPS';
import * as THREE from 'three';

interface BulletProps {
  bullet: BulletType;
}

export default function Bullet({ bullet }: BulletProps) {
  const { removeBullet } = useFPS();
  const bulletRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, deltaTime) => {
    if (!bulletRef.current) return;
    
    // Update bullet position
    const movement = new THREE.Vector3(...bullet.direction)
      .multiplyScalar(bullet.speed * deltaTime);
    
    bulletRef.current.position.add(movement);
    
    // Check if bullet is out of bounds or hit something
    const position = bulletRef.current.position;
    const boundary = 30;
    
    if (
      Math.abs(position.x) > boundary ||
      Math.abs(position.z) > boundary ||
      position.y < 0 ||
      position.y > 20
    ) {
      removeBullet(bullet.id);
      console.log(`Bullet ${bullet.id} removed (out of bounds)`);
    }
  });
  
  return (
    <mesh
      ref={bulletRef}
      position={bullet.position}
    >
      <sphereGeometry args={[0.1, 8, 8]} />
      <meshBasicMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={0.5} />
    </mesh>
  );
}
