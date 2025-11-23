export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export interface Pipe {
  x: number;
  topHeight: number;
  passed: boolean;
}

export interface TrashItem {
  id: number;
  x: number;
  y: number;
  type: string; // Emoji char
  collected: boolean;
}

export interface GamePhysics {
  birdY: number;
  birdVelocity: number;
  pipes: Pipe[];
  trash: TrashItem[];
  score: number;
  highScore: number;
}

export interface Dimensions {
  width: number;
  height: number;
}