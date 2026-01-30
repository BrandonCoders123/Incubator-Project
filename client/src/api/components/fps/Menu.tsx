import { useState } from 'react';
import { useFPS } from '../../../lib/stores/useFPS';
import { useGame } from '../../../lib/stores/useGame';
import './Menu.css';

export default function Menu() {
  const { startGame } = useFPS();
  const { setGameMode } = useGame();
  const [showModes, setShowModes] = useState(false);

  return (
    <div className="menu-background">
      <div
        style={{
          textAlign: 'center',
          maxWidth: '600px',
          padding: '40px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '20px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        }}
      >
        {!showModes ? (
          <button
            onClick={() => setShowModes(true)}
            style={{
              padding: '20px 40px',
              fontSize: '24px',
              fontWeight: 'bold',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 8px 16px rgba(76, 175, 80, 0.3)',
            }}
          >
            GAME MODES
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button
              onClick={() => {
                setGameMode('story');
                startGame();
              }}
              style={{
                padding: '16px 32px',
                fontSize: '20px',
                fontWeight: 'bold',
                background: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
            >
              STORY MODE
            </button>

            <button
              onClick={() => {
                setGameMode('endless');
                startGame();
              }}
              style={{
                padding: '16px 32px',
                fontSize: '20px',
                fontWeight: 'bold',
                background: '#9C27B0',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
            >
              ENDLESS MODE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
