import { useEffect, useState } from 'react';
import { CROSSHAIRS, Crosshair as CrosshairType } from '../../../data/crosshairs';
import { loadCrosshair } from '../../../utils/crosshairStorage';

export default function Crosshair() {
  const [activeCrosshair, setActiveCrosshair] = useState<CrosshairType>(CROSSHAIRS[0]);

  useEffect(() => {
    const crosshairId = loadCrosshair();
    const found = CROSSHAIRS.find(c => c.id === crosshairId);
    if (found) {
      setActiveCrosshair(found);
    }
  }, []);

  const renderCrosshair = () => {
    const { type, size, thickness = 2, gap = 4, color } = activeCrosshair;

    if (type === 'dot') {
      return (
        <div
          style={{
            width: `${size}px`,
            height: `${size}px`,
            backgroundColor: color,
            borderRadius: '50%',
            boxShadow: '0 0 2px black',
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
            boxShadow: '0 0 2px black',
          }}
        />
      );
    }

    if (type === 'cross') {
      return (
        <>
          {/* Top line */}
          <div
            style={{
              position: 'absolute',
              top: `calc(50% - ${gap + size}px)`,
              left: '50%',
              transform: 'translateX(-50%)',
              width: `${thickness}px`,
              height: `${size}px`,
              backgroundColor: color,
              boxShadow: '0 0 2px black',
            }}
          />
          {/* Bottom line */}
          <div
            style={{
              position: 'absolute',
              top: `calc(50% + ${gap}px)`,
              left: '50%',
              transform: 'translateX(-50%)',
              width: `${thickness}px`,
              height: `${size}px`,
              backgroundColor: color,
              boxShadow: '0 0 2px black',
            }}
          />
          {/* Left line */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `calc(50% - ${gap + size}px)`,
              transform: 'translateY(-50%)',
              width: `${size}px`,
              height: `${thickness}px`,
              backgroundColor: color,
              boxShadow: '0 0 2px black',
            }}
          />
          {/* Right line */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `calc(50% + ${gap}px)`,
              transform: 'translateY(-50%)',
              width: `${size}px`,
              height: `${thickness}px`,
              backgroundColor: color,
              boxShadow: '0 0 2px black',
            }}
          />
        </>
      );
    }

    return null;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {renderCrosshair()}
    </div>
  );
}
