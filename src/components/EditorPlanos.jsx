import { useState, useEffect, useRef } from "react";
import { Stage, Layer, Rect, Line } from "react-konva";
import pattern from "./pattern.json";

/* ───────── Config ───────── */
const PRECISION_MM = 0.1;
const dimensionesTablero = { mmWidth: 2440, mmHeight: 2150 };
const traySeed = [{ id: "tpl-1", width: 100, height: 60, fill: "#ddd" }];
let idCounter = 1;

/* ───────── Árbol de regiones ───────── */
function crearArbolDeRegiones(tablero) {
  return {
    x: 0,
    y: 0,
    width: tablero.mmWidth,
    height: tablero.mmHeight,
    nivel: 0,
    occupied: false,
    children: [],
  };
}

function buscarRegionDisponible(region, pieza, direccion) {
  if (region.occupied) return null;

  if (region.children.length > 0) {
    for (const child of region.children) {
      const res = buscarRegionDisponible(child, pieza, direccion);
      if (res) return res;
    }
    return null;
  }

  const encaja =
    Math.abs(region.width - pieza.width) < PRECISION_MM &&
    Math.abs(region.height - pieza.height) < PRECISION_MM;

  return encaja ? region : null;
}

function dividirRegion(region, direccion, pieza) {
  region.occupied = true;
  let children = [];

  if (direccion === "horizontal") {
    const sobrante = region.height - pieza.height;
    if (sobrante > PRECISION_MM) {
      children.push({
        x: region.x,
        y: region.y + pieza.height,
        width: region.width,
        height: sobrante,
        nivel: region.nivel + 1,
        occupied: false,
        children: [],
      });
    }
  } else if (direccion === "vertical") {
    const sobrante = region.width - pieza.width;
    if (sobrante > PRECISION_MM) {
      children.push({
        x: region.x + pieza.width,
        y: region.y,
        width: sobrante,
        height: region.height,
        nivel: region.nivel + 1,
        occupied: false,
        children: [],
      });
    }
  }

  region.children = children;
}

/* ───────── Componente ───────── */
export default function EditorPlanos() {
  const [piezas, setPiezas] = useState([]);
  const [tray, setTray] = useState(traySeed);
  const [direccion, setDireccion] = useState("alternado");
  const [scale, setScale] = useState(0.3);
  const [regionTree, setRegionTree] = useState(() =>
    crearArbolDeRegiones(dimensionesTablero)
  );

  const lastValid = useRef({});
  const selectedId = useRef(null);

  const width = dimensionesTablero.mmWidth * scale;
  const height = dimensionesTablero.mmHeight * scale;

  useEffect(() => {
    const maxH = window.innerHeight - 220;
    setScale(Math.min(1, maxH / dimensionesTablero.mmHeight));
  }, []);

  useEffect(() => {
    const parts = pattern?.[0]?.layout?.[0]?.part ?? [];
    const rnd = () => `hsl(${Math.floor(Math.random() * 360)},65%,70%)`;

    const iniciales = parts.map((p) => {
      const rot = p.rotated === "True";
      const width = rot ? Number(p.length) : Number(p.width);
      const height = rot ? Number(p.width) : Number(p.length);
      return {
        id: `pieza-${idCounter++}`,
        x: Number(p.x),
        y: Number(p.y),
        width,
        height,
        rotada: rot,
        fill: rnd(),
        draggable: true,
      };
    });

    setPiezas(iniciales);

    const nuevoArbol = crearArbolDeRegiones(dimensionesTablero);

    for (const pieza of iniciales) {
      const dir =
        direccion === "alternado"
          ? (nuevoArbol.nivel ?? 0) % 2 === 0
            ? "horizontal"
            : "vertical"
          : direccion;

      const region = buscarRegionDisponible(nuevoArbol, pieza, dir);
      if (region) {
        dividirRegion(region, dir, pieza);
      }
    }

    setRegionTree(nuevoArbol);
  }, []);

  useEffect(() => {
    const escHandler = (e) => {
      if (e.key !== "Escape" || !selectedId.current) return;
      setPiezas((prev) => {
        const pieza = prev.find((p) => p.id === selectedId.current);
        if (!pieza) return prev;
        setTray((trayPrev) => [
          ...trayPrev,
          { ...pieza, id: `tray-${Date.now()}` },
        ]);
        return prev.filter((p) => p.id !== selectedId.current);
      });
      selectedId.current = null;
    };
    document.addEventListener("keydown", escHandler);
    return () => document.removeEventListener("keydown", escHandler);
  }, []);

  const mmRound = (v) => Math.round(v / PRECISION_MM) * PRECISION_MM;
  const collide = (a, b) =>
    !(
      a.x + a.w <= b.x ||
      b.x + b.w <= a.x ||
      a.y + a.h <= b.y ||
      b.y + b.h <= a.y
    );

  const handleDragStart = (e, id) => {
    selectedId.current = id;
    const p = piezas.find((x) => x.id === id);
    lastValid.current[id] = { x: p.x, y: p.y };
  };

  const handleDragMove = (e, id) => {
    const s = e.target;
    const pieza = piezas.find((x) => x.id === id);
    if (!pieza) return;

    const sw = pieza.width * scale;
    const sh = pieza.height * scale;

    const xPx = Math.max(-width * 0.25, Math.min(s.x(), width - sw + 10));
    const yPx = Math.max(-height * 0.25, Math.min(s.y(), height - sh + 10));
    s.position({ x: xPx, y: yPx });

    const xMm = mmRound(xPx / scale);
    const yMm = mmRound(yPx / scale);
    const hayChoque = piezas
      .filter((p) => p.id !== id)
      .some((o) =>
        collide({ x: xMm, y: yMm, w: pieza.width, h: pieza.height }, o)
      );

    s.stroke(hayChoque ? "#e63946" : "#333");
    if (!hayChoque) lastValid.current[id] = { x: xMm, y: yMm };
  };

  const handleDragEnd = (e, id) => {
    const s = e.target;
    const pieza = piezas.find((x) => x.id === id);
    if (!pieza) return;
    selectedId.current = null;

    const sw = pieza.width * scale;
    const sh = pieza.height * scale;
    const { x: xPx, y: yPx } = s.position();
    const xMm = mmRound(xPx / scale);
    const yMm = mmRound(yPx / scale);

    if (xPx + sw < 0 || yPx + sh < 0 || xPx > width || yPx > height) {
      setPiezas((prev) => prev.filter((p) => p.id !== id));
      setTray((prev) => [...prev, { ...pieza, id: `tray-${Date.now()}` }]);
      return;
    }

    const dir =
      direccion === "alternado"
        ? (regionTree.nivel ?? 0) % 2 === 0
          ? "horizontal"
          : "vertical"
        : direccion;

    const piezaVirtual = { width: pieza.width, height: pieza.height };
    const region = buscarRegionDisponible(regionTree, piezaVirtual, dir);

    if (region) {
      dividirRegion(region, dir, piezaVirtual);
      const nuevaX = region.x;
      const nuevaY = region.y;
      s.position({ x: nuevaX * scale, y: nuevaY * scale });
      setPiezas((prev) =>
        prev.map((p) => (p.id === id ? { ...p, x: nuevaX, y: nuevaY } : p))
      );
      setRegionTree({ ...regionTree });
      s.stroke("#333");
      return;
    }

    const prev = lastValid.current[id];
    s.position({ x: prev.x * scale, y: prev.y * scale });
    setPiezas((prevList) =>
      prevList.map((p) => (p.id === id ? { ...p, x: prev.x, y: prev.y } : p))
    );
  };

  const rotar = (id) =>
    setPiezas((ps) =>
      ps.map((p) =>
        p.id === id
          ? { ...p, width: p.height, height: p.width, rotada: !p.rotada }
          : p
      )
    );

  const addFromTray = (item) => {
    setTray((t) => t.filter((x) => x.id !== item.id));
    setPiezas((prev) => [
      ...prev,
      { ...item, id: `pieza-${idCounter++}`, x: 10, y: 10, draggable: true },
    ]);
  };

  const grid = [];
  for (let i = 100; i < dimensionesTablero.mmWidth; i += 100)
    grid.push({ x1: i * scale, y1: 0, x2: i * scale, y2: height });
  for (let j = 100; j < dimensionesTablero.mmHeight; j += 100)
    grid.push({ x1: 0, y1: j * scale, x2: width, y2: j * scale });

  return (
    <div className="flex flex-col h-screen p-4 gap-4">
      <header>
        <h2 className="text-xl font-bold">🪚 Editor de Planos de Corte</h2>
      </header>

      <div className="flex gap-4 overflow-hidden">
        {/* Canvas */}
        <div>
          <Stage
            width={width}
            height={height}
            className="border rounded shadow bg-neutral-50"
          >
            <Layer>
              <Rect
                x={0}
                y={0}
                width={width}
                height={height}
                fill="#f9f9f9"
                stroke="#bbb"
              />
              {grid.map((l, i) => (
                <Line
                  key={i}
                  points={[l.x1, l.y1, l.x2, l.y2]}
                  stroke="#e2e8f0"
                  strokeWidth={0.5}
                />
              ))}
              {piezas.map((p) => (
                <Rect
                  key={p.id}
                  x={p.x * scale}
                  y={p.y * scale}
                  width={p.width * scale}
                  height={p.height * scale}
                  fill={p.fill}
                  stroke="#333"
                  strokeWidth={1}
                  draggable
                  onDragStart={(e) => handleDragStart(e, p.id)}
                  onDragMove={(e) => handleDragMove(e, p.id)}
                  onDragEnd={(e) => handleDragEnd(e, p.id)}
                  onDblClick={() => rotar(p.id)}
                />
              ))}
            </Layer>
          </Stage>

          {/* Selector de orientación */}
          <div className="mt-2 flex items-center gap-2 text-sm">
            Sentido del corte en el encaje:
            {["alternado", "horizontal", "vertical"].map((dir) => (
              <button
                key={dir}
                onClick={() => setDireccion(dir)}
                className={`px-3 py-1 rounded border transition ${
                  direccion === dir
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                }`}
              >
                {dir[0].toUpperCase() + dir.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Bandeja */}
        <aside className="flex-1 border border-dashed border-gray-400 p-4 rounded bg-white">
          <h3 className="font-semibold mb-2">📦 Piezas desencajadas</h3>
          <div className="flex flex-wrap gap-2">
            {tray.map((item) => (
              <button
                key={item.id}
                onClick={() => addFromTray(item)}
                className="border shadow-sm rounded w-[100px] h-[60px] flex items-center justify-center text-xs hover:bg-gray-100"
              >
                {item.width.toFixed(1)} × {item.height.toFixed(1)} mm
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
