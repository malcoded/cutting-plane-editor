import React, { useState, useRef, useEffect, useMemo } from "react";

import { Stage, Layer, Rect, Text } from "react-konva";
import groupBy from "lodash/groupBy";

/* --- Constantes de tablero y escala --- */
const BOARD_WIDTH_MM = 2750;
const BOARD_HEIGHT_MM = 1830;
const SCALE = 0.3;

// Refilado (material que se descarta en los bordes) en milímetros
const REFILADO_MM = 5;

// Área útil = tablero completo menos refilado a ambos lados
const BOARD_WIDTH = (BOARD_WIDTH_MM - 2 * REFILADO_MM) * SCALE;
const BOARD_HEIGHT = (BOARD_HEIGHT_MM - 2 * REFILADO_MM) * SCALE;
const SNAP_TOLERANCE_MM = 30;
const SNAP_TOLERANCE = SNAP_TOLERANCE_MM * SCALE;
// Margen en píxeles, derivado del refilado
const MARGIN = REFILADO_MM * SCALE;

const KERF = 5 * SCALE; // espesor de sierra en px

// Dirección de veta del tablero: "" (sin especificar), "L" (veta paralela al eje Y / largo) o "A" (veta paralela al eje X / ancho)
const GRAIN = ""; // cambiar a "L" o "A" según corresponda

const MIN_WASTE_MM = 30;
const MIN_WASTE = MIN_WASTE_MM * SCALE; // px

/**
 * Retorna true si la pieza (en mm) está por debajo del umbral mínimo
 * para ser colocada en el tablero.
 */
const isTooSmallPiece = (wMm, hMm) => wMm < MIN_WASTE_MM || hMm < MIN_WASTE_MM;

// Paleta de colores pastel semitransparentes para depurar regiones
const REGION_COLORS = [
  "rgba(255,236,179,0.4)", // pastel yellow
  "rgba(187,222,251,0.4)", // pastel blue
  "rgba(200,230,201,0.4)", // pastel green
  "rgba(255,205,210,0.4)", // pastel red
  "rgba(209,196,233,0.4)", // pastel violet
];
let regionColorIdx = 0;

const nextRegionColor = () =>
  REGION_COLORS[regionColorIdx++ % REGION_COLORS.length];

/* ---------- Sub‑componentes presentacionales ---------- */
const PieceRect = ({
  piece,
  isSelected,
  SCALE,
  onClick,
  onDragStart,
  onDragEnd,
  onDragMove,
}) => (
  <>
    <Rect
      x={piece.x}
      y={piece.y}
      width={piece.width * SCALE}
      height={piece.height * SCALE}
      fill="#60a5fa"
      stroke={isSelected ? "#ff9800" : "#1e3a8a"}
      strokeWidth={isSelected ? 2 : 1}
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragMove={onDragMove}
    />
    <Text x={piece.x + 5} y={piece.y + 5} text={piece.name} fontSize={14} />
    <Text
      x={piece.x + (piece.width * SCALE) / 2}
      y={piece.y + (piece.height * SCALE) / 2 - 8}
      text={`${piece.width} x ${piece.height} mm`}
      fontSize={12}
      align="center"
      verticalAlign="middle"
      offsetX={(`${piece.width} x ${piece.height} mm`.length * 6) / 2}
    />
  </>
);

const FreePieceCard = ({
  piece,
  groupLen,
  SCALE,
  GRAIN,
  isSmall,
  rotateAvailablePiece,
}) => {
  const aVal = GRAIN === "A" ? piece.height : piece.width;
  const lVal = GRAIN === "A" ? piece.width : piece.height;
  return (
    <div className="break-inside-avoid">
      <div
        className="relative bg-blue-100 border border-blue-400 cursor-pointer select-none"
        style={{
          width: `${piece.width * SCALE}px`,
          height: `${piece.height * SCALE}px`,
        }}
        draggable
        onDragStart={(e) =>
          e.dataTransfer.setData("application/json", JSON.stringify(piece))
        }
        title={`A:${aVal} L:${lVal} - ${piece.name}`}
      >
        {piece.rotatable && (
          <span
            className="absolute bottom-0 right-0 p-0.5 leading-none text-blue-700 hover:text-blue-900 cursor-pointer bg-white/70 rounded-bl-sm"
            title="Rotar"
            onClick={(e) => {
              e.stopPropagation();
              rotateAvailablePiece(piece.id);
            }}
          >
            ↻
          </span>
        )}
        {groupLen > 1 && (
          <span className="absolute -top-2 -right-2 bg-gray-700 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center">
            {groupLen}
          </span>
        )}
        {!isSmall && (
          <>
            <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[11px] font-semibold pointer-events-none select-none">
              A:{aVal}
            </span>
            <span className="absolute top-1/2 left-[-9px] -translate-y-1/2 -rotate-90 origin-center text-[11px] font-semibold pointer-events-none select-none">
              L:{lVal}
            </span>
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold pointer-events-none select-none">
              {piece.name}
            </span>
          </>
        )}
        {isSmall && (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold pointer-events-none select-none">
            {piece.name}
          </span>
        )}
      </div>
      {isSmall && (
        <div className="text-center text-[11px] mt-1">
          <hr className="border-gray-400 mb-1 border-dashed" />
          <div>A:{aVal}</div>
          <div>L:{lVal}</div>
        </div>
      )}
    </div>
  );
};

function CutPlanEditor() {
  /* --- Estados principales --- */
  const [cutOrientation, setCutOrientation] = useState("vertical");
  const [pieces, setPieces] = useState([]); // piezas en tablero
  const initialAvailablePieces = [
    // piezas libres
    { id: 1, name: "A", width: 400, height: 300, rotatable: false },
    { id: 2, name: "B", width: 300, height: 200, rotatable: false },
    { id: 3, name: "C", width: 200, height: 250, rotatable: false },
    { id: 4, name: "D", width: 100, height: 100, rotatable: false },
    { id: 5, name: "E", width: 300, height: 200, rotatable: false },
    { id: 6, name: "F", width: 300, height: 200, rotatable: true },
    { id: 7, name: "G", width: 300, height: 200, rotatable: true },
    { id: 8, name: "H", width: 500, height: 300, rotatable: true },
    { id: 9, name: "I", width: 2100, height: 300, rotatable: true },
    // { id: 10, name: "J", width: 20, height: 29, rotatable: false },
  ];
  const [availablePieces, setAvailablePieces] = useState(
    initialAvailablePieces
  );
  const [regions, setRegions] = useState([
    {
      x: MARGIN,
      y: MARGIN,
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      direction: null,
      color: nextRegionColor(),
    },
  ]);
  const [_cuts, setCuts] = useState([]); // horizontales
  const [_vCuts, setVCuts] = useState([]); // verticales
  const [selectedId, setSelectedId] = useState(null);
  // Índice de la sub‑región donde podría encajar la pieza arrastrada
  const [hoverRegIdx, setHoverRegIdx] = useState(null);
  // Pieza arrastrada que requiere confirmación de orientación
  // {piece, region, x, y}
  // const [pendingPlacement, setPendingPlacement] = useState(null);
  const prevPositions = useRef({}); // posición antes de arrastrar

  // Guarda las coordenadas de cortes que ya consumieron kerf,
  // así no lo descontamos dos veces entre piezas adyacentes.
  const usedVerticalCuts = useRef(new Set()); // valores X en px
  const usedHorizontalCuts = useRef(new Set()); // valores Y en px

  // ---- Agrupación ordenada de piezas libres ----
  const sizeGroups = useMemo(
    () => groupBy(availablePieces, (p) => `${p.width}×${p.height}`),
    [availablePieces]
  );

  // Orden estable: primero por ancho, luego alto
  const orderedSizes = useMemo(() => {
    return Object.keys(sizeGroups).sort((a, b) => {
      const [w1, h1] = a.split("×").map(Number);
      const [w2, h2] = b.split("×").map(Number);
      return w1 === w2 ? h1 - h2 : w1 - w2;
    });
  }, [sizeGroups]);

  /* ---------- Manejo de teclado (ESC, DELETE) ---------- */
  useEffect(() => {
    const handleKey = (e) => {
      if (
        ["Escape", "Delete", "Backspace"].includes(e.key) &&
        selectedId !== null
      ) {
        const removed = pieces.find((p) => p.id === selectedId);
        if (!removed) return;

        const areaX = removed.cutArea?.x ?? removed.x;
        const areaY = removed.cutArea?.y ?? removed.y;
        const areaX2 =
          areaX + (removed.cutArea?.width ?? removed.width * SCALE);
        const areaY2 =
          areaY + (removed.cutArea?.height ?? removed.height * SCALE);

        const children = pieces.filter((p) => {
          const pw = p.width * SCALE;
          const ph = p.height * SCALE;
          const px = p.x;
          const py = p.y;
          return (
            px < areaX2 && px + pw > areaX && py < areaY2 && py + ph > areaY
          );
        });

        const filtered = pieces.filter((p) => !children.includes(p));

        setAvailablePieces((prev) => {
          const newOnes = children
            .filter((p) => !prev.find((ap) => ap.id === p.id))
            .map((p) => ({
              id: p.id,
              name: p.name,
              width: p.width,
              height: p.height,
              rotatable: p.rotatable ?? false,
            }));
          return [...prev, ...newOnes];
        });

        setPieces(filtered);
        setSelectedId(null);
        rebuildLayoutFromPieces(filtered);
      } else if (e.key?.toLowerCase() === "v") {
        // Cambia la orientación de corte al presionar "V"
        setCutOrientation((prev) =>
          prev === "vertical" ? "horizontal" : "vertical"
        );
      } else if (e.key?.toLowerCase() === "h") {
        // Cambia la orientación de corte al presionar "H"
        setCutOrientation((prev) =>
          prev === "horizontal" ? "vertical" : "horizontal"
        );
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, pieces]);

  /* ==========================================================
   ALGORITMOS DE LAYOUT Y CORTE (Guillotina)
   ----------------------------------------------------------
   Todas las funciones a continuación son puras: dependen
   únicamente de sus parámetros y no modifican estado React
   directo.  Se encargan de geometría, colisiones y reglas
   específicas de corte.  Cada una incluye documentación
   JSDoc para facilitar mantenimiento y pruebas unitarias.
========================================================== */

  /**
   * Determina si un rectángulo (pieza hipotética) colisiona con
   * alguna pieza ya posicionada en el tablero.
   *
   * @param {number|null} id           ID de la pieza que se está moviendo
   *                                   (puede ser null si aún no existe en `pieces`).
   * @param {number}       x           Coordenada X (px) de la esquina sup‑izq propuesta
   * @param {number}       y           Coordenada Y (px) de la esquina sup‑izq propuesta
   * @param {number}       w           Ancho de la pieza en pixeles  (width * SCALE)
   * @param {number}       h           Alto  de la pieza en pixeles  (height * SCALE)
   * @returns {boolean} `true` si la pieza se solaparía con otra existente.
   */
  const checkCollision = (id, x, y, w, h) =>
    pieces.some((p) => {
      if (p.id === id) return false;
      const pw = p.width * SCALE,
        ph = p.height * SCALE;
      return !(x + w <= p.x || x >= p.x + pw || y + h <= p.y || y >= p.y + ph);
    });

  // Helper to find region index that fits at a given coord
  const regionIndexForPosition = (w, h, x, y) =>
    regions.findIndex(
      (r) =>
        w <= r.width &&
        h <= r.height &&
        x >= r.x &&
        y >= r.y &&
        x + w <= r.x + r.width &&
        y + h <= r.y + r.height
    );

  /**
   * Ajusta la posición (x,y) para “imantar” la pieza a bordes del
   * tablero o a otras piezas, siempre dejando un pasillo del ancho
   * del kerf entre ellas.  Además limita la pieza a no salir del
   * área útil del tablero.
   *
   * @param {number|null} id  ID de la pieza (se ignora al comparar con ella misma)
   * @param {number} x        Posición X actual
   * @param {number} y        Posición Y actual
   * @param {number} w        Ancho de la pieza (px)
   * @param {number} h        Alto  de la pieza (px)
   * @returns {{x:number, y:number}} Nueva coordenada “snapeada”
   */
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
  const addHorizontalCut = (
    y,
    xStart = MARGIN,
    xEnd = BOARD_WIDTH + MARGIN
  ) => {
    if (y <= MARGIN || y >= BOARD_HEIGHT + MARGIN) return;
    const newCut = {
      y,
      xStart,
      xEnd,
    };
    setCuts((prev) =>
      prev.some((c) => Math.abs(c.y - y) < 1) ? prev : [...prev, newCut]
    );
  };
  // Registra una línea de corte vertical (y evita duplicados)
  const addVerticalCut = (x, yStart = MARGIN, yEnd = BOARD_HEIGHT + MARGIN) => {
    if (x <= MARGIN || x >= BOARD_WIDTH + MARGIN) return;
    const newCut = {
      x,
      yStart,
      yEnd,
    };
    setVCuts((prev) =>
      prev.some((c) => Math.abs(c.x - x) < 1) ? prev : [...prev, newCut]
    );
  };

  /**
   * Parte la región dada mediante un corte horizontal tipo guillotina.
   * Devuelve las sub‑regiones resultantes, excluyendo trozos menores
   * a 30×30 px.
   *
   * @param {Region} reg  Región a dividir
   * @param {number} w    Ancho de la pieza recién colocada (px)
   * @param {number} h    Alto  de la pieza recién colocada (px)
   * @returns {Region[]}  Array (hasta 2) de sub‑regiones válidas
   */
  const splitRegionHorizontal = (reg, w, h) => {
    const cutY = reg.y + h;
    const kerfOffset = usedHorizontalCuts.current.has(cutY) ? 0 : KERF;
    if (!usedHorizontalCuts.current.has(cutY)) {
      usedHorizontalCuts.current.add(cutY);
    }
    const below = {
      x: reg.x,
      y: reg.y + h + kerfOffset,
      width: reg.width,
      height: reg.height - h - kerfOffset,
      direction: null,
      color: nextRegionColor(),
    };
    const right = {
      x: reg.x + w + kerfOffset,
      y: reg.y,
      width: reg.width - w - kerfOffset,
      height: h,
      direction: null,
      color: nextRegionColor(),
    };
    // Filtra sub‑regiones con dimensión válida (≥30×30 px)
    const subRegions = [below, right].filter(
      (r) => r.width >= 30 && r.height >= 30
    );

    // Si ninguna sub‑región supera el umbral, mantenemos la región original
    if (subRegions.length === 0) return [reg];

    // Si queda exactamente una sub‑región válida, usamos solo esa
    return subRegions;
  };

  /**
   * Parte la región dada mediante un corte vertical tipo guillotina.
   * Devuelve las sub‑regiones resultantes, excluyendo trozos menores
   * a 30×30 px.
   *
   * @param {Region} reg  Región a dividir
   * @param {number} w    Ancho de la pieza recién colocada (px)
   * @param {number} h    Alto  de la pieza recién colocada (px)
   * @returns {Region[]}  Array (hasta 2) de sub‑regiones válidas
   */
  const splitRegionVertical = (reg, w, h) => {
    const cutX = reg.x + w; // posición real del corte
    const kerfOffset = usedVerticalCuts.current.has(cutX) ? 0 : KERF;
    if (!usedVerticalCuts.current.has(cutX)) {
      usedVerticalCuts.current.add(cutX);
    }
    const right = {
      x: reg.x + w + kerfOffset,
      y: reg.y,
      width: reg.width - w - kerfOffset,
      height: reg.height,
      direction: null,
      color: nextRegionColor(),
    };
    const below = {
      x: reg.x,
      y: reg.y + h + kerfOffset,
      width: w,
      height: reg.height - h - kerfOffset,
      direction: null,
      color: nextRegionColor(),
    };
    const subRegions = [right, below].filter(
      (r) => r.width >= 30 && r.height >= 30
    );

    if (subRegions.length === 0) return [reg];
    return subRegions;
  };

  /**
   * Devuelve la primera sub‑región que puede contener la pieza en
   * la posición deseada.  Se usa para validar drag‑end o drops.
   *
   * @param {number} w  Ancho (px)
   * @param {number} h  Alto  (px)
   * @param {number} x  X sup‑izq
   * @param {number} y  Y sup‑izq
   * @returns {Region|null} Región adecuada o null si ninguna encaja.
   */
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

  /**
   * Comprueba que un corte vertical hipotético no atraviese ninguna
   * pieza distinta de la que se está colocando.
   *
   * @param {number}  cutX          Coordenada X de la línea de corte propuesta
   * @param {number}  y             Y sup‑izq de la pieza actual
   * @param {number}  h             Alto de la pieza actual (px)
   * @param {Array}   allPieces     Lista completa de piezas posicionadas
   * @param {number}  currentPieceId  ID de la pieza evaluada (para excluirla)
   * @returns {boolean} `true` si el corte está libre de colisiones
   */
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

  /**
   * Reconstruye todo el layout a partir del array `pieces` ya
   * posicionadas.  Calcula regiones libres, direcciones de corte y
   * líneas de guillotina necesarias, aplicando snapping y kerf según
   * las reglas de producción.
   *
   * Complejidad: O(n²) en peor caso (por la validación de cortes).
   *
   * @param {Piece[]} pieceArr  Copia del estado `pieces`
   */
  const rebuildLayoutFromPieces = (pieceArr) => {
    // Reset
    let newRegions = [
      {
        x: MARGIN,
        y: MARGIN,
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        direction: null,
        color: nextRegionColor(),
      },
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

      piece.cutArea = {
        x: reg.x,
        y: reg.y,
        width: reg.width,
        height: reg.height,
      };

      // Validar que la pieza esté alineada a la esquina superior izquierda de la región
      if (Math.abs(piece.x - reg.x) > 1 || Math.abs(piece.y - reg.y) > 1) {
        return;
      }

      // --- Orientación de corte coherente ---
      // Prioridad:
      // 1) Si la pieza ya trae cutDirection, se respeta.
      // 2) Si la región tiene direction, se usa.
      // 3) En otro caso, se emplea la orientación global.
      let orient = piece.cutDirection
        ? piece.cutDirection
        : reg.direction || cutOrientation;

      // Viabilidad de cortes en esta región
      const canCutHorizontal = reg.width >= w && reg.height > h;
      const canCutVertical = reg.height >= h && reg.width > w;

      // Determine fallback orientation if the desired orientation is not viable
      const determineFallbackOrientation = (
        desired,
        canVertical,
        canHorizontal
      ) => {
        // If desired is vertical but not viable, switch to horizontal if possible
        if (desired === "vertical" && !canVertical && canHorizontal) {
          return "horizontal";
        }
        // If desired is horizontal but not viable, switch to vertical if possible
        if (desired === "horizontal" && !canHorizontal && canVertical) {
          return "vertical";
        }
        // Otherwise, retain the desired orientation
        return desired;
      };
      orient = determineFallbackOrientation(
        orient,
        canCutVertical,
        canCutHorizontal
      );

      // --- Persistir la dirección final ---
      // Solo fijamos direction en la región la primera vez que se corta;
      // así una sub‑región nacida de un corte vertical aún puede recibir
      // cortes horizontales en el futuro.
      if (!reg.direction) reg.direction = orient;
      piece.cutDirection = orient;

      if (orient === "vertical" && canCutVertical) {
        const cutX = piece.x + w;
        if (isVerticalCutClear(cutX, piece.y, h, sortedPieces, piece.id)) {
          newVCuts.push({
            x: cutX,
            yStart: reg.y,
            yEnd: reg.y + reg.height,
          });
          newRegions = [
            ...newRegions.filter((r) => r !== reg),
            ...splitRegionVertical(reg, w, h),
          ];
        }
      } else if (orient === "horizontal" && canCutHorizontal) {
        newCuts.push({
          y: piece.y + h,
          xStart: reg.x,
          xEnd: reg.x + reg.width,
        });
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
        index ===
          self.findIndex(
            (c) =>
              Math.abs(c.y - cut.y) < 1 && Math.abs(c.xStart - cut.xStart) < 1
          )
    );
    newVCuts = newVCuts.filter(
      (cut, index, self) =>
        cut.x > MARGIN &&
        cut.x < MARGIN + BOARD_WIDTH &&
        index ===
          self.findIndex(
            (c) =>
              Math.abs(c.x - cut.x) < 1 && Math.abs(c.yStart - cut.yStart) < 1
          )
    );

    // Numerar cortes para vista previa de secuencia
    newCuts = newCuts
      .sort((a, b) => a.y - b.y || a.xStart - b.xStart)
      .map((c, i) => ({ ...c, order: i + 1 }));
    newVCuts = newVCuts
      .sort((a, b) => a.x - b.x || a.yStart - b.yStart)
      .map((c, i) => ({ ...c, order: i + 1 }));

    setRegions(newRegions);
    setCuts(newCuts);
    setVCuts(newVCuts);
  };

  /* -------- DRAG: iniciar -------- */
  const handleDragStart = (id, x, y, piece) => {
    setHoverRegIdx(null);
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
      return exists
        ? prev
        : [...prev, { x, y, width: w, height: h, direction: null }];
    });

    // Al iniciar el arrastre, eliminamos la orientación de la pieza
    // para que al soltarla pueda adoptar la orientación global actual.
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, cutDirection: null } : p))
    );
  };

  /* -------- DRAG: finalizar -------- */
  const handleDragEnd = (id, newX, newY, piece, node) => {
    // Escalar dimensiones de la pieza
    const w = piece.width * SCALE,
      h = piece.height * SCALE;

    // Abortamos si la pieza es menor al umbral mínimo permitido
    if (isTooSmallPiece(piece.width, piece.height)) return;

    // Aplicar snapping a la posición soltada
    const snapped = applySnap(id, newX, newY, w, h);

    /* ==== 1. Determinar la sub‑región destino de forma permisiva ==== */

    // a) Intento 1: la esquina después de aplicar snap
    let reg = findRegionForPiece(w, h, snapped.x, snapped.y);

    // Imantar SIEMPRE a la esquina sup‑izq de la región destino
    if (reg) {
      snapped.x = reg.x;
      snapped.y = reg.y;
    }

    // b) Intento 2: la región bajo el cursor, aunque la esquina aún no coincida
    if (!reg) {
      const cursorReg = regions.find(
        (r) =>
          newX >= r.x &&
          newX <= r.x + r.width &&
          newY >= r.y &&
          newY <= r.y + r.height
      );
      if (cursorReg && w <= cursorReg.width && h <= cursorReg.height) {
        reg = cursorReg;
        // Imantamos la pieza a la esquina sup‑izq de la región
        snapped.x = reg.x;
        snapped.y = reg.y;
      }
    }

    // c) Si no encontramos ninguna región válida → revertir
    if (!reg) {
      const { x, y } = prevPositions.current[id];
      node.position({ x, y });
      node.getLayer().batchDraw();
      setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
      return;
    }

    /* ==== 2. Comprobar colisión en su nueva posición ==== */
    if (checkCollision(id, snapped.x, snapped.y, w, h)) {
      const { x, y } = prevPositions.current[id];
      node.position({ x, y });
      node.getLayer().batchDraw();
      setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
      return;
    }

    // ✅ Actualizar estado con la nueva posición y recalcular layout
    const updatedPieces = pieces.map((p) =>
      p.id === id ? { ...p, x: snapped.x, y: snapped.y } : p
    );
    setPieces(updatedPieces);
    rebuildLayoutFromPieces(updatedPieces);

    setHoverRegIdx(null);

    // Actualizar posición visual del nodo en el canvas
    node.position({ x: snapped.x, y: snapped.y });
    node.getLayer().batchDraw();
    console.log(regions);
  };

  /* -------- Rotar pieza (doble clic) -------- */
  // Rota una pieza 90° y verifica si aún encaja en su posición actual
  // const rotatePiece = (id) => {
  //   setPieces((prev) =>
  //     prev.map((p) => {
  //       if (p.id !== id) return p;
  //       const rotated = { ...p, width: p.height, height: p.width };
  //       const fits =
  //         !checkCollision(
  //           id,
  //           rotated.x,
  //           rotated.y,
  //           rotated.width * SCALE,
  //           rotated.height * SCALE
  //         ) &&
  //         findRegionForPiece(
  //           rotated.width * SCALE,
  //           rotated.height * SCALE,
  //           rotated.x,
  //           rotated.y
  //         );
  //       return fits ? rotated : p;
  //     })
  //   );
  // };

  // Rota una pieza que aún está en el panel de piezas libres
  const rotateAvailablePiece = (id) => {
    setAvailablePieces((prev) =>
      prev.map((p) => {
        if (p.id !== id || !p.rotatable) return p;
        return { ...p, width: p.height, height: p.width };
      })
    );
  };

  const placePieceWithOrientation = (piece, targetReg, orient) => {
    // Coordenada esquina sup‑izq siempre es la de la región
    const snapped = { x: targetReg.x, y: targetReg.y };

    // Añadir pieza al tablero
    setPieces((prev) => [
      ...prev,
      { ...piece, ...snapped, cutDirection: orient },
    ]);
    setAvailablePieces((prev) => prev.filter((p) => p.id !== piece.id));

    if (orient === "vertical") {
      addVerticalCut(
        snapped.x + piece.width * SCALE,
        targetReg.y,
        targetReg.y + targetReg.height
      );
      setRegions((prev) => {
        const newRegs = splitRegionVertical(
          targetReg,
          piece.width * SCALE,
          piece.height * SCALE
        );
        const filtered = [...prev.filter((r) => r !== targetReg), ...newRegs];
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
      addHorizontalCut(
        snapped.y + piece.height * SCALE,
        targetReg.x,
        targetReg.x + targetReg.width
      );
      setRegions((prev) => {
        const newRegs = splitRegionHorizontal(
          targetReg,
          piece.width * SCALE,
          piece.height * SCALE
        );
        const filtered = [...prev.filter((r) => r !== targetReg), ...newRegs];
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
  };

  const handleReset = () => {
    regionColorIdx = 0; // Resetear contador de colores
    setPieces([]);
    setAvailablePieces([...initialAvailablePieces]);
    setRegions([
      {
        x: MARGIN,
        y: MARGIN,
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        direction: null,
        color: nextRegionColor(),
      },
    ]);
    setCuts([]);
    setVCuts([]);
    setSelectedId(null);
    usedVerticalCuts.current.clear();
    usedHorizontalCuts.current.clear();
  };

  /**
   * Maneja el evento onDrop sobre el tablero.
   *  - Recupera la pieza del dataTransfer
   *  - Encuentra la sub‑región bajo el cursor
   *  - Verifica que la pieza quepa y no colisione
   *  - Determina orientación (sin popup) y la coloca
   */
  const handleDrop = (e) => {
    e.preventDefault();
    const piece = JSON.parse(e.dataTransfer.getData("application/json"));

    // No permitir piezas más pequeñas que el desperdicio mínimo
    if (isTooSmallPiece(piece.width, piece.height)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - MARGIN;
    const offsetY = e.clientY - rect.top - MARGIN;

    // 1) región debajo del puntero
    let targetReg = regions.find(
      (r) =>
        offsetX >= r.x &&
        offsetX <= r.x + r.width &&
        offsetY >= r.y &&
        offsetY <= r.y + r.height
    );

    // 2) si no hay región o la pieza ya está en tablero, abortar
    if (!targetReg || pieces.find((p) => p.id === piece.id)) return;

    // 3) verificar que la pieza *cabe*
    const wScaled = piece.width * SCALE;
    const hScaled = piece.height * SCALE;
    if (wScaled > targetReg.width || hScaled > targetReg.height) return;

    // 4) esquina sup‑izq de la sub‑región
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

    // 5) Determinar orientación sin popup
    let orient = targetReg.direction || cutOrientation;
    const canCutHorizontal =
      targetReg.width >= wScaled && targetReg.height > hScaled;
    const canCutVertical =
      targetReg.height >= hScaled && targetReg.width > wScaled;
    if (orient === "vertical" && !canCutVertical && canCutHorizontal) {
      orient = "horizontal";
    } else if (orient === "horizontal" && !canCutHorizontal && canCutVertical) {
      orient = "vertical";
    }

    placePieceWithOrientation(piece, targetReg, orient);
  };

  /* ============== Render UI ============== */
  return (
    <div className="py-4 px-6">
      {/* Selector de orientación */}
      <div className="mb-6 flex items-center gap-1">
        <div>
          <label className="mr-2">Orientación de corte:</label>
          <select
            className="border px-2 py-1 rounded"
            value={cutOrientation}
            onChange={(e) => setCutOrientation(e.target.value)}
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>

        {/* Botón de Reset */}
        <button
          onClick={handleReset}
          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded"
        >
          Reiniciar Tablero
        </button>
      </div>

      <div className="flex gap-4">
        {/* -------- TABLERO -------- */}
        <div
          className="relative inline-block"
          onClick={(e) => e.target === e.currentTarget && setSelectedId(null)}
          onDrop={handleDrop}
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
                x={0}
                y={0}
                width={BOARD_WIDTH + 2 * MARGIN}
                height={BOARD_HEIGHT + 2 * MARGIN}
                fill="#edc328"
                stroke="#000"
                strokeWidth={0.5}
                dash={[8, 8]}
                listening={false}
              />
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

            {/* Regiones libres (debug) — debajo de todo */}
            <Layer>
              {regions.map((r, i) => (
                <Rect
                  key={i}
                  x={r.x}
                  y={r.y}
                  width={r.width}
                  height={r.height}
                  fill={r.color}
                  stroke={i === hoverRegIdx ? "#ff9800" : "rgba(0,0,0,0.2)"}
                  strokeWidth={i === hoverRegIdx ? 3 : 1}
                  dash={i === hoverRegIdx ? [] : [2, 2]}
                  listening={false}
                />
              ))}
            </Layer>

            {/* Piezas */}
            <Layer>
              {pieces.map((piece) => (
                <PieceRect
                  key={piece.id}
                  piece={piece}
                  SCALE={SCALE}
                  isSelected={selectedId === piece.id}
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
                  onDragMove={(e) => {
                    const node = e.target;
                    const w = piece.width * SCALE;
                    const h = piece.height * SCALE;
                    const idx = regionIndexForPosition(
                      w,
                      h,
                      node.x(),
                      node.y()
                    );
                    setHoverRegIdx(idx >= 0 ? idx : null);
                  }}
                />
              ))}
            </Layer>

            {/*
              ╭─────────────────────────────────────────────╮
              │  Se ha deshabilitado la visualización de    │
              │  líneas de corte para simplificar la vista. │
              ╰─────────────────────────────────────────────╯
            */}
          </Stage>
        </div>

        {/* -------- PANEL: PIEZAS LIBRES -------- */}
        <div className="border-dashed border-2 border-cyan-700 rounded-sm w-full p-3 overflow-x-hidden">
          <p className="font-semibold mb-2">Piezas libres</p>
          <div className="flex flex-wrap gap-2 w-full">
            {/* Agrupar piezas por tamaño ordenadamente */}
            {orderedSizes.map((size) => {
              const group = sizeGroups[size];
              if (!group.length) return null;
              const topPiece = group[0];
              const isSmall = topPiece.width <= 120 || topPiece.height <= 120;
              return (
                <div key={size}>
                  <FreePieceCard
                    piece={topPiece}
                    groupLen={group.length}
                    SCALE={SCALE}
                    GRAIN={GRAIN}
                    isSmall={isSmall}
                    rotateAvailablePiece={rotateAvailablePiece}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {/* Orientación Modal */}
        {/* modal deshabilitado */}
      </div>
    </div>
  );
}

export default CutPlanEditor;
