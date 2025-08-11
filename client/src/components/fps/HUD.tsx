import { useFPS } from '../../lib/stores/useFPS';
import Crosshair from './Crosshair';

export default function HUD() {
  const { playerStats, gameState, resumeGame } = useFPS();
  
  if (gameState !== 'playing' && gameState !== 'paused') return null;
  
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 100,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Crosshair */}
      <Crosshair />
      
      {/* Health Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          left: '40px',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '15px',
          borderRadius: '8px',
          color: 'white',
          border: '2px solid rgba(255, 255, 255, 0.3)',
        }}
      >
        <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
          HEALTH
        </div>
        <div
          style={{
            width: '200px',
            height: '20px',
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${(playerStats.health / playerStats.maxHealth) * 100}%`,
              height: '100%',
              background: playerStats.health > 30 ? '#00ff00' : '#ff0000',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ marginTop: '4px', fontSize: '12px' }}>
          {playerStats.health} / {playerStats.maxHealth}
        </div>
      </div>
      
      {/* Ammo Counter */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          right: '40px',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '15px',
          borderRadius: '8px',
          color: 'white',
          textAlign: 'center',
          border: '2px solid rgba(255, 255, 255, 0.3)',
        }}
      >
        <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '4px' }}>
          {playerStats.ammo}
        </div>
        <div style={{ fontSize: '12px', opacity: 0.8 }}>
          / {playerStats.maxAmmo}
        </div>
        <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.6 }}>
          AMMO
        </div>
      </div>
      
      {/* Score */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          left: '40px',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '15px',
          borderRadius: '8px',
          color: 'white',
          border: '2px solid rgba(255, 255, 255, 0.3)',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
          SCORE: {playerStats.score}
        </div>
        <div style={{ fontSize: '12px', opacity: 0.8 }}>
          KILLS: {playerStats.kills}
        </div>
      </div>
      
      {/* Instructions */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          right: '40px',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '15px',
          borderRadius: '8px',
          color: 'white',
          fontSize: '12px',
          border: '2px solid rgba(255, 255, 255, 0.3)',
        }}
      >
        <div style={{ marginBottom: '4px' }}>WASD: Move</div>
        <div style={{ marginBottom: '4px' }}>SPACE: Jump</div>
        <div style={{ marginBottom: '4px' }}>MOUSE: Look</div>
        <div style={{ marginBottom: '4px' }}>CLICK: Shoot</div>
        <div>ESC: Pause</div>
      </div>
      
      {/* Pause Overlay */}
      {gameState === 'paused' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            pointerEvents: 'auto',
          }}
        >
          <h1 style={{ fontSize: '48px', marginBottom: '20px', fontWeight: 'bold' }}>
            PAUSED
          </h1>
          <button
            onClick={resumeGame}
            style={{
              padding: '15px 30px',
              fontSize: '18px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Resume Game
          </button>
        </div>
      )}
    </div>
  );
}
