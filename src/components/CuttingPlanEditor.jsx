import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Line, Group, Text } from "react-konva";
import pattern from "./pattern.json";

const BOARD_WIDTH = 2440;
const BOARD_HEIGHT = 2150;

function checkCollision(piece, others) {
  return others.some((other) => {
    if (other.id === piece.id) return false;
    return !(
      piece.x + piece.width <= other.x ||
      piece.x >= other.x + other.width ||
      piece.y + piece.height <= other.y ||
      piece.y >= other.y + other.height
    );
  });
}

export default function GuillotineEditor() {
  const [pieces, setPieces] = useState([]);
  const [freePieces, setFreePieces] = useState([]);
  const [visibleCutLevel, setVisibleCutLevel] = useState(0);
  const containerRef = useRef();
  const [scale, setScale] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const data = pattern[0].layout[0];
    const loadedPieces = data.part.map((p) => {
      const rotated = p.rotated === "True";
      const width = rotated ? parseFloat(p.length) : parseFloat(p.width);
      const height = rotated ? parseFloat(p.width) : parseFloat(p.length);
      return {
        id: parseInt(p.part),
        label: `Pza ${p.nItem}`,
        x: parseFloat(p.x),
        y: parseFloat(p.y),
        width,
        height,
        rotated,
      };
    });
    setPieces(loadedPieces);
  }, []);

  useEffect(() => {
    const resize = () => {
      const containerWidth = containerRef.current?.offsetWidth || 1000;
      const availableHeight = window.innerHeight - 160;
      const scaleX = containerWidth / BOARD_WIDTH;
      const scaleY = availableHeight / BOARD_HEIGHT;
      setScale(Math.min(scaleX, scaleY, 1));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedId !== null && (e.key === "Delete" || e.key === "Escape")) {
        const pieceToRemove = pieces.find((p) => p.id === selectedId);
        if (pieceToRemove) {
          setPieces((prev) => prev.filter((p) => p.id !== selectedId));
          setFreePieces((prev) => [...prev, pieceToRemove]);
          setSelectedId(null);
        }
      }

      if (e.key.toLowerCase() === "r" && selectedId !== null) {
        setPieces((prev) =>
          prev.map((p) =>
            p.id === selectedId
              ? {
                  ...p,
                  width: p.height,
                  height: p.width,
                  rotated: !p.rotated,
                }
              : p
          )
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, pieces]);

  function generateGuillotineCuts(pieces, boardWidth, boardHeight) {
    const cuts = [];
    let cutIndex = 0;

    const sortedPieces = [...pieces].sort((a, b) => a.y - b.y || a.x - b.x);

    function subdivide(area, piecesInArea, level) {
      if (piecesInArea.length <= 1) return;

      const canSplitHorizontally =
        new Set(piecesInArea.map((p) => p.y)).size > 1;
      const canSplitVertically = new Set(piecesInArea.map((p) => p.x)).size > 1;

      if (canSplitHorizontally) {
        const rows = groupBy(piecesInArea, (p) => p.y);
        let offset = area.y;

        for (const [_rowY, rowPieces] of Object.entries(rows)) {
          const rowHeight = Math.max(...rowPieces.map((p) => p.height));
          const nextY = offset + rowHeight;

          if (nextY < area.y + area.height) {
            cuts.push({
              iCut: cutIndex++,
              x1: area.x,
              y1: nextY,
              x2: area.x + area.width,
              y2: nextY,
              aLevel: level,
            });

            subdivide(rowPieces, rowPieces, level + 1);
            subdivide(
              piecesInArea.filter((p) => p.y >= nextY),
              piecesInArea.filter((p) => p.y >= nextY),
              level + 1
            );
            return;
          }
        }
      }

      if (canSplitVertically) {
        const cols = groupBy(piecesInArea, (p) => p.x);
        let offset = area.x;

        for (const [_colX, colPieces] of Object.entries(cols)) {
          const colWidth = Math.max(...colPieces.map((p) => p.width));
          const nextX = offset + colWidth;

          if (nextX < area.x + area.width) {
            cuts.push({
              iCut: cutIndex++,
              x1: nextX,
              y1: area.y,
              x2: nextX,
              y2: area.y + area.height,
              aLevel: level,
            });

            subdivide(colPieces, colPieces, level + 1);
            subdivide(
              piecesInArea.filter((p) => p.x >= nextX),
              piecesInArea.filter((p) => p.x >= nextX),
              level + 1
            );
            return;
          }
        }
      }
    }

    function groupBy(array, keyGetter) {
      return array.reduce((result, item) => {
        const key = keyGetter(item);
        result[key] = result[key] || [];
        result[key].push(item);
        return result;
      }, {});
    }

    subdivide(
      { x: 0, y: 0, width: boardWidth, height: boardHeight },
      sortedPieces,
      0
    );

    return cuts;
  }

  const drawPiece = (piece) => (
    <Group
      key={piece.id}
      x={piece.x}
      y={piece.y}
      draggable
      onClick={() => setSelectedId(piece.id)}
      onDblClick={() => {
        setPieces((prev) =>
          prev.map((p) =>
            p.id === piece.id
              ? {
                  ...p,
                  width: p.height,
                  height: p.width,
                  rotated: !p.rotated,
                }
              : p
          )
        );
      }}
      onDragEnd={(e) => {
        const { x, y } = e.target.position();
        const isOutside = x < 0 || y < 0 || x > BOARD_WIDTH || y > BOARD_HEIGHT;

        const movedPiece = { ...piece, x: Math.round(x), y: Math.round(y) };
        const others = pieces.filter((p) => p.id !== piece.id);

        if (isOutside) {
          setPieces((prev) => prev.filter((p) => p.id !== piece.id));
          setFreePieces((prev) => [...prev, piece]);
          setSelectedId(null);
        } else if (checkCollision(movedPiece, others)) {
          let placed = false;
          for (let y = 0; y <= BOARD_HEIGHT - piece.height; y += 10) {
            for (let x = 0; x <= BOARD_WIDTH - piece.width; x += 10) {
              const candidate = { ...piece, x, y };
              if (!checkCollision(candidate, others)) {
                setPieces((prev) =>
                  prev.map((p) => (p.id === piece.id ? candidate : p))
                );
                placed = true;
                break;
              }
            }
            if (placed) break;
          }

          if (!placed) {
            setPieces((prev) => prev.filter((p) => p.id !== piece.id));
            setFreePieces((prev) => [...prev, piece]);
            setSelectedId(null);
          }
        } else {
          setPieces((prev) =>
            prev.map((p) => (p.id === piece.id ? movedPiece : p))
          );
        }
      }}
    >
      <Rect
        width={piece.width}
        height={piece.height}
        fill={selectedId === piece.id ? "#93c5fd" : "#cbd5e1"}
        stroke="#dc2626"
        strokeWidth={2}
      />
      <Text
        text={`${piece.label}\n${piece.width}×${piece.height}`}
        fontSize={14}
        fill="#1f2937"
        x={4}
        y={4}
      />
    </Group>
  );

  const drawCutLine = (cut, index) => (
    <Group key={`cut-${index}`}>
      <Line
        points={[cut.x1, cut.y1, cut.x2, cut.y2]}
        stroke="#1d4ed8"
        strokeWidth={2}
        dash={[10, 5]}
      />
      <Text
        text={`L${cut.aLevel}`}
        fontSize={12}
        fill="#1e40af"
        x={(cut.x1 + cut.x2) / 2 - 10}
        y={(cut.y1 + cut.y2) / 2 - 10}
      />
    </Group>
  );

  return (
    <div ref={containerRef} className="p-4">
      <h2 className="text-xl font-bold mb-3">
        Editor Manual de Planos de Corte
      </h2>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVisibleCutLevel((lvl) => Math.max(0, lvl - 1))}
            className="px-3 py-1 rounded bg-gray-300 hover:bg-gray-400 text-sm"
          >
            ⬆ Nivel
          </button>
          <span className="font-semibold text-sm">
            Nivel visible: L{visibleCutLevel}
          </span>
          <button
            onClick={() => setVisibleCutLevel((lvl) => Math.min(6, lvl + 1))}
            className="px-3 py-1 rounded bg-gray-300 hover:bg-gray-400 text-sm"
          >
            ⬇ Nivel
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Solo líneas de corte del nivel actual
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 border bg-gray-100">
          <Stage
            width={BOARD_WIDTH * scale}
            height={BOARD_HEIGHT * scale}
            scale={{ x: scale, y: scale }}
            className="bg-gray-100"
          >
            <Layer>
              <Rect
                width={BOARD_WIDTH}
                height={BOARD_HEIGHT}
                fill="#f3f4f6"
                stroke="#000"
                strokeWidth={2}
              />
              {generateGuillotineCuts(pieces, BOARD_WIDTH, BOARD_HEIGHT).map(
                drawCutLine
              )}
              {pieces.map(drawPiece)}
            </Layer>
          </Stage>
        </div>

        <div className="w-72 border rounded bg-white shadow p-4 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">
              🧩 Piezas desencajadas
            </h3>
            <div className="flex flex-col gap-2 max-h-60 overflow-auto">
              {freePieces.map((piece) => (
                <button
                  key={piece.id}
                  onClick={() => {
                    setFreePieces((prev) =>
                      prev.filter((p) => p.id !== piece.id)
                    );

                    const others = [...pieces];
                    let placed = false;

                    for (let y = 0; y <= BOARD_HEIGHT - piece.height; y += 10) {
                      for (let x = 0; x <= BOARD_WIDTH - piece.width; x += 10) {
                        const candidate = { ...piece, x, y };
                        if (!checkCollision(candidate, others)) {
                          setPieces((prev) => [...prev, candidate]);
                          placed = true;
                          break;
                        }
                      }
                      if (placed) break;
                    }

                    if (!placed) {
                      setFreePieces((prev) => [...prev, piece]);
                    }
                  }}
                  className="border px-3 py-2 rounded hover:bg-gray-100 text-left text-sm text-gray-700"
                >
                  {piece.label} ({piece.width}×{piece.height})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
