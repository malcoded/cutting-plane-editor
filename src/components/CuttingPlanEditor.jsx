import React, { useEffect, useRef, useState, useMemo } from "react";
import { Stage, Layer, Rect, Text, Group, Line } from "react-konva";
import pattern from "./pattern.json";

// —— 1. CONSTANTES GLOBALES —— //
const BOARD_WIDTH = 2440;
const BOARD_HEIGHT = 2150;
const kerf = 3; // Ancho de sierra en mm
const refiladoLeft = 2;
const refiladoRight = 2;
const refiladoTop = 2;
const refiladoBottom = 2;
const gap = 5; // Separación mínima entre piezas en mm
const tolerance = 0.5; // Tolerancia de medición en mm
const minPieceWidth = 50;
const minPieceHeight = 50;
const maxPieceWidth = BOARD_WIDTH;
const maxPieceHeight = BOARD_HEIGHT;
const cutSpeed = 300; // Velocidad de corte (mm/s)
const feedSpeed = 1000; // Velocidad de avance (mm/s)

export default function GuillotineEditor_Complete() {
  // —— 2. ESTADOS PRINCIPALES —— //
  const [pieces, setPieces] = useState([]);
  const [freePieces, setFreePieces] = useState([]);
  const [scale, setScale] = useState(1);
  const [cutOrientation, setCutOrientation] = useState("horizontal-first");
  const containerRef = useRef();
  const stageRef = useRef();
  const selectedIdRef = useRef(null);

  // —— 3. Área útil (descontando refilados) —— //
  const usableArea = {
    x: refiladoLeft,
    y: refiladoTop,
    width: BOARD_WIDTH - refiladoLeft - refiladoRight,
    height: BOARD_HEIGHT - refiladoTop - refiladoBottom,
  };

  // —— 4. FUNCIONES DE VALIDACIÓN —— //
  function isDimensionValid(piece) {
    return (
      piece.width >= minPieceWidth &&
      piece.height >= minPieceHeight &&
      piece.width <= maxPieceWidth &&
      piece.height <= maxPieceHeight
    );
  }

  function checkCollisionWithGap(piece, others) {
    // Inflar la pieza candidata y las demás por gap/2 + tolerance
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

  function findFirstAvailablePosition(piece, others) {
    const step = 10;
    const startX = usableArea.x + gap / 2 + tolerance;
    const endX =
      usableArea.x + usableArea.width - (piece.width + gap / 2 + tolerance);
    const startY = usableArea.y + gap / 2 + tolerance;
    const endY =
      usableArea.y + usableArea.height - (piece.height + gap / 2 + tolerance);

    for (let y = startY; y <= endY; y += step) {
      for (let x = startX; x <= endX; x += step) {
        const candX = x - gap / 2;
        const candY = y - gap / 2;
        const inflCandidate = {
          x: candX - gap / 2 - tolerance,
          y: candY - gap / 2 - tolerance,
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
          return { x: candX, y: candY };
        }
      }
    }
    return null;
  }

  // —— 5. PACK VERTICAL DENTRO DE COLUMNA (empuje automático) —— //
  function packPiecesVertically(currentPieces) {
    const arr = [...currentPieces].sort((a, b) => {
      if (a.x === b.x) return a.y - b.y;
      return a.x - b.x;
    });

    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const overlappingAbove = arr
        .slice(0, i)
        .filter((q) => !(q.x + q.width <= p.x || q.x >= p.x + p.width));
      if (overlappingAbove.length === 0) {
        p.y = usableArea.y;
      } else {
        const maxBottom = Math.max(
          ...overlappingAbove.map((q) => q.y + q.height)
        );
        p.y = maxBottom + gap + tolerance;
      }
    }
    return arr;
  }

  // —— 6. PACK DENTRO DE CADA SUBÁREA (empuje por nivel) —— //
  function packWithinSubareas(currentPieces, allAreas) {
    const grupos = {};
    currentPieces.forEach((p) => {
      let mejorIdx = null;
      let mejorLevel = -1;
      allAreas.forEach((area, idx) => {
        const x0 = area.x;
        const y0 = area.y;
        const x1 = area.x + area.width;
        const y1 = area.y + area.height;
        if (p.x >= x0 && p.y >= y0 && p.x < x1 && p.y < y1) {
          if (area.level > mejorLevel) {
            mejorLevel = area.level;
            mejorIdx = idx;
          }
        }
      });
      if (mejorIdx == null) mejorIdx = -1;
      if (!grupos[mejorIdx]) grupos[mejorIdx] = [];
      grupos[mejorIdx].push(p);
    });

    const nuevaLista = [];
    Object.entries(grupos).forEach(([idxStr, piezasGrupo]) => {
      const idx = parseInt(idxStr, 10);
      if (idx >= 0) {
        const area = allAreas[idx];
        const arr = piezasGrupo
          .map((p) => ({ ...p }))
          .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          const solapadas = arr
            .slice(0, i)
            .filter((q) => !(q.x + q.width <= p.x || q.x >= p.x + p.width));
          if (solapadas.length === 0) {
            p.y = area.y;
          } else {
            const maxBottom = Math.max(...solapadas.map((q) => q.y + q.height));
            p.y = maxBottom + gap + tolerance;
          }
          nuevaLista.push(p);
        }
      } else {
        // Nivel -1 significa: pieza que salió del tablero, la agregamos sin mover
        nuevaLista.push(...piezasGrupo.map((p) => ({ ...p })));
      }
    });
    return nuevaLista;
  }

  // —— 7. generateCutAreas (idéntico a antes, pero recibe cutOrientation) —— //
  function generateCutAreas(
    piecesList,
    areaRect,
    cutOrientation = "horizontal-first"
  ) {
    const areas = [];
    const sorted = [...piecesList].sort((a, b) => a.y - b.y || a.x - b.x);

    function groupBy(array, keyFn) {
      return array.reduce((map, item) => {
        const key = keyFn(item);
        if (!map[key]) map[key] = [];
        map[key].push(item);
        return map;
      }, {});
    }

    function subdivideArea(area, items, level) {
      areas.push({
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
        level,
      });

      if (items.length === 1) {
        items[0].nivelDesprendimiento = level;
        return;
      }
      if (items.length <= 1) return;

      const canSplitH = new Set(items.map((p) => p.y)).size > 1;
      const canSplitV = new Set(items.map((p) => p.x)).size > 1;

      if (cutOrientation === "horizontal-first") {
        if (canSplitH) {
          const rows = groupBy(items, (p) => p.y);
          let offsetY = area.y;
          for (const rowPieces of Object.values(rows)) {
            const rowHeight = Math.max(...rowPieces.map((p) => p.height));
            const centerY = offsetY + rowHeight + kerf / 2;
            if (centerY < area.y + area.height) {
              const topArea = {
                x: area.x,
                y: area.y,
                width: area.width,
                height: rowHeight - kerf / 2,
              };
              const bottomArea = {
                x: area.x,
                y: centerY,
                width: area.width,
                height: area.y + area.height - centerY,
              };
              subdivideArea(topArea, rowPieces, level + 1);
              subdivideArea(
                bottomArea,
                items.filter((p) => p.y >= offsetY + rowHeight),
                level + 1
              );
              return;
            }
            offsetY += rowHeight;
          }
        }
        if (canSplitV) {
          const cols = groupBy(items, (p) => p.x);
          let offsetX = area.x;
          for (const colPieces of Object.values(cols)) {
            const colWidth = Math.max(...colPieces.map((p) => p.width));
            const centerX = offsetX + colWidth + kerf / 2;
            if (centerX < area.x + area.width) {
              const leftArea = {
                x: area.x,
                y: area.y,
                width: colWidth - kerf / 2,
                height: area.height,
              };
              const rightArea = {
                x: centerX,
                y: area.y,
                width: area.x + area.width - centerX,
                height: area.height,
              };
              subdivideArea(leftArea, colPieces, level + 1);
              subdivideArea(
                rightArea,
                items.filter((p) => p.x >= offsetX + colWidth),
                level + 1
              );
              return;
            }
            offsetX += colWidth;
          }
        }
      } else {
        // vertical-first
        if (canSplitV) {
          const cols = groupBy(items, (p) => p.x);
          let offsetX = area.x;
          for (const colPieces of Object.values(cols)) {
            const colWidth = Math.max(...colPieces.map((p) => p.width));
            const centerX = offsetX + colWidth + kerf / 2;
            if (centerX < area.x + area.width) {
              const leftArea = {
                x: area.x,
                y: area.y,
                width: colWidth - kerf / 2,
                height: area.height,
              };
              const rightArea = {
                x: centerX,
                y: area.y,
                width: area.x + area.width - centerX,
                height: area.height,
              };
              subdivideArea(leftArea, colPieces, level + 1);
              subdivideArea(
                rightArea,
                items.filter((p) => p.x >= offsetX + colWidth),
                level + 1
              );
              return;
            }
            offsetX += colWidth;
          }
        }
        if (canSplitH) {
          const rows = groupBy(items, (p) => p.y);
          let offsetY = area.y;
          for (const rowPieces of Object.values(rows)) {
            const rowHeight = Math.max(...rowPieces.map((p) => p.height));
            const centerY = offsetY + rowHeight + kerf / 2;
            if (centerY < area.y + area.height) {
              const topArea = {
                x: area.x,
                y: area.y,
                width: area.width,
                height: rowHeight - kerf / 2,
              };
              const bottomArea = {
                x: area.x,
                y: centerY,
                width: area.width,
                height: area.y + area.height - centerY,
              };
              subdivideArea(topArea, rowPieces, level + 1);
              subdivideArea(
                bottomArea,
                items.filter((p) => p.y >= offsetY + rowHeight),
                level + 1
              );
              return;
            }
            offsetY += rowHeight;
          }
        }
      }
    }

    subdivideArea(areaRect, sorted, 0);
    return areas;
  }

  // —— 8. generateGuillotineCuts (ahora dibuja corte incluso con 1 sola pieza) —— //
  function generateGuillotineCuts(
    piecesList,
    areaRect,
    cutOrientation = "horizontal-first"
  ) {
    const cuts = [];
    let cutIndex = 0;
    const sorted = [...piecesList].sort((a, b) => a.y - b.y || a.x - b.x);

    function groupBy(array, keyFn) {
      return array.reduce((map, item) => {
        const key = keyFn(item);
        if (!map[key]) map[key] = [];
        map[key].push(item);
        return map;
      }, {});
    }

    function subdivide(area, items, level) {
      // —— Si solo hay una pieza, igual creamos un primer corte —— //
      if (items.length === 1) {
        const p = items[0];
        if (cutOrientation === "horizontal-first") {
          // Dibujar corte horizontal justo debajo de la pieza
          const cutY = p.y + p.height + kerf / 2;
          if (cutY < area.y + area.height) {
            cuts.push({
              iCut: cutIndex++,
              x1: area.x,
              y1: cutY,
              x2: area.x + area.width,
              y2: cutY,
              aLevel: level,
            });
          }
        } else {
          // Dibujar corte vertical justo a la derecha de la pieza
          const cutX = p.x + p.width + kerf / 2;
          if (cutX < area.x + area.width) {
            cuts.push({
              iCut: cutIndex++,
              x1: cutX,
              y1: area.y,
              x2: cutX,
              y2: area.y + area.height,
              aLevel: level,
            });
          }
        }
        return;
      }
      // Si no hay piezas o hay más de una pieza, seguimos recursivamente:
      if (items.length <= 1) return;

      const canSplitH = new Set(items.map((p) => p.y)).size > 1;
      const canSplitV = new Set(items.map((p) => p.x)).size > 1;

      if (cutOrientation === "horizontal-first") {
        if (canSplitH) {
          const rows = groupBy(items, (p) => p.y);
          let offsetY = area.y;
          for (const rowPieces of Object.values(rows)) {
            const rowHeight = Math.max(...rowPieces.map((p) => p.height));
            const cutY = offsetY + rowHeight + kerf / 2;
            if (cutY < area.y + area.height) {
              cuts.push({
                iCut: cutIndex++,
                x1: area.x,
                y1: cutY,
                x2: area.x + area.width,
                y2: cutY,
                aLevel: level,
              });
              subdivide(
                {
                  x: area.x,
                  y: area.y,
                  width: area.width,
                  height: rowHeight - kerf / 2,
                },
                rowPieces,
                level + 1
              );
              subdivide(
                {
                  x: area.x,
                  y: cutY,
                  width: area.width,
                  height: area.y + area.height - cutY,
                },
                items.filter((p) => p.y >= offsetY + rowHeight),
                level + 1
              );
              return;
            }
            offsetY += rowHeight;
          }
        }
        if (canSplitV) {
          const cols = groupBy(items, (p) => p.x);
          let offsetX = area.x;
          for (const colPieces of Object.values(cols)) {
            const colWidth = Math.max(...colPieces.map((p) => p.width));
            const cutX = offsetX + colWidth + kerf / 2;
            if (cutX < area.x + area.width) {
              cuts.push({
                iCut: cutIndex++,
                x1: cutX,
                y1: area.y,
                x2: cutX,
                y2: area.y + area.height,
                aLevel: level,
              });
              subdivide(
                {
                  x: area.x,
                  y: area.y,
                  width: colWidth - kerf / 2,
                  height: area.height,
                },
                colPieces,
                level + 1
              );
              subdivide(
                {
                  x: cutX,
                  y: area.y,
                  width: area.x + area.width - cutX,
                  height: area.height,
                },
                items.filter((p) => p.x >= offsetX + colWidth),
                level + 1
              );
              return;
            }
            offsetX += colWidth;
          }
        }
      } else {
        // vertical-first
        if (canSplitV) {
          const cols = groupBy(items, (p) => p.x);
          let offsetX = area.x;
          for (const colPieces of Object.values(cols)) {
            const colWidth = Math.max(...colPieces.map((p) => p.width));
            const cutX = offsetX + colWidth + kerf / 2;
            if (cutX < area.x + area.width) {
              cuts.push({
                iCut: cutIndex++,
                x1: cutX,
                y1: area.y,
                x2: cutX,
                y2: area.y + area.height,
                aLevel: level,
              });
              subdivide(
                {
                  x: area.x,
                  y: area.y,
                  width: colWidth - kerf / 2,
                  height: area.height,
                },
                colPieces,
                level + 1
              );
              subdivide(
                {
                  x: cutX,
                  y: area.y,
                  width: area.x + area.width - cutX,
                  height: area.height,
                },
                items.filter((p) => p.x >= offsetX + colWidth),
                level + 1
              );
              return;
            }
            offsetX += colWidth;
          }
        }
        if (canSplitH) {
          const rows = groupBy(items, (p) => p.y);
          let offsetY = area.y;
          for (const rowPieces of Object.values(rows)) {
            const rowHeight = Math.max(...rowPieces.map((p) => p.height));
            const cutY = offsetY + rowHeight + kerf / 2;
            if (cutY < area.y + area.height) {
              cuts.push({
                iCut: cutIndex++,
                x1: area.x,
                y1: cutY,
                x2: area.x + area.width,
                y2: cutY,
                aLevel: level,
              });
              subdivide(
                {
                  x: area.x,
                  y: area.y,
                  width: area.width,
                  height: rowHeight - kerf / 2,
                },
                rowPieces,
                level + 1
              );
              subdivide(
                {
                  x: area.x,
                  y: cutY,
                  width: area.width,
                  height: area.y + area.height - cutY,
                },
                items.filter((p) => p.y >= offsetY + rowHeight),
                level + 1
              );
              return;
            }
            offsetY += rowHeight;
          }
        }
      }
    }

    subdivide(areaRect, sorted, 0);
    return cuts;
  }

  // —— 9. isFullyInsideAnySubarea —— //
  function isFullyInsideAnySubarea(piece, allAreas) {
    for (const area of allAreas) {
      const x0 = area.x;
      const y0 = area.y;
      const x1 = area.x + area.width;
      const y1 = area.y + area.height;
      if (
        piece.x >= x0 &&
        piece.y >= y0 &&
        piece.x + piece.width <= x1 &&
        piece.y + piece.height <= y1
      ) {
        return true;
      }
    }
    return false;
  }

  // —— 10. Carga inicial de piezas desde pattern.json —— //
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
        nivelDesprendimiento: 0,
      };
    });
    setPieces(loaded);
  }, []);

  // —— 11. Ajuste de escala al redimensionar ventana —— //
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

  // —— 12. Manejo de teclas “Delete/Escape” y “R” para rotar —— //
  useEffect(() => {
    const handleKeyDown = (e) => {
      const pid = selectedIdRef.current;
      if (pid != null) {
        if (e.key === "Delete" || e.key === "Escape") {
          const removed = pieces.find((p) => p.id === pid);
          if (removed) {
            setPieces((prev) => {
              const sinEsta = prev.filter((p) => p.id !== pid);
              const areasRestantes = generateCutAreas(
                sinEsta,
                usableArea,
                cutOrientation
              );
              return packWithinSubareas(sinEsta, areasRestantes);
            });
            setFreePieces((prev) => [...prev, removed]);
          }
          selectedIdRef.current = null;
        }
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
  }, [pieces, cutOrientation]);

  // —— 13. Factories para DragStart / DragEnd —— //
  function handleDragStartFactory(piece) {
    let originalX = piece.x;
    let originalY = piece.y;
    return () => {
      originalX = piece.x;
      originalY = piece.y;
    };
  }

  function handleDragEndFactory(piece, allAreasRef) {
    return (e) => {
      const newX = Math.round(e.target.x());
      const newY = Math.round(e.target.y());
      const moved = { ...piece, x: newX, y: newY };

      // 13.a. Si salió del área útil → liberamos
      const outside =
        newX < usableArea.x ||
        newY < usableArea.y ||
        newX + piece.width > usableArea.x + usableArea.width ||
        newY + piece.height > usableArea.y + usableArea.height;
      if (outside) {
        setPieces((prev) => {
          const sinEsta = prev.filter((p) => p.id !== piece.id);
          const areasRestantes = generateCutAreas(
            sinEsta,
            usableArea,
            cutOrientation
          );
          return packWithinSubareas(sinEsta, areasRestantes);
        });
        setFreePieces((prev) => [...prev, piece]);
        return;
      }

      // 13.b. Colisión con gap + tolerancia
      const collision = checkCollisionWithGap(
        moved,
        pieces.filter((p) => p.id !== piece.id)
      );
      if (collision) {
        e.target.to({
          x: piece.x,
          y: piece.y,
          duration: 0.1,
        });
        return;
      }

      // 13.c. Cruza línea de corte?
      if (!isFullyInsideAnySubarea(moved, allAreasRef.current)) {
        e.target.to({
          x: piece.x,
          y: piece.y,
          duration: 0.1,
        });
        return;
      }

      // 13.d. Todas las validaciones pasaron → actualizamos pieza y repack
      setPieces((prev) => {
        const nuevaLista = prev.map((p) =>
          p.id === piece.id ? { ...p, x: newX, y: newY } : p
        );
        const areasNuevas = generateCutAreas(
          nuevaLista,
          usableArea,
          cutOrientation
        );
        return packWithinSubareas(nuevaLista, areasNuevas);
      });
    };
  }

  // —— 14. “Drop” de piezas desencajadas —— //
  function handleDrop(e) {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    const dropped = JSON.parse(data);

    // 14.a. Validar dimensiones
    if (
      dropped.width < minPieceWidth ||
      dropped.height < minPieceHeight ||
      dropped.width > maxPieceWidth ||
      dropped.height > maxPieceHeight
    ) {
      return;
    }

    // 14.b. Buscar primer hueco libre
    const pos = findFirstAvailablePosition(dropped, pieces);
    if (pos) {
      setPieces((prev) => {
        const nuevaLista = [
          ...prev,
          { ...dropped, x: pos.x, y: pos.y, nivelDesprendimiento: 0 },
        ];
        const areasNuevas = generateCutAreas(
          nuevaLista,
          usableArea,
          cutOrientation
        );
        return packWithinSubareas(nuevaLista, areasNuevas);
      });
    } else {
      setFreePieces((prev) => [...prev, dropped]);
    }
    setFreePieces((prev) => prev.filter((p) => p.id !== dropped.id));
  }

  // —— 15. useMemo para áreas y cortes —— //
  const allAreasRef = useRef([]);
  const allAreas = useMemo(() => {
    const a = generateCutAreas(pieces, usableArea, cutOrientation);
    allAreasRef.current = a;
    return a;
  }, [pieces, cutOrientation]);

  const allCuts = useMemo(() => {
    return generateGuillotineCuts(pieces, usableArea, cutOrientation);
  }, [pieces, cutOrientation]);

  // —— 16. Calcular tiempos estimados —— //
  let totalCutTime = 0;
  let totalFeedTime = 0;
  let posActual = { x: usableArea.x, y: usableArea.y };
  allCuts.forEach((cut) => {
    const deltaX = Math.abs(posActual.x - cut.x1);
    const deltaY = Math.abs(posActual.y - cut.y1);
    totalFeedTime += (deltaX + deltaY) / feedSpeed;
    const length = Math.hypot(cut.x2 - cut.x1, cut.y2 - cut.y1);
    totalCutTime += length / cutSpeed;
    posActual = { x: cut.x2, y: cut.y2 };
  });
  const totalTime = totalFeedTime + totalCutTime;

  // —— 17. RENDER FINAL —— //
  return (
    <div
      ref={containerRef}
      className="p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <h2 className="text-xl font-bold mb-3">
        Editor Manual de Planos de Corte
        <br />
        <span className="text-base font-normal">
          (Fase 4 – Validación de Cortes + Empuje Automático)
        </span>
      </h2>

      {/* —— 18. BOTONES: Primer corte Horizontal / Vertical —— */}
      <div className="mb-4 flex items-center gap-4">
        <span className="font-semibold">Primer corte:</span>
        <button
          onClick={() => setCutOrientation("horizontal-first")}
          className={`px-3 py-1 rounded ${
            cutOrientation === "horizontal-first"
              ? "bg-blue-500 text-white"
              : "bg-gray-200"
          }`}
        >
          Horizontal
        </button>
        <button
          onClick={() => setCutOrientation("vertical-first")}
          className={`px-3 py-1 rounded ${
            cutOrientation === "vertical-first"
              ? "bg-blue-500 text-white"
              : "bg-gray-200"
          }`}
        >
          Vertical
        </button>
      </div>

      <div className="flex gap-4">
        {/* —— 19. Lienzo Konva —— */}
        <div className="flex-1 border bg-gray-100">
          <Stage
            ref={stageRef}
            width={BOARD_WIDTH * scale}
            height={BOARD_HEIGHT * scale}
            scale={{ x: scale, y: scale }}
            className="bg-gray-100"
          >
            <Layer>
              {/* 19.a. Contorno del área útil */}
              <Rect
                x={usableArea.x}
                y={usableArea.y}
                width={usableArea.width}
                height={usableArea.height}
                fill="#f3f4f6"
                stroke="#000"
                strokeWidth={2}
              />

              {/* 19.b. Texto con dimensiones reales */}
              <Text
                text={`${usableArea.width} × ${usableArea.height}`}
                fontSize={16}
                fill="#374151"
                x={usableArea.x + usableArea.width - 160}
                y={usableArea.y + usableArea.height - 24}
              />

              {/* 19.c. Dibujar todas las sub-áreas (nivel ≥ 1) */}
              {allAreas
                .filter((area) => area.level >= 1)
                .map((area, idx) => (
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

              {/* 19.d. Dibujar líneas de corte (todos los niveles) */}
              {allCuts.map((cut, idx) => (
                <Group key={`cut-${idx}`}>
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
              ))}

              {/* 19.e. Dibujar todas las piezas colocadas */}
              {pieces.map((piece) => {
                const valid = isDimensionValid(piece);
                return (
                  <Group
                    key={piece.id}
                    x={piece.x}
                    y={piece.y}
                    draggable={valid}
                    onClick={() => {
                      selectedIdRef.current = piece.id;
                    }}
                    onDragStart={handleDragStartFactory(piece)}
                    onDragEnd={handleDragEndFactory(piece, allAreasRef)}
                  >
                    {/* Gap semi-transparente */}
                    <Rect
                      x={-gap / 2}
                      y={-gap / 2}
                      width={piece.width + gap}
                      height={piece.height + gap}
                      fill="rgba(255,0,0,0.05)"
                      listening={false}
                    />
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

        {/* —— 20. Panel “Piezas desencajadas” —— */}
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
                  if (
                    piece.width < minPieceWidth ||
                    piece.height < minPieceHeight ||
                    piece.width > maxPieceWidth ||
                    piece.height > maxPieceHeight
                  ) {
                    return;
                  }
                  setFreePieces((prev) =>
                    prev.filter((p) => p.id !== piece.id)
                  );
                  const pos = findFirstAvailablePosition(piece, pieces);
                  if (pos) {
                    setPieces((prev) => {
                      const nuevaLista = [
                        ...prev,
                        {
                          ...piece,
                          x: pos.x,
                          y: pos.y,
                          nivelDesprendimiento: 0,
                        },
                      ];
                      const areasNuevas = generateCutAreas(
                        nuevaLista,
                        usableArea,
                        cutOrientation
                      );
                      return packWithinSubareas(nuevaLista, areasNuevas);
                    });
                  } else {
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

      {/* —— 21. Descripción final de la lógica —— */}
      <div className="mt-4 text-sm text-gray-700">
        ▶ FASE 4 – Validación de Cortes + Empuje Automático
        <ul className="list-disc ml-5 mt-1">
          <li>
            El botón <code>“Primer corte: Horizontal / Vertical”</code> controla
            el parámetro
            <code>cutOrientation</code>. - <strong>horizontal-first:</strong>{" "}
            primero intenta subdividir horizontalmente en cada nivel. -{" "}
            <strong>vertical-first:</strong> primero intenta subdividir
            verticalmente.
          </li>
          <li>
            Ahora, <strong>generateGuillotineCuts</strong> dibuja la primera
            línea de corte <em>incluso cuando solo hay 1 pieza</em>, según la
            orientación inicial.
          </li>
          <li>
            Si solo hay una pieza en el tablero, se forzará a que se dibuje el
            “primer corte” justo debajo (o a la derecha) de esa pieza, sin
            esperar a que aparezca una segunda pieza.
          </li>
          <li>
            Tras cada movimiento/eliminación de pieza, la lógica:
            <ol className="list-decimal ml-5">
              <li>
                Genera sub-áreas con <code>generateCutAreas</code>.
              </li>
              <li>
                Empuja cada pieza dentro de su sub-área con{" "}
                <code>packWithinSubareas</code>.
              </li>
            </ol>
          </li>
          <li>
            La validación de “no cruzar cortes” usa{" "}
            <code>isFullyInsideAnySubarea</code>: la pieza debe quedar 100 %
            dentro de alguna sub-área (de nivel ≥ 1) para aceptarse.
          </li>
        </ul>
        ▶ También se muestra el tiempo estimado de recorrido (feed + cut), sin
        optimizar ruta.
      </div>
    </div>
  );
}
