import { useFPS } from '../../lib/stores/useFPS';

export default function Menu() {
  const { startGame } = useFPS();
  
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
        zIndex: 1000,
      }}
    >
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
        <h1
          style={{
            fontSize: '64px',
            fontWeight: 'bold',
            marginBottom: '20px',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
          }}
        >
          FPS ARENA
        </h1>
        
        <p
          style={{
            fontSize: '18px',
            marginBottom: '40px',
            opacity: 0.9,
            lineHeight: '1.6',
          }}
        >
          Enter a fast-paced first-person shooting experience.
          <br />
          Eliminate enemies, survive as long as possible, and achieve the highest score!
        </p>
        
        <div style={{ marginBottom: '40px' }}>
          <h3 style={{ fontSize: '24px', marginBottom: '15px' }}>Controls</h3>
          <div style={{ fontSize: '16px', lineHeight: '1.8', opacity: 0.8 }}>
            <div><strong>WASD</strong> - Move around</div>
            <div><strong>SPACE</strong> - Jump</div>
            <div><strong>MOUSE</strong> - Look around</div>
            <div><strong>LEFT CLICK</strong> - Shoot</div>
            <div><strong>ESC</strong> - Pause game</div>
          </div>
        </div>
        
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
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background = '#45a049';
            (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background = '#4CAF50';
            (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
          }}
        >
          START GAME
        </button>
        
        <div
          style={{
            marginTop: '30px',
            fontSize: '14px',
            opacity: 0.7,
          }}
        >
          Click anywhere on the game screen to lock your mouse cursor.
          <br />
          Press ESC to unlock and pause the game.
        </div>
      </div>
    </div>
  );
}
