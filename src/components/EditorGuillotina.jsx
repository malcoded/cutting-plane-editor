import React, { useState } from "react";
import { Stage, Layer, Rect, Group, Line, Text } from "react-konva";

const BOARD_WIDTH = 2440;
const BOARD_HEIGHT = 2150;
const SCALE = 0.25;

const initialPieces = [
  { id: "p1", width: 400, height: 1000, x: 10, y: 2200, rotated: false },
  { id: "p2", width: 360, height: 500, x: 420, y: 2200, rotated: false },
  { id: "p3", width: 470, height: 470, x: 790, y: 2200, rotated: false },
];

export default function EditorGuillotina() {
  const [pieces, setPieces] = useState(initialPieces);
  const [draggingId, setDraggingId] = useState(null);

  const handleDragMove = (e, id) => {
    const { x, y } = e.target.position();
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, x: x / SCALE, y: y / SCALE } : p))
    );
  };

  const handleDblClick = (id) => {
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotated: !p.rotated } : p))
    );
  };

  const isInsideBoard = (piece) => {
    const w = piece.rotated ? piece.height : piece.width;
    const h = piece.rotated ? piece.width : piece.height;
    return (
      piece.x >= 0 &&
      piece.y >= 0 &&
      piece.x + w <= BOARD_WIDTH &&
      piece.y + h <= BOARD_HEIGHT
    );
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-2">Editor de Corte - Guillotina</h1>
      <div className="mb-2">
        <p className="text-sm">
          Doble clic en una pieza para rotarla. Arrastra para mover.
        </p>
      </div>
      <Stage
        width={BOARD_WIDTH * SCALE + 300}
        height={BOARD_HEIGHT * SCALE + 100}
      >
        <Layer>
          {/* Tablero */}
          <Rect
            x={0}
            y={0}
            width={BOARD_WIDTH * SCALE}
            height={BOARD_HEIGHT * SCALE}
            fill="#f0f0f0"
            stroke="black"
            strokeWidth={1}
          />

          {/* Piezas */}
          {pieces.map((p) => {
            const w = (p.rotated ? p.height : p.width) * SCALE;
            const h = (p.rotated ? p.width : p.height) * SCALE;
            const valid = isInsideBoard(p);
            return (
              <Group
                key={p.id}
                x={p.x * SCALE}
                y={p.y * SCALE}
                draggable
                onDragMove={(e) => handleDragMove(e, p.id)}
                onDragStart={() => setDraggingId(p.id)}
                onDragEnd={() => setDraggingId(null)}
                onDblClick={() => handleDblClick(p.id)}
              >
                <Rect
                  width={w}
                  height={h}
                  fill={valid ? "#b0e0a8" : "#f99"}
                  stroke="black"
                  strokeWidth={1}
                />
                <Text
                  text={`${p.width}x${p.height}`}
                  fontSize={12}
                  fill="black"
                  y={h / 2 - 6}
                  x={4}
                />
              </Group>
            );
          })}

          {/* Líneas de corte guillotina (simulación) */}
          <Line
            points={[0, 1000 * SCALE, BOARD_WIDTH * SCALE, 1000 * SCALE]}
            stroke="red"
            strokeWidth={1}
            dash={[4, 4]}
          />
          <Line
            points={[1200 * SCALE, 0, 1200 * SCALE, BOARD_HEIGHT * SCALE]}
            stroke="red"
            strokeWidth={1}
            dash={[4, 4]}
          />
        </Layer>
      </Stage>
    </div>
  );
}
