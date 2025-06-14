import { useState, useEffect } from "react";
import BoardSVG from "./BoardSVG";
import layouts from "./layouts.json";

// Constantes
const EPS = 1e-3; // tolerancia numérica
const SCALE = 3; // escala para el SVG

// Función para convertir valores a números, manejando cadenas y números
const _toNum = (v) => (typeof v === "string" ? parseFloat(v) : v);

// Renderiza las piezas en el plano optimizado
function RearrangePartsInPlan() {
  const [opt, setOpt] = useState(null);

  useEffect(() => {
    const clone = structuredClone(layouts);
    setOpt(clone);
  }, []);

  const optLayouts = opt?.sPlanos?.[0]?.layout || [];

  return (
    <div className="w-full flex flex-col items-center p-4 gap-6">
      {optLayouts.map((layout, index) => (
        <BoardSVG key={index} layout={layout} scale={SCALE} eps={EPS} />
      ))}
    </div>
  );
}

export default RearrangePartsInPlan;
