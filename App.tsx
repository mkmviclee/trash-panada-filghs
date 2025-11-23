import React from 'react';
import GameCanvas from './components/GameCanvas';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen bg-gray-900 flex items-center justify-center overflow-hidden">
      <GameCanvas />
    </div>
  );
};

export default App;