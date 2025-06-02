import React, { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Group } from "react-konva";
import pattern from "./pattern.json";

// —— 1. VARIABLES GLOBALES —— //
const BOARD_WIDTH = 2440;
const BOARD_HEIGHT = 2150;

const kerf = 3;
const refiladoLeft = 2;
const refiladoRight = 2;
const refiladoTop = 2;
const refiladoBottom = 2;
const gap = 5; // Margen mínimo entre piezas
const tolerance = 0.5; // Tolerancia de medición
const minPieceWidth = 50;
const minPieceHeight = 50;
const maxPieceWidth = BOARD_WIDTH;
const maxPieceHeight = BOARD_HEIGHT;
const cutSpeed = 300;
const feedSpeed = 1000;
const lossFactor = 2;

export default function GuillotineEditor_Fase3() {
  // —— Estado para piezas colocadas y piezas libres —— //
  const [pieces, setPieces] = useState([]);
  const [freePieces, setFreePieces] = useState([]);
  const containerRef = useRef();
  const stageRef = useRef();
  const [scale, setScale] = useState(1);
  const selectedIdRef = useRef(null);

  // —— 2. Área útil descontando refilado —— //
  const usableArea = {
    x: refiladoLeft,
    y: refiladoTop,
    width: BOARD_WIDTH - refiladoLeft - refiladoRight,
    height: BOARD_HEIGHT - refiladoTop - refiladoBottom,
  };

  // —— 3. Validar dimensiones mínimas/máximas —— //
  function isDimensionValid(piece) {
    return (
      piece.width >= minPieceWidth &&
      piece.height >= minPieceHeight &&
      piece.width <= maxPieceWidth &&
      piece.height <= maxPieceHeight
    );
  }

  // —— 4. Detectar colisión simple (sin gap) —— //
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

  // —— 5. Detectar colisión con gap y tolerance —— //
  function checkCollisionWithGap(piece, others) {
    const inflPiece = {
      x: piece.x - gap / 2 - tolerance,
      y: piece.y - gap / 2 - tolerance,
      width: piece.width + gap + 2 * tolerance,
      height: piece.height + gap + 2 * tolerance,
    };
    return others.some((other) => {
      const inflOther = {
        x: other.x - gap / 2 - tolerance,
        y: other.y - gap / 2 - tolerance,
        width: other.width + gap + 2 * tolerance,
        height: other.height + gap + 2 * tolerance,
      };
      return !(
        inflPiece.x + inflPiece.width <= inflOther.x ||
        inflPiece.x >= inflOther.x + inflOther.width ||
        inflPiece.y + inflPiece.height <= inflOther.y ||
        inflPiece.y >= inflOther.y + inflOther.height
      );
    });
  }

  // —— 6. Buscar la primera posición libre considerando gap y tolerance —— //
  function findFirstAvailablePosition(piece, others) {
    const step = 10;
    const inflWidth = piece.width + gap + 2 * tolerance;
    const inflHeight = piece.height + gap + 2 * tolerance;
    const startX = usableArea.x + gap / 2 + tolerance;
    const endX =
      usableArea.x + usableArea.width - (piece.width + gap / 2 + tolerance);
    const startY = usableArea.y + gap / 2 + tolerance;
    const endY =
      usableArea.y + usableArea.height - (piece.height + gap / 2 + tolerance);

    for (let y = startY; y <= endY; y += step) {
      for (let x = startX; x <= endX; x += step) {
        const candidate = { x: x - gap / 2, y: y - gap / 2 };
        // Inflamos el candidato para colisión
        const inflCandidate = {
          x: candidate.x - gap / 2 - tolerance,
          y: candidate.y - gap / 2 - tolerance,
          width: piece.width + gap + 2 * tolerance,
          height: piece.height + gap + 2 * tolerance,
        };
        const collision = others.some((other) => {
          const inflOther = {
            x: other.x - gap / 2 - tolerance,
            y: other.y - gap / 2 - tolerance,
            width: other.width + gap + 2 * tolerance,
            height: other.height + gap + 2 * tolerance,
          };
          return !(
            inflCandidate.x + inflCandidate.width <= inflOther.x ||
            inflCandidate.x >= inflOther.x + inflOther.width ||
            inflCandidate.y + inflCandidate.height <= inflOther.y ||
            inflCandidate.y >= inflOther.y + inflOther.height
          );
        });
        if (!collision) {
          return candidate;
        }
      }
    }
    return null;
  }

  // —— 7. Carga inicial de piezas colocadas —— //
  useEffect(() => {
    const data = pattern[0].layout[0];
    const loaded = data.part.map((p) => {
      const rotated = p.rotated === "True";
      const width = rotated ? parseFloat(p.length) : parseFloat(p.width);
      const height = rotated ? parseFloat(p.width) : parseFloat(p.length);
      return {
        id: parseInt(p.part),
        label: `Pza ${p.nItem}`,
        width,
        height,
        rotated,
        x: parseFloat(p.x),
        y: parseFloat(p.y),
      };
    });
    setPieces(loaded);
  }, []);

  // —— 8. Ajuste de escala al redimensionar ventana —— //
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

  // —— 9. Teclas: eliminar pieza seleccionada y rotar si válida —— //
  useEffect(() => {
    const handleKeyDown = (e) => {
      const pid = selectedIdRef.current;
      if (pid != null) {
        // DELETE o ESCAPE → quitar pieza y enviarla a freePieces
        if (e.key === "Delete" || e.key === "Escape") {
          const removed = pieces.find((p) => p.id === pid);
          if (removed) {
            setPieces((prev) => prev.filter((p) => p.id !== pid));
            setFreePieces((prev) => [...prev, removed]);
          }
          selectedIdRef.current = null;
        }
        // “r” → rotar si sigue válida
        if (e.key.toLowerCase() === "r") {
          setPieces((prev) =>
            prev.map((p) => {
              if (p.id === pid) {
                const newW = p.height;
                const newH = p.width;
                if (
                  newW >= minPieceWidth &&
                  newH >= minPieceHeight &&
                  newW <= maxPieceWidth &&
                  newH <= maxPieceHeight
                ) {
                  return {
                    ...p,
                    width: newW,
                    height: newH,
                    rotated: !p.rotated,
                  };
                }
              }
              return p;
            })
          );
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pieces]);

  // —— 10. Manejar drop de piezas desencajadas (colocación automática) —— //
  function handleDrop(e) {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    const dropped = JSON.parse(data);

    // Validar dimensiones
    if (
      dropped.width < minPieceWidth ||
      dropped.height < minPieceHeight ||
      dropped.width > maxPieceWidth ||
      dropped.height > maxPieceHeight
    ) {
      return; // no colocamos piezas inválidas
    }

    // Encontrar hueco libre con gap/tolerance
    const pos = findFirstAvailablePosition(dropped, pieces);
    if (pos) {
      setPieces((prev) => [...prev, { ...dropped, x: pos.x, y: pos.y }]);
    } else {
      setFreePieces((prev) => [...prev, dropped]);
    }
    // Quitar de freePieces original
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
        FASE 3 – Gap y Tolerancia en Colisiones
      </h2>

      <div className="flex gap-4">
        {/* —— Lienzo Konva —— */}
        <div className="flex-1 border bg-gray-100">
          <Stage
            ref={stageRef}
            width={BOARD_WIDTH * scale}
            height={BOARD_HEIGHT * scale}
            scale={{ x: scale, y: scale }}
            className="bg-gray-100"
          >
            <Layer>
              {/* 2.1 Dibujar contorno del área útil */}
              <Rect
                x={usableArea.x}
                y={usableArea.y}
                width={usableArea.width}
                height={usableArea.height}
                fill="#f3f4f6"
                stroke="#000"
                strokeWidth={2}
              />

              {/* 2.2 Mostrar texto con dimensiones reales del área útil */}
              <Text
                text={`${usableArea.width} × ${usableArea.height}`}
                fontSize={16}
                fill="#374151"
                x={usableArea.x + usableArea.width - 160}
                y={usableArea.y + usableArea.height - 24}
              />

              {/* 5. Dibujar piezas con colisión gap/tolerance */}
              {pieces.map((piece) => {
                const valid = isDimensionValid(piece);

                // Guardamos las coordenadas previas antes de arrastrar
                let originalX = piece.x;
                let originalY = piece.y;

                const handleDragStart = () => {
                  originalX = piece.x;
                  originalY = piece.y;
                };

                const handleDragEnd = (e) => {
                  const newX = Math.round(e.target.x());
                  const newY = Math.round(e.target.y());
                  const moved = { ...piece, x: newX, y: newY };

                  // 1) ¿Está fuera del área útil? Si sí, lo "liberamos"
                  const outside =
                    newX < usableArea.x ||
                    newY < usableArea.y ||
                    newX + piece.width > usableArea.x + usableArea.width ||
                    newY + piece.height > usableArea.y + usableArea.height;

                  if (outside) {
                    // Lo removemos de piezas colocadas y lo pasamos a freePieces
                    setPieces((prev) => prev.filter((p) => p.id !== piece.id));
                    setFreePieces((prev) => [...prev, piece]);
                    return;
                  }

                  // 2) Comprobar colisión con gap/tolerance
                  const collision = checkCollisionWithGap(
                    moved,
                    pieces.filter((p) => p.id !== piece.id)
                  );
                  if (collision) {
                    // Si colisiona, revertimos posición del nodo Konva
                    e.target.to({
                      x: originalX,
                      y: originalY,
                      duration: 0.1,
                    });
                  } else {
                    // Si todo OK, actualizamos estado
                    setPieces((prev) =>
                      prev.map((p) =>
                        p.id === piece.id ? { ...p, x: newX, y: newY } : p
                      )
                    );
                  }
                };

                const handleClick = () => {
                  selectedIdRef.current = piece.id;
                };

                return (
                  <Group
                    key={piece.id}
                    x={piece.x}
                    y={piece.y}
                    draggable={valid}
                    onClick={handleClick}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    {/* 5.a. Dibujar rectángulo del “gap” (área seguridad) */}
                    <Rect
                      x={-gap / 2}
                      y={-gap / 2}
                      width={piece.width + gap}
                      height={piece.height + gap}
                      fill="rgba(255,0,0,0.05)"
                      listening={false}
                    />
                    {/* 5.b. Dibujar rectángulo principal de la pieza */}
                    <Rect
                      width={piece.width}
                      height={piece.height}
                      fill={valid ? "#cbd5e1" : "rgba(255,0,0,0.1)"}
                      stroke={valid ? "#dc2626" : "#dc2626"}
                      strokeWidth={valid ? 1 : 2}
                    />
                    <Text
                      text={`${piece.label}`}
                      fontSize={12}
                      fill={valid ? "#1f2937" : "#b91c1c"}
                      x={4}
                      y={4}
                    />
                    {!valid && (
                      <Text
                        text="✕ Tamaño inválido"
                        fontSize={10}
                        fill="#b91c1c"
                        x={4}
                        y={piece.height - 14}
                      />
                    )}
                  </Group>
                );
              })}
            </Layer>
          </Stage>
        </div>

        {/* —— Panel lateral “Piezas desencajadas” —— */}
        <div className="w-72 border rounded bg-white shadow p-4 flex flex-col gap-4">
          <h3 className="text-lg font-semibold mb-2">🧩 Piezas desencajadas</h3>
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
                  // Validar dimensiones antes de intentar ubicar
                  if (
                    piece.width < minPieceWidth ||
                    piece.height < minPieceHeight ||
                    piece.width > maxPieceWidth ||
                    piece.height > maxPieceHeight
                  ) {
                    return;
                  }
                  // Quitar de la lista de piezas libres
                  setFreePieces((prev) =>
                    prev.filter((p) => p.id !== piece.id)
                  );
                  // Buscar primer hueco libre con gap/tolerance
                  const pos = findFirstAvailablePosition(piece, pieces);
                  if (pos) {
                    setPieces((prev) => [
                      ...prev,
                      { ...piece, x: pos.x, y: pos.y },
                    ]);
                  } else {
                    // Si no cabe, devolvemos a freePieces
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

      {/* —— Descripción de la Fase 3 —— */}
      <div className="mt-4 text-sm text-gray-700">
        ▶ FASE 3 – Aplicamos “gap” y “tolerancia” en colisiones, y ahora:
        <ul className="list-disc ml-5 mt-1">
          <li>
            Si arrastras una pieza <strong>completamente</strong> fuera del área
            gris (área útil), esa pieza se mueve a “Piezas desencajadas”
            (freePieces).
          </li>
          <li>
            Para colocarla de nuevo, haz clic en el botón de esa pieza en el
            panel derecho: buscará la primera posición viable (sin chocar gaps).
          </li>
          <li>
            Si una pieza choca con otra al soltarla, “rebota” suavemente a su
            posición anterior (nunca se superponen).
          </li>
          <li>
            Cada pieza válida muestra su rectángulo de “gap” (área de seguridad
            de <code>gap</code> mm) en rojo semitransparente; esos gaps no
            pueden solaparse en ningún punto.
          </li>
        </ul>
      </div>
    </div>
  );
}
