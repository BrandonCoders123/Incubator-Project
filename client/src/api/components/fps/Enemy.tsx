import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useFPS, type Enemy as EnemyType } from '../../lib/stores/useFPS';
import { useAudio } from '../../lib/stores/useAudio';
import * as THREE from 'three';

interface EnemyProps {
  enemy: EnemyType;
}

export default function Enemy({ enemy }: EnemyProps) {
  const { removeEnemy, damageEnemy, addScore, bullets, removeBullet } = useFPS();
  const { playSuccess } = useAudio();
  const enemyRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshLambertMaterial>(null);
  const hotDogFillRef = useRef<THREE.Mesh>(null);
  const displayedHealthRatioRef = useRef(enemy.health / enemy.maxHealth);
  
  // Remove enemy if dead
  useEffect(() => {
    if (!enemy.isAlive) {
      const timer = setTimeout(() => {
        removeEnemy(enemy.id);
        addScore(100);
        playSuccess();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [enemy.isAlive, enemy.id, removeEnemy, addScore, playSuccess]);
  
  // Check bullet collisions
  useFrame(() => {
    if (!enemy.isAlive || !enemyRef.current) return;

    const targetHealthRatio = Math.max(0, enemy.health / enemy.maxHealth);
    displayedHealthRatioRef.current = THREE.MathUtils.lerp(
      displayedHealthRatioRef.current,
      targetHealthRatio,
      0.12
    );

    if (hotDogFillRef.current) {
      hotDogFillRef.current.scale.x = Math.max(displayedHealthRatioRef.current, 0.0001);
      hotDogFillRef.current.position.x = (displayedHealthRatioRef.current - 1) * 0.65;
    }
    
    const enemyPosition = new THREE.Vector3(...enemy.position);
    const enemySize = 3; // Enemy is a 1x1x1 cube
    
    bullets.forEach(bullet => {
      const bulletPosition = new THREE.Vector3(...bullet.position);
      const distance = enemyPosition.distanceTo(bulletPosition);
      
      // Simple collision detection
      if (distance < enemySize) {
        damageEnemy(enemy.id, bullet.damage);
        removeBullet(bullet.id);
        
        console.log(`Enemy ${enemy.id} hit! Health: ${enemy.health - bullet.damage}`);
        
        // Flash effect when hit
        if (materialRef.current) {
          materialRef.current.color.setHex(0xff0000);
          setTimeout(() => {
            if (materialRef.current) {
              materialRef.current.color.setHex(0xff4444);
            }
          }, 100);
        }
      }
    });
  });
  
  return (
    <mesh
      ref={enemyRef}
      position={enemy.position}
      castShadow
    >
      <boxGeometry args={[1, 2, 1]} />
      <meshLambertMaterial
        ref={materialRef}
        color={enemy.isAlive ? "#ff4444" : "#666666"}
        opacity={enemy.isAlive ? 1 : 0.5}
        transparent={!enemy.isAlive}
      />
      
      {/* Health bar */}
      {enemy.isAlive && (
        <group position={[0, 1.7, 0]} rotation={[-0.15, 0, 0]}>
          <mesh position={[0, 0, 0]}>
            <capsuleGeometry args={[0.12, 1.15, 8, 12]} />
            <meshBasicMaterial color="#d9863a" />
          </mesh>
          <mesh position={[0, 0.01, 0]} scale={[displayedHealthRatioRef.current, 1, 1]} ref={hotDogFillRef}>
            <capsuleGeometry args={[0.08, 1.15, 8, 12]} />
            <meshBasicMaterial color="#8b3f2b" />
          </mesh>
        </group>
      )}
    </mesh>
  );
}
