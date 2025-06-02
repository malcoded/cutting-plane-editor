import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Line, Group, Text } from "react-konva";
import pattern from "./pattern.json";

const BOARD_WIDTH = 2440;
const BOARD_HEIGHT = 2150;

/**
 * Verifica si `piece` colisiona con cualquiera de los rectángulos en `others`.
 */
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

/**
 * Recorre el tablero en incrementos de 10px para encontrar la primera posición
 * donde `piece` cabe sin colisionar con `others`. Devuelve { x, y } o null.
 */
function findFirstAvailablePosition(piece, others) {
  for (let y = 0; y <= BOARD_HEIGHT - piece.height; y += 10) {
    for (let x = 0; x <= BOARD_WIDTH - piece.width; x += 10) {
      const candidate = { ...piece, x, y };
      if (!checkCollision(candidate, others)) {
        return { x, y };
      }
    }
  }
  return null;
}

export default function GuillotineEditor() {
  const [pieces, setPieces] = useState([]);
  const [freePieces, setFreePieces] = useState([]);
  const containerRef = useRef();
  const stageRef = useRef();
  const [scale, setScale] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  // Carga inicial de piezas desde pattern.json
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

  // Ajuste de escala cuando se redimensiona la ventana
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

  // Manejo de teclas para eliminar (Delete/Escape) o rotar ("r") pieza seleccionada
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

  /**
   * Genera todas las líneas de corte estilo guillotina, con { iCut, x1, y1, x2, y2, aLevel }.
   */
  function generateGuillotineCuts(pieces, boardWidth, boardHeight) {
    const cuts = [];
    let cutIndex = 0;
    const sortedPieces = [...pieces].sort((a, b) => a.y - b.y || a.x - b.x);

    function groupBy(array, keyGetter) {
      return array.reduce((result, item) => {
        const key = keyGetter(item);
        result[key] = result[key] || [];
        result[key].push(item);
        return result;
      }, {});
    }

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

            subdivide(
              {
                x: area.x,
                y: area.y,
                width: area.width,
                height: nextY - area.y,
              },
              rowPieces,
              level + 1
            );
            subdivide(
              {
                x: area.x,
                y: nextY,
                width: area.width,
                height: area.y + area.height - nextY,
              },
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

            subdivide(
              {
                x: area.x,
                y: area.y,
                width: nextX - area.x,
                height: area.height,
              },
              colPieces,
              level + 1
            );
            subdivide(
              {
                x: nextX,
                y: area.y,
                width: area.x + area.width - nextX,
                height: area.height,
              },
              piecesInArea.filter((p) => p.x >= nextX),
              level + 1
            );
            return;
          }
        }
      }
    }

    subdivide(
      { x: 0, y: 0, width: boardWidth, height: boardHeight },
      sortedPieces,
      0
    );

    return cuts;
  }

  /**
   * Genera todas las áreas rectangulares (subdivisiones) estilo guillotina,
   * con { x, y, width, height, level }.
   */
  function generateCutAreas(pieces, boardWidth, boardHeight) {
    const areas = [];
    const sortedPieces = [...pieces].sort((a, b) => a.y - b.y || a.x - b.x);

    function groupBy(array, keyGetter) {
      return array.reduce((result, item) => {
        const key = keyGetter(item);
        result[key] = result[key] || [];
        result[key].push(item);
        return result;
      }, {});
    }

    function subdivideArea(area, piecesInArea, level) {
      areas.push({ ...area, level });
      if (piecesInArea.length <= 1) return;

      const canSplitHorizontally =
        new Set(piecesInArea.map((p) => p.y)).size > 1;
      const canSplitVertically = new Set(piecesInArea.map((p) => p.x)).size > 1;

      if (canSplitHorizontally) {
        const rows = groupBy(piecesInArea, (p) => p.y);
        let offsetY = area.y;

        for (const [_rowY, rowPieces] of Object.entries(rows)) {
          const rowHeight = Math.max(...rowPieces.map((p) => p.height));
          const nextY = offsetY + rowHeight;

          if (nextY < area.y + area.height) {
            const topArea = {
              x: area.x,
              y: area.y,
              width: area.width,
              height: rowHeight,
            };
            const bottomArea = {
              x: area.x,
              y: nextY,
              width: area.width,
              height: area.y + area.height - nextY,
            };
            subdivideArea(topArea, rowPieces, level + 1);
            subdivideArea(
              bottomArea,
              piecesInArea.filter((p) => p.y >= nextY),
              level + 1
            );
            return;
          }
        }
      }

      if (canSplitVertically) {
        const cols = groupBy(piecesInArea, (p) => p.x);
        let offsetX = area.x;

        for (const [_colX, colPieces] of Object.entries(cols)) {
          const colWidth = Math.max(...colPieces.map((p) => p.width));
          const nextX = offsetX + colWidth;

          if (nextX < area.x + area.width) {
            const leftArea = {
              x: area.x,
              y: area.y,
              width: colWidth,
              height: area.height,
            };
            const rightArea = {
              x: nextX,
              y: area.y,
              width: area.x + area.width - nextX,
              height: area.height,
            };
            subdivideArea(leftArea, colPieces, level + 1);
            subdivideArea(
              rightArea,
              piecesInArea.filter((p) => p.x >= nextX),
              level + 1
            );
            return;
          }
        }
      }
    }

    subdivideArea(
      { x: 0, y: 0, width: boardWidth, height: boardHeight },
      sortedPieces,
      0
    );

    return areas;
  }

  // Generar cortes y áreas en cada render
  const allCuts = generateGuillotineCuts(pieces, BOARD_WIDTH, BOARD_HEIGHT);
  const allAreas = generateCutAreas(pieces, BOARD_WIDTH, BOARD_HEIGHT);

  /**
   * Dibuja un rectángulo draggable que representa cada pieza colocada.
   */
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
          // Si lo arrastró fuera del tablero, lo "liberamos"
          setPieces((prev) => prev.filter((p) => p.id !== piece.id));
          setFreePieces((prev) => [...prev, piece]);
          setSelectedId(null);
        } else if (checkCollision(movedPiece, others)) {
          // Si colisiona, buscar nuevo hueco libre
          const pos = findFirstAvailablePosition(piece, others);
          if (pos) {
            setPieces((prev) =>
              prev.map((p) =>
                p.id === piece.id ? { ...p, x: pos.x, y: pos.y } : p
              )
            );
          } else {
            // Si no hay espacio, lo liberamos también
            setPieces((prev) => prev.filter((p) => p.id !== piece.id));
            setFreePieces((prev) => [...prev, piece]);
            setSelectedId(null);
          }
        } else {
          // Si no hay colisión ni está fuera, guardamos la nueva posición
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

  /**
   * Dibuja una línea punteada con su etiqueta de nivel (L{aLevel}).
   */
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

  /**
   * Manejador de drop: lee la pieza arrastrada, busca el primer hueco libre
   * y la coloca allí; si no hay espacio, la devuelve a `freePieces`.
   */
  function handleDrop(e) {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    const dropped = JSON.parse(data);

    const pos = findFirstAvailablePosition(dropped, pieces);
    if (pos) {
      setPieces((prev) => [...prev, { ...dropped, x: pos.x, y: pos.y }]);
    } else {
      setFreePieces((prev) => [...prev, dropped]);
    }

    // Quitarla de la lista original de piezas libres
    setFreePieces((prev) => prev.filter((p) => p.id !== dropped.id));
  }

  return (
    <div
      ref={containerRef}
      className="p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <h2 className="text-xl font-bold mb-3">
        Editor Manual de Planos de Corte
      </h2>

      {/* Espacio en blanco (sin botones de nivel) */}
      <div className="mb-3"></div>

      <div className="flex gap-4">
        {/* —— Área del tablero con Konva —— */}
        <div className="flex-1 border bg-gray-100">
          <Stage
            ref={stageRef}
            width={BOARD_WIDTH * scale}
            height={BOARD_HEIGHT * scale}
            scale={{ x: scale, y: scale }}
            className="bg-gray-100"
          >
            <Layer>
              {/* Contorno del tablero */}
              <Rect
                width={BOARD_WIDTH}
                height={BOARD_HEIGHT}
                fill="#f3f4f6"
                stroke="#000"
                strokeWidth={2}
              />

              {/* Texto con dimensiones reales */}
              <Text
                text={`${BOARD_WIDTH} × ${BOARD_HEIGHT}`}
                fontSize={16}
                fill="#374151"
                x={BOARD_WIDTH - 160}
                y={BOARD_HEIGHT - 24}
              />

              {/* Dibujar todas las áreas (todos los niveles) */}
              {allAreas.map((area, idx) => (
                <Rect
                  key={`area-${idx}`}
                  x={area.x}
                  y={area.y}
                  width={area.width}
                  height={area.height}
                  fill="rgba(59, 130, 246, 0.08)"
                  stroke="#3b82f6"
                  strokeWidth={1}
                  dash={[4, 2]}
                />
              ))}

              {/* Dibujar todas las líneas de corte (todos los niveles) */}
              {allCuts.map((cut, idx) => drawCutLine(cut, idx))}

              {/* Dibuja cada pieza colocada */}
              {pieces.map(drawPiece)}
            </Layer>
          </Stage>
        </div>

        {/* —— Columna de Piezas desencajadas —— */}
        <div className="w-72 border rounded bg-white shadow p-4 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">
              🧩 Piezas desencajadas
            </h3>
            <div className="flex flex-col gap-2 max-h-60 overflow-auto">
              {freePieces.map((piece) => (
                <button
                  key={piece.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/json",
                      JSON.stringify(piece)
                    );
                  }}
                  onClick={() => {
                    // Primero la quitamos de freePieces
                    setFreePieces((prev) =>
                      prev.filter((p) => p.id !== piece.id)
                    );
                    // Luego buscamos su posición libre
                    const pos = findFirstAvailablePosition(piece, pieces);
                    if (pos) {
                      setPieces((prev) => [
                        ...prev,
                        { ...piece, x: pos.x, y: pos.y },
                      ]);
                    } else {
                      // Si no cabe, la devolvemos a la lista
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
