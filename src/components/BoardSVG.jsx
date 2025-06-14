const Piece = ({ p, scale }) => {
  const rot = p.rotated === "True";
  const w = rot ? Number(p.length) : Number(p.width);
  const h = rot ? Number(p.width) : Number(p.length);

  const x = Number(p.x) / scale;
  const y = Number(p.y) / scale;
  const wScaled = w / scale;
  const hScaled = h / scale;

  const fontSize = 8; // tamaño de texto interno
  const offset = 2; // margen entre texto y borde

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
        y={y + fontSize + offset + 4} // bajamos 4 px extra
        fontSize={fontSize}
        textAnchor="middle"
        fill="#000"
      >
        {w}
      </text>

      {/* Medida vertical (alto) rota 90° */}
      <text
        transform={`rotate(-90 ${x + offset + 4} ${y + hScaled / 2})`}
        x={x + offset + 4} // alejamos 4 px del borde
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

const BoardSVG = ({ layout, title = "Optimizado", scale = 3, eps }) => {
  if (!layout) return null;

  const PAD = 20; // Padding para que quepan textos fuera del tablero

  const boardW = layout.sheetW / scale;
  const boardH = layout.sheetH / scale;
  const viewW = boardW + PAD * 2;
  const viewH = boardH + PAD * 2;

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
          {layout.cuts &&
            layout.cuts
              .filter((ct) => {
                const x1 = Number(ct.x1),
                  x2 = Number(ct.x2);
                const y1 = Number(ct.y1),
                  y2 = Number(ct.y2);
                const isHorizontal = Math.abs(y1 - y2) < eps;
                const isVertical = Math.abs(x1 - x2) < eps;

                // Ref boundaries: y == 0 or y == sheetH, x == 0 or x == sheetW
                const isTop = isHorizontal && y1 === 0;
                const isBottom = isHorizontal && y1 === Number(layout.sheetH);
                const isLeft = isVertical && x1 === 0;
                const isRight = isVertical && x1 === Number(layout.sheetW);

                return !(isTop || isBottom || isLeft || isRight);
              })
              .map((ct, i) => (
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

export default BoardSVG;
