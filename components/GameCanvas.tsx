import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Play, RefreshCw, Trash2 } from 'lucide-react';
import { GameState, Pipe, TrashItem } from '../types';
import {
  GRAVITY,
  JUMP_STRENGTH,
  PIPE_SPEED,
  PIPE_SPAWN_RATE,
  PIPE_WIDTH,
  PIPE_GAP,
  BIRD_SIZE,
  GROUND_HEIGHT,
  PIPE_COLOR,
  PIPE_BORDER_COLOR,
  SKY_GRADIENT_START,
  SKY_GRADIENT_END,
  BUILDING_COLOR,
  MOON_COLOR,
  TRASH_TYPES,
  TRASH_SPAWN_CHANCE,
  TRASH_SIZE,
  SCORE_PER_TRASH
} from '../constants';
import { getTrashPandaRoast } from '../services/geminiService';

type Building = {
  width: number;
  height: number;
  windowPattern: boolean;
  windows: boolean[];
};

const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCountRef = useRef<number>(0);
  const spawnFrameRef = useRef<number>(0);
  const roastRequestRef = useRef<number>(0);
  
  // Game State (Mutable Refs for Loop Performance)
  const gameStateRef = useRef<GameState>(GameState.START);
  const birdY = useRef<number>(300);
  const birdVelocity = useRef<number>(0);
  const pipes = useRef<Pipe[]>([]);
  const trashItems = useRef<TrashItem[]>([]);
  const score = useRef<number>(0);
  const nextTrashId = useRef<number>(0);
  const highScoreRef = useRef<number>(0);
  
  // React State for UI Rendering (Menu, Game Over)
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [displayScore, setDisplayScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [aiCommentary, setAiCommentary] = useState<string>("");
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 600 });

  // Generate static building data for background. Windows are chosen once
  // so the skyline does not flicker every frame.
  const buildings = useMemo<Building[]>(() => {
    return Array.from({ length: 20 }, () => {
      const width = 40 + Math.random() * 60;
      const height = 100 + Math.random() * 200;
      const windowPattern = Math.random() > 0.5;
      const windows: boolean[] = [];
      if (windowPattern) {
        for (let wy = 10; wy < height - 10; wy += 20) {
          for (let wx = 5; wx < width - 10; wx += 15) {
            windows.push(Math.random() > 0.45);
          }
        }
      }
      return { width, height, windowPattern, windows };
    });
  }, []);

  // Initialize Canvas Size
  useEffect(() => {
    const handleResize = () => {
      const width = Math.max(280, Math.min(window.innerWidth || 480, 480));
      const height = Math.max(360, window.innerHeight - 72);
      setCanvasSize({ width, height });
      if (gameStateRef.current !== GameState.PLAYING) {
        birdY.current = height / 2;
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const spawnPipe = useCallback(() => {
    const minPipeHeight = 48;
    const bottomReserve = GROUND_HEIGHT + 24;
    const maxTop = canvasSize.height - bottomReserve - PIPE_GAP - minPipeHeight;
    const span = Math.max(0, maxTop - minPipeHeight);
    const topHeight = minPipeHeight + Math.floor(Math.random() * (span + 1));
    
    pipes.current.push({
      x: canvasSize.width,
      topHeight,
      passed: false,
    });

    // Spawn Trash centered in the gap
    if (Math.random() < TRASH_SPAWN_CHANCE) {
      const trashType = TRASH_TYPES[Math.floor(Math.random() * TRASH_TYPES.length)];
      const gapCenter = topHeight + (PIPE_GAP / 2);
      
      trashItems.current.push({
        id: nextTrashId.current++,
        x: canvasSize.width + (PIPE_WIDTH / 2) - (TRASH_SIZE / 2),
        y: gapCenter - (TRASH_SIZE / 2),
        type: trashType,
        collected: false
      });
    }
  }, [canvasSize]);

  const resetGame = useCallback(() => {
    birdY.current = canvasSize.height / 2;
    birdVelocity.current = 0;
    pipes.current = [];
    trashItems.current = [];
    score.current = 0;
    spawnFrameRef.current = 0;
    setDisplayScore(0);
    setAiCommentary("");
    setIsLoadingAi(false);
    roastRequestRef.current += 1;
  }, [canvasSize.height]);

  const gameOver = useCallback(() => {
    if (gameStateRef.current === GameState.GAME_OVER) return;
    gameStateRef.current = GameState.GAME_OVER;
    setGameState(GameState.GAME_OVER);

    const finalScore = score.current;
    if (finalScore > highScoreRef.current) {
      highScoreRef.current = finalScore;
      setHighScore(finalScore);
      try {
        localStorage.setItem('trashPandaHighScore', finalScore.toString());
      } catch {
        // Storage can be blocked; the in-memory best still updates.
      }
    }

    const requestId = ++roastRequestRef.current;
    setIsLoadingAi(true);
    getTrashPandaRoast(finalScore)
      .then((roast) => {
        if (roastRequestRef.current === requestId) setAiCommentary(roast);
      })
      .catch(() => {
        if (roastRequestRef.current === requestId) {
          setAiCommentary("Better luck next time, trash panda!");
        }
      })
      .finally(() => {
        if (roastRequestRef.current === requestId) setIsLoadingAi(false);
      });
  }, []);

  const startGame = useCallback(() => {
    resetGame();
    gameStateRef.current = GameState.PLAYING;
    setGameState(GameState.PLAYING);
    birdVelocity.current = JUMP_STRENGTH;
  }, [resetGame]);

  const jump = useCallback(() => {
    if (gameStateRef.current === GameState.PLAYING) {
      birdVelocity.current = JUMP_STRENGTH;
      return;
    }
    startGame();
  }, [startGame]);

  const drawRaccoon = (ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number, velocity: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    const scale = 0.9;
    ctx.scale(scale, scale);

    const isJumping = velocity < 0;
    const isFalling = velocity > 2;

    // --- Dynamic Limb Positions ---
    // Default angles
    let frontLegAngle = 0; 
    let backLegAngle = 0;
    let tailAngle = -0.2;

    if (isJumping) {
        // Jumping: Legs tucked/forward (Superman style or pounce)
        frontLegAngle = -0.5; // Reach forward/up
        backLegAngle = 0.5;   // Kick back
        tailAngle = 0.1;      // Tail streams back flat
    } else if (isFalling) {
        // Falling: Flailing
        frontLegAngle = -0.8; // Arms up in panic/drag
        backLegAngle = -0.3;  // Legs dangling
        tailAngle = -0.5;     // Tail up
    }

    // --- Drawing ---

    // Tail (Back left)
    ctx.save();
    ctx.rotate(tailAngle);
    ctx.fillStyle = '#7f8c8d'; // Grey
    ctx.beginPath();
    ctx.ellipse(-22, 5, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Tail stripes
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-28, 0); ctx.lineTo(-28, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-20, 2); ctx.lineTo(-20, 12);
    ctx.stroke();
    ctx.restore();

    // Body
    ctx.fillStyle = '#95a5a6'; // Light Grey
    ctx.beginPath();
    ctx.ellipse(-2, 5, 18, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    // Back leg
    ctx.save();
    ctx.translate(-8, 14);
    ctx.rotate(backLegAngle);
    ctx.fillStyle = '#2c3e50'; 
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 5, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Front leg
    ctx.save();
    ctx.translate(6, 14);
    ctx.rotate(frontLegAngle);
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 5, -0.2, 0, Math.PI * 2); ctx.fill(); 
    ctx.restore();

    // Head
    ctx.fillStyle = '#95a5a6';
    ctx.beginPath();
    ctx.arc(14, -4, 13, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = '#566061'; // Darker grey outer
    ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(14, -24); ctx.lineTo(20, -14); ctx.fill(); // Right ear
    ctx.beginPath(); ctx.moveTo(-2, -11); ctx.lineTo(4, -21); ctx.lineTo(10, -11); ctx.fill(); // Left ear

    // Mask (The bandit look)
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath();
    ctx.ellipse(16, -4, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Snout/Nose area
    ctx.fillStyle = '#ecf0f1'; // White snout
    ctx.beginPath(); ctx.ellipse(22, 1, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'black'; // Nose tip
    ctx.beginPath(); ctx.arc(24, 0.5, 1.5, 0, Math.PI * 2); ctx.fill();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(12, -5, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(19, -5, 2.5, 0, Math.PI * 2); ctx.fill();
    
    // Pupils
    ctx.fillStyle = 'black';
    // Pupil looking direction slightly depends on velocity?
    const pupilY = isFalling ? -4 : -5;
    ctx.beginPath(); ctx.arc(13, pupilY, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(20, pupilY, 1, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Sky Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, SKY_GRADIENT_START);
    gradient.addColorStop(1, SKY_GRADIENT_END);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Moon
    ctx.fillStyle = MOON_COLOR;
    ctx.shadowBlur = 20;
    ctx.shadowColor = MOON_COLOR;
    ctx.beginPath();
    ctx.arc(width - 50, 60, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // Reset shadow

    // Stars
    ctx.fillStyle = 'white';
    // Use pseudo-random seeded by coordinate for consistent stars
    for(let i=0; i<20; i++) {
        const x = (i * 1234) % width;
        const y = (i * 6789) % (height / 2);
        const size = (i % 3) === 0 ? 2 : 1;
        ctx.fillRect(x, y, size, size);
    }

    // Scrolling City Skyline (Parallax)
    const scrollSpeed = 0.5; // Slower than pipes
    const totalWidth = buildings.reduce((sum, building) => sum + building.width, 0) || 1;
    const offset = (frameCountRef.current * scrollSpeed) % totalWidth;
    
    ctx.fillStyle = BUILDING_COLOR;
    let currentX = -offset;
    
    // Draw enough buildings to fill screen + buffer
    let i = 0;
    while (currentX < width && i < buildings.length * 4) {
        const building = buildings[i % buildings.length];
        const bHeight = building.height;
        const bWidth = building.width;
        
        ctx.fillStyle = BUILDING_COLOR;
        ctx.fillRect(currentX, height - bHeight - GROUND_HEIGHT, bWidth + 2, bHeight + GROUND_HEIGHT); // +2 to cover gaps
        
        if (building.windowPattern) {
           let windowIndex = 0;
           for (let wy = 10; wy < bHeight - 10; wy += 20) {
              for (let wx = 5; wx < bWidth - 10; wx += 15) {
                  const lit = building.windows[windowIndex++];
                  ctx.fillStyle = lit ? '#f3d36b' : '#12141f';
                  ctx.fillRect(currentX + wx, height - bHeight - GROUND_HEIGHT + wy, 6, 8);
              }
           }
        }

        currentX += bWidth;
        i++;
    }
  };

  const update = useCallback(() => {
    frameCountRef.current++;

    if (gameStateRef.current !== GameState.PLAYING) {
      draw();
      return;
    }

    // Physics
    birdVelocity.current = Math.min(birdVelocity.current + GRAVITY, 14);
    birdY.current += birdVelocity.current;

    // Spawn Pipes and Trash
    spawnFrameRef.current++;
    if (spawnFrameRef.current % PIPE_SPAWN_RATE === 0) {
      spawnPipe();
    }

    // Update Pipes
    pipes.current.forEach(pipe => {
      pipe.x -= PIPE_SPEED;
    });
    // Remove off-screen pipes
    pipes.current = pipes.current.filter(pipe => pipe.x + PIPE_WIDTH > -10);

    // Update Trash
    trashItems.current.forEach(item => {
      item.x -= PIPE_SPEED;
    });
    // Remove off-screen or collected trash
    trashItems.current = trashItems.current.filter(item => item.x > -50 && !item.collected);

    const groundY = canvasSize.height - GROUND_HEIGHT;
    const birdRect = {
      left: canvasSize.width / 2 - BIRD_SIZE / 2 + 5,
      right: canvasSize.width / 2 + BIRD_SIZE / 2 - 5,
      top: birdY.current - BIRD_SIZE / 2 + 5,
      bottom: birdY.current + BIRD_SIZE / 2 - 5
    };

    // Ground/Ceiling
    if (birdRect.bottom >= groundY || birdRect.top <= 0) {
      if (birdRect.bottom >= groundY) {
        birdY.current = groundY - BIRD_SIZE / 2 + 5;
        birdVelocity.current = 0;
      }
      gameOver();
      draw();
      return;
    }

    // Pipes
    for (const pipe of pipes.current) {
      const pipeLeft = pipe.x;
      const pipeRight = pipe.x + PIPE_WIDTH;

      if (birdRect.right > pipeLeft && birdRect.left < pipeRight) {
        if (birdRect.top < pipe.topHeight || birdRect.bottom > pipe.topHeight + PIPE_GAP) {
          gameOver();
          draw();
          return;
        }
      }

      if (!pipe.passed && birdRect.left > pipeRight) {
        score.current += 1;
        pipe.passed = true;
        setDisplayScore(score.current);
      }
    }

    // Trash Collection
    const raccoonCenterX = canvasSize.width / 2;
    const raccoonCenterY = birdY.current;
    const raccoonRadius = BIRD_SIZE / 2;
    const trashRadius = TRASH_SIZE / 2;

    for (const item of trashItems.current) {
      if (item.collected) continue;
      const dx = (item.x + trashRadius) - raccoonCenterX;
      const dy = (item.y + trashRadius) - raccoonCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < raccoonRadius + trashRadius) {
        item.collected = true;
        score.current += SCORE_PER_TRASH;
        setDisplayScore(score.current);
      }
    }

    draw();
  }, [canvasSize, spawnPipe, gameOver, buildings]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw Background
    drawBackground(ctx, canvas.width, canvas.height);

    // 2. Draw Pipes
    pipes.current.forEach(pipe => {
      // Top Pipe
      ctx.fillStyle = PIPE_COLOR;
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PIPE_BORDER_COLOR;
      ctx.strokeRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
      
      // Pipe Cap (Top)
      ctx.fillStyle = '#5c85b5'; // Slightly lighter cap
      ctx.fillRect(pipe.x - 2, pipe.topHeight - 20, PIPE_WIDTH + 4, 20);
      ctx.strokeRect(pipe.x - 2, pipe.topHeight - 20, PIPE_WIDTH + 4, 20);

      // Bottom Pipe
      const bottomPipeY = pipe.topHeight + PIPE_GAP;
      const bottomPipeHeight = canvas.height - bottomPipeY;
      ctx.fillStyle = PIPE_COLOR;
      ctx.fillRect(pipe.x, bottomPipeY, PIPE_WIDTH, bottomPipeHeight);
      ctx.strokeRect(pipe.x, bottomPipeY, PIPE_WIDTH, bottomPipeHeight);
      
      // Pipe Cap (Bottom)
      ctx.fillStyle = '#5c85b5';
      ctx.fillRect(pipe.x - 2, bottomPipeY, PIPE_WIDTH + 4, 20);
      ctx.strokeRect(pipe.x - 2, bottomPipeY, PIPE_WIDTH + 4, 20);
      
      // Industrial Details (Bolts)
      ctx.fillStyle = '#2c4365';
      ctx.beginPath(); ctx.arc(pipe.x + 5, pipe.topHeight - 10, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(pipe.x + PIPE_WIDTH - 5, pipe.topHeight - 10, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(pipe.x + 5, bottomPipeY + 10, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(pipe.x + PIPE_WIDTH - 5, bottomPipeY + 10, 2, 0, Math.PI*2); ctx.fill();
    });

    // 3. Draw Trash
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${TRASH_SIZE}px serif`;
    trashItems.current.forEach(item => {
       if (!item.collected) {
         // Simple floating effect
         const floatY = Math.sin(frameCountRef.current * 0.1) * 3;
         ctx.fillText(item.type, item.x + TRASH_SIZE/2, item.y + TRASH_SIZE/2 + floatY);
       }
    });

    // 4. Draw Ground
    ctx.fillStyle = '#1e272e'; // Dark asphalt
    ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);
    // Road markings
    ctx.fillStyle = '#f1c40f'; // Yellow stripe
    const stripeOffset = (frameCountRef.current * PIPE_SPEED) % 40;
    for (let i = -40; i < canvas.width; i += 40) {
        ctx.fillRect(i - stripeOffset, canvas.height - GROUND_HEIGHT / 2 - 2, 20, 4);
    }

    // 5. Draw Raccoon
    const rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (birdVelocity.current * 0.1)));
    drawRaccoon(ctx, canvas.width / 2, birdY.current, rotation, birdVelocity.current);

  }, [canvasSize, buildings]); 

  // Loop Management. The frame loop always runs; physics consults gameStateRef
  // so a collision can stop the round before the next React render.
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      update();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [update]);

  // Key Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jump]);

  // Load high score
  useEffect(() => {
    try {
      const saved = localStorage.getItem('trashPandaHighScore');
      const parsed = saved ? parseInt(saved, 10) : 0;
      if (parsed > 0) {
        highScoreRef.current = parsed;
        setHighScore(parsed);
      }
    } catch {
      // Ignore unavailable storage.
    }
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-gray-900 select-none overflow-hidden">
      
      {/* Game Container */}
      <div 
        className="relative shadow-2xl overflow-hidden bg-black ring-8 ring-gray-800 rounded-lg cursor-pointer touch-none"
        style={{ width: canvasSize.width, height: canvasSize.height }}
        onPointerDown={(e) => {
          e.preventDefault(); // Prevent default touch actions
          jump();
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="block"
        />

        {/* Score Overlay (Playing) */}
        {gameState === GameState.PLAYING && (
          <div className="absolute top-10 w-full text-center z-10 pointer-events-none">
             <span className="pixel-font text-5xl text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] font-bold stroke-black">
               {displayScore}
             </span>
          </div>
        )}

        {/* Start Screen Overlay */}
        {gameState === GameState.START && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20">
            <div className="bg-gray-800/90 p-6 rounded-2xl shadow-xl text-center animate-bounce-slow border-4 border-gray-600 max-w-[80%]">
              <h1 className="pixel-font text-2xl md:text-3xl text-orange-500 mb-2 leading-relaxed">TRASH PANDA<br/>FLIGHT</h1>
              <p className="text-gray-300 mb-4 font-bold text-sm">Tap, click, or press space<br/>Collect trash for bonus points</p>
              {highScore > 0 && (
                <p className="pixel-font text-[10px] text-yellow-400 mb-4">BEST {highScore}</p>
              )}
              <div className="flex justify-center gap-4 text-3xl mb-4">
                  <span>🍕</span><span>🦴</span><span>🍎</span>
              </div>
              <div className="flex justify-center">
                <Play size={48} className="text-green-500 fill-green-500 hover:scale-110 transition-transform" />
              </div>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-30 px-4 animate-fade-in">
             <div className="bg-white p-6 rounded-xl shadow-2xl text-center w-full max-w-sm border-4 border-orange-500">
               <h2 className="pixel-font text-3xl text-red-600 mb-4">WASTED</h2>
               
               <div className="flex justify-between mb-4 px-4">
                 <div className="flex flex-col items-center">
                   <span className="text-xs uppercase text-gray-500 font-bold">Score</span>
                   <span className="text-3xl font-bold text-gray-800">{displayScore}</span>
                 </div>
                 <div className="flex flex-col items-center">
                   <span className="text-xs uppercase text-gray-500 font-bold">Best</span>
                   <span className="text-3xl font-bold text-yellow-600">{highScore}</span>
                 </div>
               </div>

               {/* AI Commentary Section */}
               <div className="bg-gray-100 p-3 rounded-lg mb-6 min-h-[80px] flex items-center justify-center relative border border-gray-300">
                  {isLoadingAi ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <RefreshCw className="animate-spin w-4 h-4" />
                      <span className="text-xs italic">Digging through trash...</span>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-800 italic font-medium leading-tight">
                      "{aiCommentary}"
                    </div>
                  )}
                  <div className="absolute -top-3 -right-3 bg-orange-500 text-white text-[10px] px-2 py-1 rounded-full font-bold transform rotate-12 shadow-sm">
                    AI Raccoon
                  </div>
               </div>

               <button 
                 onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); startGame(); }}
                 className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors border-b-4 border-green-800 active:border-b-0 active:translate-y-1"
               >
                 <Play size={20} />
                 PLAY AGAIN
               </button>
             </div>
          </div>
        )}
      </div>
      
      <div className="mt-4 text-gray-600 text-xs flex items-center gap-2">
        <Trash2 size={14} />
        <span>Powered by Gemini 2.5 Flash</span>
      </div>
    </div>
  );
};

export default GameCanvas;