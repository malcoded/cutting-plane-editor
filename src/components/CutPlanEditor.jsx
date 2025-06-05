import React, { useState, useRef, useEffect } from "react";
import { Stage, Layer, Rect, Text, Line } from "react-konva";
import Konva from "konva";

/* --- Constantes de tablero y escala --- */
const BOARD_WIDTH_MM = 2750;
const BOARD_HEIGHT_MM = 1830;
const SCALE = 0.3;

const BOARD_WIDTH = BOARD_WIDTH_MM * SCALE;
const BOARD_HEIGHT = BOARD_HEIGHT_MM * SCALE;
const SNAP_TOLERANCE_MM = 30;
const SNAP_TOLERANCE = SNAP_TOLERANCE_MM * SCALE;
const MARGIN = 10;
const KERF = 5 * SCALE; // espesor de sierra en px

function CutPlanEditor() {
  /* --- Estados principales --- */
  const [cutOrientation, setCutOrientation] = useState("automatic");
  const [pieces, setPieces] = useState([]); // piezas en tablero
  const [availablePieces, setAvailablePieces] = useState([
    // piezas libres
    { id: 1, name: "A", width: 400, height: 300 },
    { id: 2, name: "B", width: 300, height: 200 },
    { id: 3, name: "C", width: 200, height: 250 },
  ]);
  const [regions, setRegions] = useState([
    { x: MARGIN, y: MARGIN, width: BOARD_WIDTH, height: BOARD_HEIGHT },
  ]);
  const [cuts, setCuts] = useState([]); // horizontales
  const [vCuts, setVCuts] = useState([]); // verticales
  const [selectedId, setSelectedId] = useState(null);
  const prevPositions = useRef({}); // posición antes de arrastrar

  /* ---------- Manejo de teclado (ESC, DELETE) ---------- */
  useEffect(() => {
    const handleKey = (e) => {
      if (
        ["Escape", "Delete", "Backspace"].includes(e.key) &&
        selectedId !== null
      ) {
        const updated = pieces.filter((p) => p.id !== selectedId);
        setPieces(updated);

        // Devolver al panel libre si no está
        const removed = pieces.find((p) => p.id === selectedId);
        if (removed) {
          setAvailablePieces((prev) =>
            prev.find((p) => p.id === removed.id) ? prev : [...prev, removed]
          );
        }

        setSelectedId(null);

        // Reconstruir cortes y regiones como si esa pieza nunca hubiera existido
        rebuildLayoutFromPieces(updated);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, pieces]);

  /* ---------- Funciones de ayuda ---------- */
  // Verifica si una pieza colisiona con otras ya colocadas en el tablero
  const checkCollision = (id, x, y, w, h) =>
    pieces.some((p) => {
      if (p.id === id) return false;
      const pw = p.width * SCALE,
        ph = p.height * SCALE;
      return !(x + w <= p.x || x >= p.x + pw || y + h <= p.y || y >= p.y + ph);
    });

  // Aplica snapping inteligente al mover una pieza: ajusta su posición cerca de bordes o piezas vecinas
  const applySnap = (id, x, y, w, h) => {
    let sx = x,
      sy = y;

    // Snap to board edges
    if (Math.abs(x - MARGIN) < SNAP_TOLERANCE) sx = MARGIN;
    if (Math.abs(x + w - (BOARD_WIDTH + MARGIN)) < SNAP_TOLERANCE)
      sx = BOARD_WIDTH + MARGIN - w;
    if (Math.abs(y - MARGIN) < SNAP_TOLERANCE) sy = MARGIN;
    if (Math.abs(y + h - (BOARD_HEIGHT + MARGIN)) < SNAP_TOLERANCE)
      sy = BOARD_HEIGHT + MARGIN - h;

    // Snap to other pieces
    for (const p of pieces) {
      if (p.id === id) continue;
      const pw = p.width * SCALE,
        ph = p.height * SCALE;

      // Horizontal snaps
      if (Math.abs(x - (p.x + pw + KERF)) < SNAP_TOLERANCE)
        sx = p.x + pw + KERF;
      else if (Math.abs(x + w + KERF - p.x) < SNAP_TOLERANCE)
        sx = p.x - w - KERF;
      else if (Math.abs(x - p.x) < SNAP_TOLERANCE) sx = p.x;
      else if (Math.abs(x + w - (p.x + pw)) < SNAP_TOLERANCE) sx = p.x + pw - w;

      // Vertical snaps
      if (Math.abs(y - (p.y + ph + KERF)) < SNAP_TOLERANCE)
        sy = p.y + ph + KERF;
      else if (Math.abs(y + h + KERF - p.y) < SNAP_TOLERANCE)
        sy = p.y - h - KERF;
      else if (Math.abs(y - p.y) < SNAP_TOLERANCE) sy = p.y;
      else if (Math.abs(y + h - (p.y + ph)) < SNAP_TOLERANCE) sy = p.y + ph - h;
    }

    // Ensure piece stays within board bounds
    sx = Math.max(MARGIN, Math.min(sx, BOARD_WIDTH + MARGIN - w));
    sy = Math.max(MARGIN, Math.min(sy, BOARD_HEIGHT + MARGIN - h));

    return { x: sx, y: sy };
  };

  // Registra una línea de corte horizontal (y evita duplicados)
  const addHorizontalCut = (y) => {
    if (y <= MARGIN || y >= BOARD_HEIGHT + MARGIN) return;
    setCuts((prev) =>
      prev.some((c) => Math.abs(c.y - y) < 1) ? prev : [...prev, { y }]
    );
  };
  // Registra una línea de corte vertical (y evita duplicados)
  const addVerticalCut = (x) => {
    if (x <= MARGIN || x >= BOARD_WIDTH + MARGIN) return;
    setVCuts((prev) =>
      prev.some((c) => Math.abs(c.x - x) < 1) ? prev : [...prev, { x }]
    );
  };

  // Divide una región en dos subregiones tras un corte horizontal tipo guillotina
  const splitRegionHorizontal = (reg, w, h) => {
    const below = {
      x: reg.x,
      y: reg.y + h + KERF,
      width: reg.width,
      height: reg.height - h - KERF,
    };
    const right = {
      x: reg.x + w + KERF,
      y: reg.y,
      width: reg.width - w - KERF,
      height: h,
    };
    // Solo regiones válidas (al menos 30x30)
    return [below, right].filter((r) => r.width >= 30 && r.height >= 30);
  };
  // Divide una región en dos subregiones tras un corte vertical tipo guillotina
  const splitRegionVertical = (reg, w, h) => {
    const right = {
      x: reg.x + w + KERF,
      y: reg.y,
      width: reg.width - w - KERF,
      height: reg.height,
    };
    const below = {
      x: reg.x,
      y: reg.y + h + KERF,
      width: w,
      height: reg.height - h - KERF,
    };
    // Solo regiones válidas (al menos 30x30)
    return [right, below].filter((r) => r.width >= 30 && r.height >= 30);
  };

  // Encuentra una región libre que pueda contener la pieza en la posición deseada
  const findRegionForPiece = (w, h, x, y) =>
    regions.find(
      (r) =>
        w <= r.width &&
        h <= r.height &&
        x >= r.x &&
        y >= r.y &&
        x + w <= r.x + r.width &&
        y + h <= r.y + r.height
    );

  // Verifica si un corte vertical es válido (no atraviesa otras piezas)
  const isVerticalCutClear = (cutX, y, h, allPieces, currentPieceId) =>
    !allPieces.some((p) => {
      if (p.id === currentPieceId) return false;
      const px = p.x;
      const pw = p.width * SCALE;
      const py = p.y;
      const ph = p.height * SCALE;
      return (
        cutX > px &&
        cutX < px + pw &&
        ((py <= y && y < py + ph) || (py < y + h && y + h <= py + ph))
      );
    });

  // Reconstruye el layout completo del tablero a partir de las piezas ubicadas,
  // recalculando regiones libres y líneas de corte según las reglas de guillotina
  const rebuildLayoutFromPieces = (pieceArr) => {
    // Reset
    let newRegions = [
      { x: MARGIN, y: MARGIN, width: BOARD_WIDTH, height: BOARD_HEIGHT },
    ];
    let newCuts = [];
    let newVCuts = [];

    // Sort pieces by position to ensure consistent cutting order
    const sortedPieces = [...pieceArr].sort((a, b) => {
      if (Math.abs(a.y - b.y) < SNAP_TOLERANCE) {
        return a.x - b.x;
      }
      return a.y - b.y;
    });

    sortedPieces.forEach((piece) => {
      const w = piece.width * SCALE;
      const h = piece.height * SCALE;

      // Find the region that contains this piece
      const reg = newRegions.find(
        (r) =>
          piece.x >= r.x &&
          piece.y >= r.y &&
          piece.x + w <= r.x + r.width &&
          piece.y + h <= r.y + r.height
      );

      if (!reg) return;

      // Validar que la pieza esté alineada a la esquina superior izquierda de la región
      if (Math.abs(piece.x - reg.x) > 1 || Math.abs(piece.y - reg.y) > 1) {
        return;
      }

      // Determine cut orientation based on available space
      const canCutHorizontal = reg.width >= w && reg.height > h;
      const canCutVertical = reg.height >= h && reg.width > w;

      let orient = cutOrientation;
      if (orient === "automatic") {
        // Choose the orientation that maximizes the remaining space
        const horizontalRemaining = reg.width * (reg.height - h);
        const verticalRemaining = (reg.width - w) * reg.height;
        orient =
          horizontalRemaining >= verticalRemaining ? "horizontal" : "vertical";
      }

      if (orient === "vertical" && canCutVertical) {
        const cutX = piece.x + w;
        if (isVerticalCutClear(cutX, piece.y, h, sortedPieces, piece.id)) {
          newVCuts.push({ x: cutX });
          newRegions = [
            ...newRegions.filter((r) => r !== reg),
            ...splitRegionVertical(reg, w, h),
          ];
        }
      } else if (orient === "horizontal" && canCutHorizontal) {
        newCuts.push({ y: piece.y + h });
        newRegions = [
          ...newRegions.filter((r) => r !== reg),
          ...splitRegionHorizontal(reg, w, h),
        ];
      }
    });

    // Remove duplicate cuts and ensure cuts are within the board area
    newCuts = newCuts.filter(
      (cut, index, self) =>
        cut.y > MARGIN &&
        cut.y < MARGIN + BOARD_HEIGHT &&
        index === self.findIndex((c) => Math.abs(c.y - cut.y) < 1)
    );
    newVCuts = newVCuts.filter(
      (cut, index, self) =>
        cut.x > MARGIN &&
        cut.x < MARGIN + BOARD_WIDTH &&
        index === self.findIndex((c) => Math.abs(c.x - cut.x) < 1)
    );

    setRegions(newRegions);
    setCuts(newCuts);
    setVCuts(newVCuts);
  };

  /* -------- DRAG: iniciar -------- */
  const handleDragStart = (id, x, y, piece) => {
    // Guarda posición previa por si hay que revertir
    prevPositions.current[id] = { x, y };

    // Libera la región que ocupaba la pieza (para que vuelva a estar disponible)
    const w = piece.width * SCALE;
    const h = piece.height * SCALE;
    setRegions((prev) => {
      const exists = prev.some(
        (r) =>
          Math.abs(r.x - x) < 1 &&
          Math.abs(r.y - y) < 1 &&
          Math.abs(r.width - w) < 1 &&
          Math.abs(r.height - h) < 1
      );
      return exists ? prev : [...prev, { x, y, width: w, height: h }];
    });
  };

  /* -------- DRAG: finalizar -------- */
  const handleDragEnd = (id, newX, newY, piece, node) => {
    // Escalar dimensiones de la pieza
    const w = piece.width * SCALE,
      h = piece.height * SCALE;

    // Aplicar snapping a la posición soltada
    const snapped = applySnap(id, newX, newY, w, h);

    // Buscar región válida donde pueda ubicarse la pieza
    const targetReg = findRegionForPiece(w, h, snapped.x, snapped.y);

    // Validar si no hay colisión con otras piezas
    const ok = targetReg && !checkCollision(id, snapped.x, snapped.y, w, h);

    // ❌ Si está en una región pero no alineada al borde superior izquierdo → inválido
    if (
      targetReg &&
      (Math.abs(snapped.x - targetReg.x) > 1 ||
        Math.abs(snapped.y - targetReg.y) > 1)
    ) {
      const { x, y } = prevPositions.current[id];
      node.position({ x, y });
      node.getLayer().batchDraw();
      setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
      return;
    }

    // ❌ Si hay colisión o no hay región válida → devolver al panel libre
    if (!ok) {
      const original = prevPositions.current[id] || { x: MARGIN, y: MARGIN };
      if (node && typeof node.to === "function") {
        new Konva.Tween({
          node,
          duration: 0.3,
          x: original.x,
          y: original.y,
          easing: Konva.Easings.EaseInOut,
        }).play();
      } else {
        node.position({ x: original.x, y: original.y });
        node.getLayer().batchDraw();
      }

      setPieces((prev) => prev.filter((p) => p.id !== id));
      const currentPiece = pieces.find((p) => p.id === id);
      if (currentPiece) {
        setAvailablePieces((prev) =>
          prev.find((p) => p.id === currentPiece.id)
            ? prev
            : [...prev, currentPiece]
        );
      }
      return;
    }

    // ✅ Actualizar estado con la nueva posición y recalcular layout
    const updatedPieces = pieces.map((p) =>
      p.id === id ? { ...p, x: snapped.x, y: snapped.y } : p
    );
    setPieces(updatedPieces);
    rebuildLayoutFromPieces(updatedPieces);

    // Actualizar posición visual del nodo en el canvas
    node.position({ x: snapped.x, y: snapped.y });
    node.getLayer().batchDraw();
    console.log(regions);
  };

  /* -------- Rotar pieza (doble clic) -------- */
  // Rota una pieza 90° y verifica si aún encaja en su posición actual
  const rotatePiece = (id) => {
    setPieces((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const rotated = { ...p, width: p.height, height: p.width };
        const fits =
          !checkCollision(
            id,
            rotated.x,
            rotated.y,
            rotated.width * SCALE,
            rotated.height * SCALE
          ) &&
          findRegionForPiece(
            rotated.width * SCALE,
            rotated.height * SCALE,
            rotated.x,
            rotated.y
          );
        return fits ? rotated : p;
      })
    );
  };

  // Determina el rango visible de un corte vertical según obstáculos superiores
  const getVerticalCutRange = (x) => {
    let yStart = MARGIN;
    let yEnd = BOARD_HEIGHT + MARGIN;

    for (const p of pieces) {
      const px = p.x;
      const pw = p.width * SCALE;
      const py = p.y;
      const ph = p.height * SCALE;

      if (x > px && x < px + pw) {
        if (py + ph > yStart) yStart = py + ph;
      }
    }

    return { yStart, yEnd };
  };

  // Determina el rango visible de un corte horizontal según obstáculos a la izquierda
  const getHorizontalCutRange = (y) => {
    let xStart = MARGIN;
    let xEnd = BOARD_WIDTH + MARGIN;

    for (const p of pieces) {
      const py = p.y;
      const ph = p.height * SCALE;
      const px = p.x;
      const pw = p.width * SCALE;

      if (y > py && y < py + ph) {
        if (px + pw > xStart) xStart = px + pw;
      }
    }

    return { xStart, xEnd };
  };

  /* ============== Render UI ============== */
  return (
    <div className="py-4 px-6">
      {/* Selector de orientación */}
      <div className="mb-3">
        <label className="mr-2">Orientación de corte:</label>
        <select
          className="border px-2 py-1 rounded"
          value={cutOrientation}
          onChange={(e) => setCutOrientation(e.target.value)}
        >
          <option value="automatic">Automático</option>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>

      <div className="flex gap-4">
        {/* -------- TABLERO -------- */}
        <div
          className="relative inline-block"
          onClick={(e) => e.target === e.currentTarget && setSelectedId(null)}
          onDrop={(e) => {
            e.preventDefault();
            const piece = JSON.parse(
              e.dataTransfer.getData("application/json")
            );
            const rect = e.currentTarget.getBoundingClientRect();
            const offsetX = e.clientX - rect.left - MARGIN;
            const offsetY = e.clientY - rect.top - MARGIN;

            const targetReg = findRegionForPiece(
              piece.width * SCALE,
              piece.height * SCALE,
              offsetX,
              offsetY
            );
            if (!targetReg || pieces.find((p) => p.id === piece.id)) return;

            const orient =
              cutOrientation === "vertical"
                ? "vertical"
                : cutOrientation === "horizontal"
                ? "horizontal"
                : "horizontal";

            // Asegura que se alinee con el borde superior izquierdo de la región objetivo
            const snapped = {
              x: Math.round(targetReg.x),
              y: Math.round(targetReg.y),
            };

            if (
              checkCollision(
                null,
                snapped.x,
                snapped.y,
                piece.width * SCALE,
                piece.height * SCALE
              )
            )
              return;

            // Validación: la pieza debe estar alineada a la esquina superior izquierda de la región
            if (
              Math.abs(snapped.x - targetReg.x) > 1 ||
              Math.abs(snapped.y - targetReg.y) > 1
            ) {
              return;
            }

            setPieces((prev) => [...prev, { ...piece, ...snapped }]);
            setAvailablePieces((prev) => prev.filter((p) => p.id !== piece.id));

            if (orient === "vertical") {
              addVerticalCut(snapped.x + piece.width * SCALE);
              setRegions((prev) => {
                const newRegs = splitRegionVertical(
                  targetReg,
                  piece.width * SCALE,
                  piece.height * SCALE
                );
                const filtered = [
                  ...prev.filter((r) => r !== targetReg),
                  ...newRegs,
                ];
                return filtered.filter(
                  (r, i, arr) =>
                    arr.findIndex(
                      (rr) =>
                        Math.abs(rr.x - r.x) < 1 &&
                        Math.abs(rr.y - r.y) < 1 &&
                        Math.abs(rr.width - r.width) < 1 &&
                        Math.abs(rr.height - r.height) < 1
                    ) === i
                );
              });
            } else {
              addHorizontalCut(snapped.y + piece.height * SCALE);
              setRegions((prev) => {
                const newRegs = splitRegionHorizontal(
                  targetReg,
                  piece.width * SCALE,
                  piece.height * SCALE
                );
                const filtered = [
                  ...prev.filter((r) => r !== targetReg),
                  ...newRegs,
                ];
                return filtered.filter(
                  (r, i, arr) =>
                    arr.findIndex(
                      (rr) =>
                        Math.abs(rr.x - r.x) < 1 &&
                        Math.abs(rr.y - r.y) < 1 &&
                        Math.abs(rr.width - r.width) < 1 &&
                        Math.abs(rr.height - r.height) < 1
                    ) === i
                );
              });
            }
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          {/* Medidas tablero */}
          <div
            className="absolute text-red-600 font-semibold text-sm"
            style={{ top: -20, left: "50%", transform: "translateX(-50%)" }}
          >
            {BOARD_WIDTH_MM} mm
          </div>
          <div
            className="absolute text-red-600 font-semibold text-sm"
            style={{
              top: "50%",
              left: -20,
              transform: "rotate(-90deg) translate(-50%, -100%)",
            }}
          >
            {BOARD_HEIGHT_MM} mm
          </div>

          <Stage
            width={BOARD_WIDTH + 2 * MARGIN}
            height={BOARD_HEIGHT + 2 * MARGIN}
            className="border"
          >
            {/* Fondo */}
            <Layer>
              <Rect
                x={MARGIN}
                y={MARGIN}
                width={BOARD_WIDTH}
                height={BOARD_HEIGHT}
                fill="#f1f5f9"
                stroke="#000"
                strokeWidth={1}
              />
            </Layer>

            {/* Piezas */}
            <Layer>
              {pieces.map((piece) => (
                <React.Fragment key={piece.id}>
                  <Rect
                    x={piece.x}
                    y={piece.y}
                    width={piece.width * SCALE}
                    height={piece.height * SCALE}
                    fill="#60a5fa"
                    stroke={selectedId === piece.id ? "#ff9800" : "#1e3a8a"}
                    strokeWidth={selectedId === piece.id ? 2 : 1}
                    draggable
                    onClick={(e) => {
                      e.cancelBubble = true;
                      setSelectedId(piece.id);
                    }}
                    onDragStart={() =>
                      handleDragStart(piece.id, piece.x, piece.y, piece)
                    }
                    onDragEnd={(e) =>
                      handleDragEnd(
                        piece.id,
                        e.target.x(),
                        e.target.y(),
                        piece,
                        e.target
                      )
                    }
                    onDblClick={() => rotatePiece(piece.id)}
                  />
                  <Text
                    x={piece.x + 5}
                    y={piece.y + 5}
                    text={piece.name}
                    fontSize={14}
                  />
                  <Text
                    x={piece.x + (piece.width * SCALE) / 2}
                    y={piece.y + (piece.height * SCALE) / 2 - 8}
                    text={`${piece.width} x ${piece.height} mm`}
                    fontSize={12}
                    align="center"
                    verticalAlign="middle"
                    offsetX={
                      (`${piece.width} x ${piece.height} mm`.length * 6) / 2
                    }
                  />
                </React.Fragment>
              ))}
            </Layer>

            {/* Líneas de corte */}
            <Layer>
              {cuts.map((c, i) => {
                const { xStart, xEnd } = getHorizontalCutRange(c.y);
                return (
                  <Line
                    key={i}
                    points={[xStart, c.y, xEnd, c.y]}
                    stroke="#ff0000"
                    strokeWidth={1}
                    dash={[4, 4]}
                  />
                );
              })}
              {vCuts.map((c, i) => {
                const { yStart, yEnd } = getVerticalCutRange(c.x);
                return (
                  <Line
                    key={`v${i}`}
                    points={[c.x, yStart, c.x, yEnd]}
                    stroke="#ff0000"
                    strokeWidth={1}
                    dash={[4, 4]}
                  />
                );
              })}
            </Layer>

            {/* Regiones libres (debug) */}
            <Layer>
              {regions.map((r, i) => (
                <Rect
                  key={i}
                  x={r.x}
                  y={r.y}
                  width={r.width}
                  height={r.height}
                  stroke="rgba(0,0,0,0.2)"
                  dash={[2, 2]}
                />
              ))}
            </Layer>
          </Stage>
        </div>

        {/* -------- PANEL: PIEZAS LIBRES -------- */}
        <div className="border-dashed border-2 border-cyan-700 rounded-sm w-[180px] p-3">
          <p className="font-semibold mb-2">Piezas libres</p>

          {availablePieces.map((piece) => (
            <div
              key={piece.id}
              className="bg-blue-100 border border-blue-400 mb-2 px-2 py-1 text-sm cursor-pointer text-center"
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  "application/json",
                  JSON.stringify(piece)
                )
              }
            >
              {piece.name} — {piece.width}×{piece.height}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CutPlanEditor;
