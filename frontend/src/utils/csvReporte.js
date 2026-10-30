function formatDinero(valor) {
  return Number(valor).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCantidad(valor) {
  const n = Number(valor);
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("es-GT", { maximumFractionDigits: 3 });
}

function textoCelda(valor, tipo) {
  if (valor == null || valor === "") return "";
  if (tipo === "dinero") return formatDinero(valor);
  if (tipo === "entero") return String(Math.round(Number(valor)));
  if (tipo === "cantidad") return formatCantidad(valor);
  return String(valor);
}

function celdaCsv(valor) {
  const texto = valor == null ? "" : String(valor);
  if (/[",\r\n]/.test(texto)) {
    return `"${texto.replaceAll('"', '""')}"`;
  }
  return texto;
}

function filaCompleta(texto, totalColumnas) {
  const celdas = [celdaCsv(texto)];
  for (let i = 1; i < totalColumnas; i += 1) celdas.push("");
  return celdas.join(",");
}

export function construirCsv({ titulo, detalle, columnas, filas }) {
  const lineas = [
    filaCompleta("Distribuidora La Reforma", columnas.length),
    filaCompleta(titulo || "", columnas.length),
    filaCompleta(detalle || "", columnas.length),
    "",
    columnas.map((columna) => celdaCsv(columna.titulo)).join(","),
  ];
  for (const fila of filas) {
    lineas.push(
      columnas
        .map((columna, indice) => celdaCsv(textoCelda(fila.celdas?.[indice], columna.tipo)))
        .join(",")
    );
  }
  return lineas.join("\r\n");
}

export function descargarReporteCsv({ nombre, titulo, detalle, columnas, filas }) {
  const csv = construirCsv({ titulo, detalle, columnas, filas });
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre.endsWith(".csv") ? nombre : `${nombre}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}
