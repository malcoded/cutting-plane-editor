import React, { useState, useRef, useEffect } from "react";
import { Stage, Layer, Rect, Text, Line } from "react-konva";

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

export default function CutPlanEditor() {
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
        // quitar del tablero
        setPieces((prev) => prev.filter((p) => p.id !== selectedId));
        // devolver al panel libre si no está
        const removed = pieces.find((p) => p.id === selectedId);
        if (removed) {
          setAvailablePieces((prev) =>
            prev.find((p) => p.id === removed.id) ? prev : [...prev, removed]
          );
        }
        setSelectedId(null);
        // Recalcular cortes y regiones basados en las piezas restantes
        rebuildLayoutFromPieces(pieces.filter((p) => p.id !== selectedId));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedId, pieces]);

  /* ---------- Funciones de ayuda ---------- */
  const checkCollision = (id, x, y, w, h) =>
    pieces.some((p) => {
      if (p.id === id) return false;
      const pw = p.width * SCALE,
        ph = p.height * SCALE;
      return !(x + w <= p.x || x >= p.x + pw || y + h <= p.y || y >= p.y + ph);
    });

  const applySnap = (id, x, y, w, h) => {
    let sx = x,
      sy = y;
    for (const p of pieces) {
      if (p.id === id) continue;
      const pw = p.width * SCALE,
        ph = p.height * SCALE;
      if (Math.abs(x - (p.x + pw)) < SNAP_TOLERANCE) sx = p.x + pw;
      else if (Math.abs(x + w - p.x) < SNAP_TOLERANCE) sx = p.x - w;
      if (Math.abs(y - (p.y + ph)) < SNAP_TOLERANCE) sy = p.y + ph;
      else if (Math.abs(y + h - p.y) < SNAP_TOLERANCE) sy = p.y - h;
    }
    sx = Math.max(MARGIN, Math.min(sx, BOARD_WIDTH + MARGIN - w));
    sy = Math.max(MARGIN, Math.min(sy, BOARD_HEIGHT + MARGIN - h));
    return { x: sx, y: sy };
  };

  const addHorizontalCut = (y) => {
    if (y <= MARGIN || y >= BOARD_HEIGHT + MARGIN) return;
    setCuts((prev) =>
      prev.some((c) => Math.abs(c.y - y) < 1) ? prev : [...prev, { y }]
    );
  };
  const addVerticalCut = (x) => {
    if (x <= MARGIN || x >= BOARD_WIDTH + MARGIN) return;
    setVCuts((prev) =>
      prev.some((c) => Math.abs(c.x - x) < 1) ? prev : [...prev, { x }]
    );
  };

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
    return [below, right].filter((r) => r.width > 0 && r.height > 0);
  };
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
    return [right, below].filter((r) => r.width > 0 && r.height > 0);
  };

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

  const rebuildLayoutFromPieces = (pieceArr) => {
    // Reset
    let newRegions = [
      { x: MARGIN, y: MARGIN, width: BOARD_WIDTH, height: BOARD_HEIGHT },
    ];
    let newCuts = [];
    let newVCuts = [];

    pieceArr.forEach((piece) => {
      const w = piece.width * SCALE;
      const h = piece.height * SCALE;
      // find a region that exactly matches piece.x, piece.y
      const reg = newRegions.find(
        (r) =>
          piece.x === r.x && piece.y === r.y && w <= r.width && h <= r.height
      );
      if (!reg) return; // skip if not found (shouldn't happen)

      // decide orientation based on current global selector
      const orient =
        cutOrientation === "vertical"
          ? "vertical"
          : cutOrientation === "horizontal"
          ? "horizontal"
          : "horizontal";

      if (orient === "vertical") {
        newVCuts.push({ x: piece.x + w });
        newRegions = [
          ...newRegions.filter((r) => r !== reg),
          ...splitRegionVertical(reg, w, h),
        ];
      } else {
        newCuts.push({ y: piece.y + h });
        newRegions = [
          ...newRegions.filter((r) => r !== reg),
          ...splitRegionHorizontal(reg, w, h),
        ];
      }
    });

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
    setRegions((prev) => [...prev, { x, y, width: w, height: h }]);
  };

  /* -------- DRAG: finalizar -------- */
  const handleDragEnd = (id, newX, newY, piece, node) => {
    const w = piece.width * SCALE,
      h = piece.height * SCALE;
    const snapped = applySnap(id, newX, newY, w, h);
    const targetReg = findRegionForPiece(w, h, snapped.x, snapped.y);
    const ok = targetReg && !checkCollision(id, snapped.x, snapped.y, w, h);

    if (!ok) {
      const { x, y } = prevPositions.current[id];
      node.position({ x, y });
      node.getLayer().batchDraw();
      setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
      return;
    }

    /* --- actualizar pieza y re‑generar cortes + regiones --- */
    const updatedPieces = pieces.map((p) =>
      p.id === id ? { ...p, x: snapped.x, y: snapped.y } : p
    );
    setPieces(updatedPieces);
    rebuildLayoutFromPieces(updatedPieces);
    // sincronizar nodo y estado
    node.position({ x: snapped.x, y: snapped.y });
    node.getLayer().batchDraw();
  };

  /* -------- Rotar pieza (doble clic) -------- */
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

            const snapped = { x: targetReg.x, y: targetReg.y };
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

            setPieces((prev) => [...prev, { ...piece, ...snapped }]);
            setAvailablePieces((prev) => prev.filter((p) => p.id !== piece.id));

            if (orient === "vertical") {
              addVerticalCut(snapped.x + piece.width * SCALE);
              setRegions((prev) => [
                ...prev.filter((r) => r !== targetReg),
                ...splitRegionVertical(
                  targetReg,
                  piece.width * SCALE,
                  piece.height * SCALE
                ),
              ]);
            } else {
              addHorizontalCut(snapped.y + piece.height * SCALE);
              setRegions((prev) => [
                ...prev.filter((r) => r !== targetReg),
                ...splitRegionHorizontal(
                  targetReg,
                  piece.width * SCALE,
                  piece.height * SCALE
                ),
              ]);
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
              {cuts.map((c, i) => (
                <Line
                  key={i}
                  points={[MARGIN, c.y, BOARD_WIDTH + MARGIN, c.y]}
                  stroke="#ff0000"
                  strokeWidth={1}
                  dash={[4, 4]}
                />
              ))}
              {vCuts.map((c, i) => (
                <Line
                  key={`v${i}`}
                  points={[c.x, MARGIN, c.x, BOARD_HEIGHT + MARGIN]}
                  stroke="#ff0000"
                  strokeWidth={1}
                  dash={[4, 4]}
                />
              ))}
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
