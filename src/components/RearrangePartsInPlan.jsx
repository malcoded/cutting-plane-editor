import { useState, useEffect } from 'react';
import layouts from './layouts.json';

/* ----------Constantes ---------- */
const SCALE = 3;          // factor de escala para que quepa en pantalla
const EPS   = 1e-3;       // tolerancia numérica

/* ----------Helpers numéricos ---------- */
const toNum = (v) => (typeof v === 'string' ? parseFloat(v) : v);

/* Agrupa piezas que empiezan en la misma coordenada Y (filas de nivel‑0) */
function groupRows(parts) {
  const rows = [];
  parts.forEach((p) => {
    const y = toNum(p.y);
    let row = rows.find((r) => Math.abs(r.yStart - y) < EPS);
    if (!row) { row = { yStart: y, parts: [] }; rows.push(row); }
    row.parts.push(p);
  });
  console.log('Grouped rows:', rows);
  return rows.sort((a, b) => a.yStart - b.yStart);
}

/* Agrupa piezas que empiezan en la misma coordenada X (celdas de nivel‑1) */
function groupCells(rowParts) {
  const cells = [];
  rowParts.forEach((p) => {
    const x = toNum(p.x);
    let cell = cells.find((c) => Math.abs(c.xStart - x) < EPS);
    if (!cell) { cell = { xStart: x, parts: [] }; cells.push(cell); }
    cell.parts.push(p);
  });
  cells.forEach(
    (c) => (c.xEnd = Math.max(...c.parts.map((pt) => toNum(pt.x) + toNum(pt.width))))
  );
  return cells.sort((a, b) => a.xStart - b.xStart);
}

/* Cuenta cortes aLevel≥2 dentro de una celda */
function countInternalCuts(cell, row, cuts) {
  return cuts.reduce((acc, cut) => {
    if (parseInt(cut.aLevel, 10) < 2) return acc;
    const x1 = toNum(cut.x1), x2 = toNum(cut.x2);
    const y1 = toNum(cut.y1), y2 = toNum(cut.y2);
    const inX =
      x1 >= cell.xStart - EPS && x2 <= cell.xEnd + EPS;
    const inY =
      y1 >= row.yStart - EPS && y2 <= row.yEnd + EPS;
    const isVert = Math.abs(x1 - x2) < EPS && inX && inY;
    const isHorz = Math.abs(y1 - y2) < EPS && inX && inY;
    return isVert || isHorz ? acc + 1 : acc;
  }, 0);
}

/* ----------RE‑ORDENAMIENTO completo ---------- */
function rearrangePlan(plan) {
  const clone = structuredClone(plan);
  const sheet = clone.sPlanos?.[0]?.layout?.[0];
  if (!sheet) return clone;

  const { cuts, part: parts, cutsTrims } = sheet;
  const sawKerf = toNum(clone.sPlanos[0].layoutResume?.sawWidth ?? 0);

  /* 1️⃣  Filas (nivel‑0) */
  const rows = groupRows(parts);

  rows.forEach((row) => {
    row.yEnd = Math.max(...row.parts.map((p) => toNum(p.y) + toNum(p.length)));
    // Cortes verticales de nivel‑1 que INTERSECTAN la franja
    row.vertCuts = cuts.filter((ct) => {
      const isVertical = Math.abs(toNum(ct.x1) - toNum(ct.x2)) < EPS;
      if (!isVertical || parseInt(ct.aLevel, 10) !== 1) return false;

      const yA = Math.min(toNum(ct.y1), toNum(ct.y2));  // inicio de la línea
      const yB = Math.max(toNum(ct.y1), toNum(ct.y2));  // fin   de la línea

      // La línea intersecta la franja si no está totalmente por encima ni totalmente por debajo
      const intersects =
        !(yB <= row.yStart + EPS || yA >= row.yEnd - EPS);

      return intersects;
    }).length;
  });

  /* 2️⃣  Ordenar filas por menos→más cortes verticales */
  rows.sort((a, b) => a.vertCuts - b.vertCuts);

  /* 3️⃣  Y del refilado superior */
  const horizontals = [...cutsTrims, ...cuts].filter(
    (c) => Math.abs(toNum(c.y1) - toNum(c.y2)) < EPS
  );
  const topTrim = horizontals.map((c) => toNum(c.y1)).sort((a, b) => a - b)[0] ?? 0;

  let cursorY = topTrim;

  /* 4️⃣  Recorrer filas ya ordenadas */
  rows.forEach((row) => {
    /* 4A: ordenar celdas en la fila */
    row.cells = groupCells(row.parts);
    row.cells.forEach(
      (cell) => (cell.internalCuts = countInternalCuts(cell, row, cuts))
    );
    row.cells.sort((a, b) => a.internalCuts - b.internalCuts);

    const rowHeight = row.yEnd - row.yStart;
    const dy = cursorY - row.yStart;

    /* 4B: mover piezas en Y */
    row.parts.forEach((pt) => (pt.y = (toNum(pt.y) + dy).toString()));

    /* 4C: mover cortes de la fila */
    cuts.forEach((ct) => {
      const minY = Math.min(toNum(ct.y1), toNum(ct.y2));
      const maxY = Math.max(toNum(ct.y1), toNum(ct.y2));
      if (minY >= row.yStart - EPS && maxY <= row.yEnd + EPS) {
        ct.y1 = (toNum(ct.y1) + dy).toString();
        ct.y2 = (toNum(ct.y2) + dy).toString();
      }
    });

    /* 4D: mover retazos en Y */
    sheet.wastePart?.forEach((wp) => {
      const wy = toNum(wp.y);
      if (wy >= row.yStart - EPS && wy <= row.yEnd + EPS) wp.y = (wy + dy).toString();
    });

    /* 4E: reposicionar celdas (X) */
    let cursorX = [...cutsTrims, ...cuts]
      .filter(
        (c) =>
          parseInt(c.aLevel, 10) === 1 &&
          Math.abs(toNum(c.x1) - toNum(c.x2)) < EPS
      )
      .map((c) => toNum(c.x1))
      .sort((a, b) => a - b)[0] ?? 0;

    row.cells.forEach((cell) => {
      const dx = cursorX - cell.xStart;

      cell.parts.forEach((pt) => (pt.x = (toNum(pt.x) + dx).toString()));

      cuts.forEach((ct) => {
        const minX = Math.min(toNum(ct.x1), toNum(ct.x2));
        const maxX = Math.max(toNum(ct.x1), toNum(ct.x2));
        if (minX >= cell.xStart - EPS && maxX <= cell.xEnd + EPS) {
          ct.x1 = (toNum(ct.x1) + dx).toString();
          ct.x2 = (toNum(ct.x2) + dx).toString();
        }
      });

      const cellWidth = cell.xEnd - cell.xStart;
      cell.xStart = cursorX;
      cell.xEnd   = cursorX + cellWidth;
      cursorX = cell.xEnd + sawKerf;
    });

    cursorY += rowHeight + sawKerf;   // 4F: siguiente fila
  });

  rebuildCuts(sheet, sawKerf);   // reconstruye cortes con la nueva geometría
  return clone;
}


/* ---------- Reconstruir la lista de cortes ---------- */
function rebuildCuts(sheet, ) {
  // Recalcular filas y celdas basándonos en las piezas ya desplazadas
  const rows = groupRows(sheet.part);
  rows.forEach((row) => {
    row.yEnd = Math.max(...row.parts.map((p) => toNum(p.y) + toNum(p.length)));
    row.cells = groupCells(row.parts);
  });

  const cuts = [];
  const leftX = 0;
  const rightX = toNum(sheet.sheetW);

  /* Horizontales nivel‑0: evitar duplicados usando un Set */
  const ySet = new Set();
  rows.forEach((row) => {
    const y = toNum(row.yEnd);
    const yKey = y.toFixed(3);
    if (!ySet.has(yKey)) {
      ySet.add(yKey);
      cuts.push({
        x1: leftX.toString(),
        y1: y.toString(),
        x2: rightX.toString(),
        y2: y.toString(),
        aLevel: "0",
      });
    }
  });

  /* Verticales nivel‑1: al final de cada celda excepto el borde derecho */
  rows.forEach((row) => {
    row.cells.forEach((cell) => {
      const xSplit = cell.xEnd; // límite derecho de la celda
      if (xSplit >= rightX - EPS) return; // omite borde derecho
      cuts.push({
        x1: xSplit.toString(),
        y1: row.yStart.toString(),
        x2: xSplit.toString(),
        y2: row.yEnd.toString(),
        aLevel: "1",
      });
    });
  });

  /* 4️⃣  Horizontales nivel‑2 dentro de celdas:
     líneas donde la pieza no ocupa toda la altura de la fila */
  rows.forEach((row) => {
    row.cells.forEach((cell) => {
      const ySplits = new Set();
      cell.parts.forEach((pt) => {
        const bottom = toNum(pt.y) + toNum(pt.length);
        if (bottom < row.yEnd - EPS) {
          ySplits.add(bottom);
        }
      });
      ySplits.forEach((yVal) => {
        cuts.push({
          x1: cell.xStart.toString(),
          y1: yVal.toString(),
          x2: cell.xEnd.toString(),
          y2: yVal.toString(),
          aLevel: "2",
        });
      });
    });
  });

  /* Refilados perimetrales */
  cuts.push(
    { x1: leftX.toString(), y1: "0", x2: rightX.toString(), y2: "0", aLevel: "0" },
    { x1: leftX.toString(), y1: sheet.sheetH, x2: rightX.toString(), y2: sheet.sheetH, aLevel: "0" },
    { x1: "0", y1: "0", x2: "0", y2: sheet.sheetH, aLevel: "1" },
    { x1: sheet.sheetW, y1: "0", x2: sheet.sheetW, y2: sheet.sheetH, aLevel: "1" }
  );

  sheet.cuts = cuts;
}

/* ---------- Render con SVG ---------- */
const Piece = ({ p, scale }) => {
  const rot = p.rotated === 'True';
  const w   = rot ? Number(p.length) : Number(p.width);
  const h   = rot ? Number(p.width)  : Number(p.length);

  const x = Number(p.x) / scale;
  const y = Number(p.y) / scale;
  const wScaled = w / scale;
  const hScaled = h / scale;

  const fontSize = 8;        // tamaño de texto interno
  const offset   = 2;        // margen entre texto y borde

  return (
    <>
      {/* Rectángulo principal */}
      <rect
        x={x}
        y={y}
        width={wScaled}
        height={hScaled}
        fill="#9edfff"
        stroke="#000"
        strokeWidth={0.5}
      />

      {/* Medida horizontal (ancho) */}
      <text
        x={x + wScaled / 2}
        y={y + fontSize + offset + 4}   // bajamos 4 px extra
        fontSize={fontSize}
        textAnchor="middle"
        fill="#000"
      >
        {w}
      </text>

      {/* Medida vertical (alto) rota 90° */}
      <text
        transform={`rotate(-90 ${x + offset + 4} ${y + hScaled / 2})`}
        x={x + offset + 4}                 // alejamos 4 px del borde
        y={y + hScaled / 2}
        fontSize={fontSize}
        textAnchor="middle"
        fill="#000"
      >
        {h}
      </text>
    </>
  );
};

const BoardSVG = ({ layout, title = 'Optimizado', scale = 3 }) => {
  if (!layout) return null;

  console.log('Rearranged layout:', layout);

  const PAD = 20;                     // Padding para que quepan textos fuera del tablero

  const boardW = layout.sheetW / scale;
  const boardH = layout.sheetH / scale;
  const viewW  = boardW + PAD * 2;
  const viewH  = boardH + PAD * 2;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        width={viewW}
        height={viewH}
        className="border border-gray-700"
      >
        {/* Definición de flecha para cortes */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L6,3 z" fill="red" />
          </marker>
        </defs>
        <g transform={`translate(${PAD}, ${PAD})`}>
        {/* Marco del tablero */}
        <rect
          width={boardW}
          height={boardH}
          fill="transparent"
          stroke="#000"
          strokeWidth={0.5}
        />

        {/* Dimensiones */}
        <text
          x={boardW / 2}
          y={-PAD / 2}
          textAnchor="middle"
          fontSize="10"
          fill="red"
          fontWeight="700"
        >
          {layout.sheetW}
        </text>
        {/* Dimensión vertical (alto) */}
        <text
          transform={`translate(${-PAD / 2}, ${boardH / 2}) rotate(-90)`}
          x="0"
          y="0"
          textAnchor="middle"
          fontSize="10"
          fill="red"
          fontWeight="700"
        >
          {layout.sheetH}
        </text>

        {/* Piezas */}
        {layout.part.map((p, idx) => (
          <Piece key={idx} p={p} scale={scale} />
        ))}

        {/* Secuencia de cortes (ignoramos refilados) */}
        {layout.cuts && layout.cuts.filter((ct) => {
          const x1 = Number(ct.x1), x2 = Number(ct.x2);
          const y1 = Number(ct.y1), y2 = Number(ct.y2);
          const isHorizontal = Math.abs(y1 - y2) < EPS;
          const isVertical   = Math.abs(x1 - x2) < EPS;

          // Ref boundaries: y == 0 or y == sheetH, x == 0 or x == sheetW
          const isTop    = isHorizontal && y1 === 0;
          const isBottom = isHorizontal && y1 === Number(layout.sheetH);
          const isLeft   = isVertical   && x1 === 0;
          const isRight  = isVertical   && x1 === Number(layout.sheetW);

          return !(isTop || isBottom || isLeft || isRight);
        }).map((ct, i) => (
          <g key={`cut-${i}`}>
            <line
              x1={Number(ct.x1) / scale}
              y1={Number(ct.y1) / scale}
              x2={Number(ct.x2) / scale}
              y2={Number(ct.y2) / scale}
              stroke="red"
              strokeWidth={1}
              markerEnd="url(#arrowhead)"
            />
            {/* círculo numerado en inicio */}
            <circle
              cx={Number(ct.x1) / scale}
              cy={Number(ct.y1) / scale}
              r={4}
              fill="#fff"
              stroke="#000"
              strokeWidth={0.5}
            />
            <text
              x={Number(ct.x1) / scale}
              y={Number(ct.y1) / scale}
              fontSize="4"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {i + 1}
            </text>
          </g>
        ))}
        </g>
      </svg>
      <h4 className="font-semibold">{title}</h4>
    </div>
  );
};

/* ---------- Demo principal (solo optimizado) ---------- */
export default function LayoutsDemo() {
  const [opt, setOpt] = useState(null);

  useEffect(() => {
    setOpt(rearrangePlan(layouts));
  }, []);

  const optLayout = opt?.sPlanos?.[0]?.layout?.[0];

  return (
    <div className="w-full flex justify-center align-items-center p-4">
      <BoardSVG layout={optLayout} scale={3} />
    </div>
  );
}
