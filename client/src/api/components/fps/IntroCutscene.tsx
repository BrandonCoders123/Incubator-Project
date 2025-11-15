import { useState, useEffect } from 'react';
import { useFPS } from '../../lib/stores/useFPS';

export default function IntroCutscene() {
  const { skipCutscene } = useFPS();
  const [currentScene, setCurrentScene] = useState(0);
  
  const scenes = [
    {
      text: "In the peaceful town of Hot Dog Haven, a young hot dog named Hayden lived happily with his family...",
      duration: 4000
    },
    {
      text: "But one fateful day, an army of robot hot dogs descended upon the town!",
      duration: 4000
    },
    {
      text: "They captured Hayden's parents and took them to their stronghold at Mustard Mountain!",
      duration: 4000
    },
    {
      text: "Now Hayden must be brave. He must conquer the robot settlements scattered across the land...",
      duration: 4000
    },
    {
      text: "Along the way, he'll rescue captured hot dog allies and grow stronger.",
      duration: 4000
    },
    {
      text: "Only by defeating all four robot settlements can Hayden reach Mustard Mountain and save his parents!",
      duration: 4000
    },
    {
      text: "The legend of MUSTARD begins now...",
      duration: 3000,
      isLast: true
    }
  ];
  
  useEffect(() => {
    if (currentScene < scenes.length - 1) {
      const timer = setTimeout(() => {
        setCurrentScene(currentScene + 1);
      }, scenes[currentScene].duration);
      
      return () => clearTimeout(timer);
    } else {
      // Automatically start the game after the last scene
      const timer = setTimeout(() => {
        skipCutscene();
      }, scenes[currentScene].duration);
      
      return () => clearTimeout(timer);
    }
  }, [currentScene, scenes, skipCutscene]);
  
  const handleSkip = () => {
    skipCutscene();
  };
  
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 50%, #fdc830 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
        zIndex: 2000,
        padding: '40px',
      }}
    >
      <div
        style={{
          maxWidth: '800px',
          textAlign: 'center',
          background: 'rgba(0, 0, 0, 0.6)',
          padding: '60px',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <h2
          style={{
            fontSize: '28px',
            lineHeight: '1.8',
            marginBottom: '40px',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
            minHeight: '120px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {scenes[currentScene].text}
        </h2>
        
        <div
          style={{
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '30px',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '10px',
            }}
          >
            {scenes.map((_, index) => (
              <div
                key={index}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: index === currentScene ? '#fdc830' : 'rgba(255, 255, 255, 0.3)',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>
        
        <button
          onClick={handleSkip}
          style={{
            marginTop: '40px',
            padding: '12px 30px',
            fontSize: '18px',
            fontWeight: 'bold',
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: '2px solid white',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.2)';
          }}
        >
          Skip Cutscene
        </button>
      </div>
    </div>
  );
}
