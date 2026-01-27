import { useFPS } from '../../../lib/stores/useFPS';
import './Menu.css';

export default function Menu() {
  const { startGame } = useFPS();

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
        <button
          onClick={startGame}
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
          START GAME
        </button>
      </div>
    </div>
  );
}
