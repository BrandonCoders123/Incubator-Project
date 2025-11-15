export default function Crosshair() {
  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '20px',
        height: '20px',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {/* Vertical line */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '2px',
          height: '20px',
          backgroundColor: 'white',
          boxShadow: '0 0 2px black',
        }}
      />
      {/* Horizontal line */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '20px',
          height: '2px',
          backgroundColor: 'white',
          boxShadow: '0 0 2px black',
        }}
      />
    </div>
  );
}
