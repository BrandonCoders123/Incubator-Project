import { useEffect, useState, useCallback } from 'react';
import { CROSSHAIRS, Crosshair as CrosshairType } from '../../../data/crosshairs';

interface CustomCrosshair {
  id: string;
  name: string;
  type: "dot" | "cross" | "circle";
  size: number;
  thickness?: number;
  gap?: number;
  color: string;
}

export default function Crosshair() {
  const [activeCrosshair, setActiveCrosshair] = useState<CrosshairType | CustomCrosshair>(CROSSHAIRS[0]);

  const loadActiveCrosshair = useCallback(() => {
    const crosshairId = localStorage.getItem("selectedCrosshairId");
    
    if (crosshairId === "custom") {
      const customData = localStorage.getItem("customCrosshair");
      if (customData) {
        try {
          const custom = JSON.parse(customData);
          setActiveCrosshair({
            id: "custom",
            name: "Custom",
            type: custom.type || "cross",
            size: custom.size || 10,
            thickness: custom.thickness || 2,
            gap: custom.gap || 4,
            color: custom.color || "#ffffff",
          });
          return;
        } catch (e) {
          console.error("Failed to parse custom crosshair:", e);
        }
      }
    }
    
    const found = CROSSHAIRS.find(c => c.id === crosshairId);
    if (found) {
      setActiveCrosshair(found);
    } else {
      setActiveCrosshair(CROSSHAIRS[0]);
    }
  }, []);

  useEffect(() => {
    loadActiveCrosshair();
    
    const handleCrosshairChange = () => {
      loadActiveCrosshair();
    };
    
    window.addEventListener('storage', handleCrosshairChange);
    window.addEventListener('crosshairChanged', handleCrosshairChange);
    
    return () => {
      window.removeEventListener('storage', handleCrosshairChange);
      window.removeEventListener('crosshairChanged', handleCrosshairChange);
    };
  }, [loadActiveCrosshair]);

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
