import React, { useState, useRef, useEffect } from "react";
import { Stage, Layer, Rect, Group, Text, Line, Circle } from "react-konva";

const BOARD_WIDTH = 1220;
const BOARD_HEIGHT = 2440;
const MARGIN = 5;
const MAX_LEVEL = 6;

const initialPlacedPieces = [];
const initialUnplacedPieces = [
  { id: 1, width: 1000, height: 400, rotated: false, label: "Piece 1" },
  { id: 2, width: 800, height: 300, rotated: false, label: "Piece 2" },
  { id: 3, width: 200, height: 500, rotated: false, label: "Loose 1" },
  { id: 4, width: 400, height: 600, rotated: false, label: "Piece 3" },
  { id: 5, width: 120, height: 370, rotated: false, label: "Piece 4" },
];

function isOverlapping(p1, p2) {
  return (
    p1.x < p2.x + p2.width &&
    p1.x + p1.width > p2.x &&
    p1.y < p2.y + p2.height &&
    p1.y + p1.height > p2.y
  );
}

function validatePiece(piece, pieces) {
  const withinBoard =
    piece.x >= MARGIN &&
    piece.y >= MARGIN &&
    piece.x + piece.width <= BOARD_WIDTH - MARGIN &&
    piece.y + piece.height <= BOARD_HEIGHT - MARGIN;

  const overlapping = pieces.some(
    (p) => p.id !== piece.id && isOverlapping(piece, p)
  );

  return { valid: withinBoard && !overlapping, overlapping, withinBoard };
}

function generateCutLines(pieces, cutDirection) {
  const lines = [];

  function recursiveCuts(area, piecesInArea, currentLevel, direction) {
    if (currentLevel > MAX_LEVEL || piecesInArea.length <= 1) return;

    const positions = new Set();
    for (const piece of piecesInArea) {
      if (direction === "vertical") {
        positions.add(piece.x);
        positions.add(piece.x + piece.width);
      } else {
        positions.add(piece.y);
        positions.add(piece.y + piece.height);
      }
    }

    const sorted = [...positions].sort((a, b) => a - b);
    for (const pos of sorted) {
      const cut =
        direction === "vertical"
          ? { x1: pos, y1: area.y, x2: pos, y2: area.y + area.height }
          : { x1: area.x, y1: pos, x2: area.x + area.width, y2: pos };
      lines.push({ id: lines.length, ...cut, level: currentLevel });
    }

    for (const pos of sorted.slice(0, -1)) {
      const nextArea =
        direction === "vertical"
          ? { x: pos, y: area.y, width: sorted[1] - pos, height: area.height }
          : { x: area.x, y: pos, width: area.width, height: sorted[1] - pos };

      const contained = piecesInArea.filter(
        (p) =>
          p.x >= nextArea.x &&
          p.y >= nextArea.y &&
          p.x + p.width <= nextArea.x + nextArea.width &&
          p.y + p.height <= nextArea.y + nextArea.height
      );

      if (contained.length > 1) {
        recursiveCuts(
          nextArea,
          contained,
          currentLevel + 1,
          direction === "vertical" ? "horizontal" : "vertical"
        );
      }
    }
  }

  recursiveCuts(
    { x: 0, y: 0, width: BOARD_WIDTH, height: BOARD_HEIGHT },
    pieces,
    1,
    cutDirection
  );
  return lines;
}

export default function CuttingPlanEditor() {
  const [placedPieces, setPlacedPieces] = useState(initialPlacedPieces);
  const [unplacedPieces, setUnplacedPieces] = useState(initialUnplacedPieces);
  const [selectedId, setSelectedId] = useState(null);
  const [cuts, setCuts] = useState([]);
  const [cutDirection, setCutDirection] = useState("vertical");
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const availableWidth = containerWidth * 0.85;
      const availableHeight = window.innerHeight - 100;
      const scaleX = availableWidth / BOARD_WIDTH;
      const scaleY = availableHeight / BOARD_HEIGHT;
      setScale(Math.min(scaleX, scaleY, 1));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    setCuts(generateCutLines(placedPieces, cutDirection));
  }, [placedPieces, cutDirection]);

  useEffect(() => {
    if (placedPieces.length === 1) {
      const piece = placedPieces[0];
      setCutDirection(piece.width > piece.height ? "vertical" : "horizontal");
    }
  }, [placedPieces]);

  const handleDragMove = (e, id) => {
    const { x, y } = e.target.position();
    setPlacedPieces((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, x, y } : p));
      return updated;
    });
  };

  const handleDragEnd = (e, piece) => {
    const { x, y } = e.target.position();
    const newPiece = { ...piece, x, y };
    const validation = validatePiece(newPiece, placedPieces);
    if (!validation.valid) {
      setPlacedPieces((prev) => prev.filter((p) => p.id !== piece.id));
      setUnplacedPieces((prev) => [...prev, { ...piece }]);
    }
  };

  const toggleRotation = (id) => {
    setPlacedPieces((prev) => {
      const updated = prev.map((p) =>
        p.id === id
          ? { ...p, rotated: !p.rotated, width: p.height, height: p.width }
          : p
      );
      return updated;
    });
  };

  const placeUnplacedPiece = (piece, index) => {
    const newPiece = {
      ...piece,
      x: MARGIN + index * 10,
      y: MARGIN + index * 10,
    };
    setPlacedPieces((prev) => [...prev, newPiece]);
    setUnplacedPieces((prev) => prev.filter((p) => p.id !== piece.id));
  };

  const autoPlaceUnplacedPieces = () => {
    let newPlaced = [...placedPieces];
    let newUnplaced = [];

    for (const piece of unplacedPieces) {
      let placed = false;
      for (let y = MARGIN; y <= BOARD_HEIGHT - piece.height - MARGIN; y += 5) {
        for (let x = MARGIN; x <= BOARD_WIDTH - piece.width - MARGIN; x += 5) {
          const newPiece = { ...piece, x, y };
          const validation = validatePiece(newPiece, newPlaced);
          if (validation.valid) {
            newPlaced.push(newPiece);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) newUnplaced.push(piece);
    }

    setPlacedPieces(newPlaced);
    setUnplacedPieces(newUnplaced);
  };

  const drawPiece = (piece) => {
    const { valid, overlapping } = validatePiece(piece, placedPieces);
    const color = valid ? "#88cc88" : overlapping ? "#ff6666" : "#ffcc66";

    return (
      <Group
        key={piece.id}
        x={piece.x}
        y={piece.y}
        draggable
        onDragMove={(e) => handleDragMove(e, piece.id)}
        onDragEnd={(e) => handleDragEnd(e, piece)}
        onClick={() => setSelectedId(piece.id)}
        onDblClick={() => toggleRotation(piece.id)}
      >
        <Rect
          width={piece.width}
          height={piece.height}
          fill={color}
          stroke={selectedId === piece.id ? "blue" : "black"}
          strokeWidth={2}
        />
        <Text
          text={`${piece.label}\n${piece.width}x${piece.height}`}
          fontSize={20}
          fill="black"
          x={4}
          y={4}
        />
      </Group>
    );
  };

  const drawCutLine = (cut) => {
    const colors = [
      "red",
      "orange",
      "green",
      "blue",
      "purple",
      "magenta",
      "brown",
    ];
    const stroke = colors[cut.level % colors.length] || "black";
    return (
      <Group key={`cut-${cut.id}`}>
        <Line
          points={[cut.x1, cut.y1, cut.x2, cut.y2]}
          stroke={stroke}
          strokeWidth={1.5}
          dash={[4, 2]}
        />
        <Circle
          x={(cut.x1 + cut.x2) / 2}
          y={(cut.y1 + cut.y2) / 2}
          radius={10}
          fill="white"
        />
        <Text
          text={`L${cut.level}`}
          fontSize={12}
          fill="black"
          x={(cut.x1 + cut.x2) / 2 - 6}
          y={(cut.y1 + cut.y2) / 2 - 6}
        />
      </Group>
    );
  };

  return (
    <div
      ref={containerRef}
      className="flex gap-4 mt-4 w-full h-screen overflow-hidden"
    >
      <div className="flex-1 border rounded-lg shadow overflow-auto mr-4">
        <Stage
          width={BOARD_WIDTH * scale}
          height={BOARD_HEIGHT * scale}
          scale={{ x: scale, y: scale }}
        >
          <Layer>
            <Rect
              width={BOARD_WIDTH}
              height={BOARD_HEIGHT}
              fill="#f0f0f0"
              stroke="black"
              strokeWidth={2}
            />
            {cuts.map(drawCutLine)}
            {placedPieces.map(drawPiece)}
          </Layer>
        </Stage>
      </div>

      <div className="w-[15%] border border-dashed rounded-lg p-4 flex flex-col items-center justify-start text-center text-gray-500">
        <div className="text-lg font-semibold mb-2">📦 Unplaced Pieces</div>
        <p className="text-sm mb-4">
          Drag pieces into this area to remove them from the board.
        </p>
        <div className="space-y-2 w-full">
          {unplacedPieces.map((piece, index) => (
            <button
              key={piece.id}
              className="w-full bg-gray-200 px-3 py-1 rounded shadow text-sm hover:bg-gray-300"
              onClick={() => placeUnplacedPiece(piece, index)}
            >
              {piece.label} ({piece.width}×{piece.height})
            </button>
          ))}
        </div>
        <button
          className="mt-6 w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
          onClick={autoPlaceUnplacedPieces}
        >
          Auto-place pieces
        </button>
        <div className="mt-4 w-full text-left">
          <label className="text-sm font-medium">Cut Direction:</label>
          <select
            className="w-full mt-1 border px-2 py-1 rounded text-sm"
            value={cutDirection}
            onChange={(e) => setCutDirection(e.target.value)}
            disabled={placedPieces.length <= 1}
          >
            <option value="vertical">Vertical First</option>
            <option value="horizontal">Horizontal First</option>
          </select>
        </div>
      </div>
    </div>
  );
}
