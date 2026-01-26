import { useState } from 'react';
import { useFPS } from '../../../lib/stores/useFPS';
import { CROSSHAIRS, Crosshair } from '../../../data/crosshairs';
import { saveCrosshair, loadCrosshair } from '../../../utils/crosshairStorage';
import './Menu.css';

function CrosshairPreview({ crosshair }: { crosshair: Crosshair }) {
  const { type, size, thickness = 2, gap = 4, color } = crosshair;

  if (type === 'dot') {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
          borderRadius: '50%',
        }}
      />
    );
  }

  if (type === 'circle') {
    return (
      <div
        style={{
          width: `${size * 2}px`,
          height: `${size * 2}px`,
          border: `${thickness}px solid ${color}`,
          borderRadius: '50%',
        }}
      />
    );
  }

  if (type === 'cross') {
    const previewSize = Math.min(size, 8);
    const previewGap = Math.min(gap, 3);
    return (
      <div style={{ position: 'relative', width: '30px', height: '30px' }}>
        <div
          style={{
            position: 'absolute',
            top: `calc(50% - ${previewGap + previewSize}px)`,
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${thickness}px`,
            height: `${previewSize}px`,
            backgroundColor: color,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: `calc(50% + ${previewGap}px)`,
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${thickness}px`,
            height: `${previewSize}px`,
            backgroundColor: color,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `calc(50% - ${previewGap + previewSize}px)`,
            transform: 'translateY(-50%)',
            width: `${previewSize}px`,
            height: `${thickness}px`,
            backgroundColor: color,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `calc(50% + ${previewGap}px)`,
            transform: 'translateY(-50%)',
            width: `${previewSize}px`,
            height: `${thickness}px`,
            backgroundColor: color,
          }}
        />
      </div>
    );
  }

  return null;
}

export default function Menu() {
  const { startGame } = useFPS();
  const [selectedCrosshair, setSelectedCrosshair] = useState(
    loadCrosshair() ?? 'classic-dot'
  );

  const handleCrosshairSelect = (id: string) => {
    setSelectedCrosshair(id);
    saveCrosshair(id);
  };

  return (
    <div className="menu-background">
      <div
        style={{
          textAlign: 'center',
          maxWidth: '700px',
          padding: '40px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '20px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        }}
      >
        <h2
          style={{
            color: 'white',
            marginBottom: '20px',
            fontSize: '18px',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          Select Crosshair
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '10px',
            marginBottom: '30px',
          }}
        >
          {CROSSHAIRS.map((crosshair) => (
            <button
              key={crosshair.id}
              onClick={() => handleCrosshairSelect(crosshair.id)}
              style={{
                padding: '15px 10px',
                background:
                  selectedCrosshair === crosshair.id
                    ? 'rgba(76, 175, 80, 0.5)'
                    : 'rgba(255, 255, 255, 0.1)',
                border:
                  selectedCrosshair === crosshair.id
                    ? '2px solid #4CAF50'
                    : '2px solid transparent',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '80px',
              }}
            >
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: '4px',
                }}
              >
                <CrosshairPreview crosshair={crosshair} />
              </div>
              <span
                style={{
                  color: 'white',
                  fontSize: '10px',
                  textAlign: 'center',
                }}
              >
                {crosshair.name}
              </span>
            </button>
          ))}
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
        >
          START GAME
        </button>
      </div>
    </div>
  );
}
