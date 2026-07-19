import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';

type Point = { x: number; y: number };
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

const SPEED = 120;
const MIN_CELL = 16;

function randomFood(snake: Point[], cols: number, rows: number): Point {
  let p: Point;
  do {
    p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
  } while (snake.some((s) => s.x === p.x && s.y === p.y));
  return p;
}

export default function SnakeGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState({ cols: 20, rows: 20, cell: 24 });
  const gridRef = useRef(gridSize);
  gridRef.current = gridSize;

  const initialSnake: Point[] = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
  const [snake, setSnake] = useState<Point[]>(initialSnake);
  const [food, setFood] = useState<Point>(() => randomFood(initialSnake, 20, 20));
  const [dir, setDir] = useState<Direction>('RIGHT');
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const dirRef = useRef<Direction>('RIGHT');

  useLayoutEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const availW = width - 16;
      const availH = height - 60;
      if (availW < 100 || availH < 100) return;
      const cell = Math.max(MIN_CELL, Math.floor(Math.min(availH / 15, availW / 20)));
      const cols = Math.floor(availW / cell);
      const rows = Math.floor(availH / cell);
      setGridSize({ cols, rows, cell });
    };
    measure();
    const obs = new ResizeObserver(measure);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const restart = useCallback(() => {
    const { cols, rows } = gridRef.current;
    const startX = Math.min(5, cols - 4);
    const startY = Math.min(5, rows - 1);
    const s = [{ x: startX, y: startY }, { x: startX - 1, y: startY }, { x: startX - 2, y: startY }];
    setSnake(s);
    setFood(randomFood(s, cols, rows));
    setDir('RIGHT');
    dirRef.current = 'RIGHT';
    setGameOver(false);
    setScore(0);
  }, []);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
        w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
      };
      const next = map[e.key];
      if (!next) return;
      e.preventDefault();
      const opposites: Record<Direction, Direction> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
      if (opposites[next] !== dirRef.current) {
        dirRef.current = next;
        setDir(next);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      setSnake((prev) => {
        const { cols, rows } = gridRef.current;
        const head = prev[0];
        const d = dirRef.current;
        const next: Point = {
          x: head.x + (d === 'RIGHT' ? 1 : d === 'LEFT' ? -1 : 0),
          y: head.y + (d === 'DOWN' ? 1 : d === 'UP' ? -1 : 0),
        };
        if (next.x < 0 || next.x >= cols || next.y < 0 || next.y >= rows) {
          setGameOver(true);
          return prev;
        }
        if (prev.some((s) => s.x === next.x && s.y === next.y)) {
          setGameOver(true);
          return prev;
        }
        const ate = next.x === food.x && next.y === food.y;
        const newSnake = [next, ...prev];
        if (!ate) newSnake.pop();
        if (ate) {
          setScore((s) => {
            const ns = s + 1;
            setHighScore((h) => Math.max(h, ns));
            return ns;
          });
          setFood(randomFood(newSnake, cols, rows));
        }
        return newSnake;
      });
    }, SPEED);
    return () => clearInterval(interval);
  }, [gameOver, food]);

  const { cols, rows, cell } = gridSize;
  const boardW = cols * cell;
  const boardH = rows * cell;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="w-full h-full min-h-0 flex flex-col items-center justify-center bg-black rounded-lg outline-none select-none overflow-hidden"
    >
      <div className="flex items-center gap-4 text-xs text-slate-400 mb-2">
        <span>Score: <span className="font-semibold text-white">{score}</span></span>
        <span>Best: <span className="font-semibold text-white">{highScore}</span></span>
      </div>
      <div
        className="relative bg-slate-900 border border-slate-700 rounded"
        style={{ width: boardW, height: boardH }}
      >
        <div
          className="absolute rounded-sm bg-red-400"
          style={{ left: food.x * cell + 1, top: food.y * cell + 1, width: cell - 2, height: cell - 2 }}
        />
        {snake.map((seg, i) => (
          <div
            key={i}
            className={`absolute rounded-sm ${i === 0 ? 'bg-emerald-400' : 'bg-emerald-500/70'}`}
            style={{ left: seg.x * cell + 1, top: seg.y * cell + 1, width: cell - 2, height: cell - 2 }}
          />
        ))}
        {gameOver && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
            <p className="text-white font-semibold text-sm">Game Over</p>
            <button
              onClick={restart}
              className="px-3 py-1.5 text-xs font-medium bg-white text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-400 mt-2">Arrow keys or WASD to move</p>
    </div>
  );
}
