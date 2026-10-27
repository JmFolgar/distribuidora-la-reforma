function xml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function borde(color = "#E5E7EB") {
  return `<Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
  </Borders>`;
}

function estilo({ id, fuente, fondo, alineacion, formato, bordeColor }) {
  const font = fuente
    ? `<Font ss:FontName="Calibri" ss:Size="${fuente.size || 11}" ss:Color="${fuente.color || "#1F2937"}" ss:Bold="${fuente.bold ? 1 : 0}"/>`
    : "";
  const interior = fondo
    ? `<Interior ss:Color="${fondo}" ss:Pattern="Solid"/>`
    : "";
  const align = `<Alignment ss:Vertical="Center" ss:Horizontal="${alineacion || "Left"}"/>`;
  const number = formato ? `<NumberFormat ss:Format="${formato}"/>` : "";
  const borders = bordeColor ? borde(bordeColor) : "";
  return `<Style ss:ID="${id}">${font}${interior}${align}${number}${borders}</Style>`;
}

const ESTILOS = [
  estilo({ id: "marca", fuente: { size: 18, color: "#4F46E5", bold: true } }),
  estilo({ id: "titulo", fuente: { size: 14, color: "#1F2937", bold: true } }),
  estilo({ id: "detalle", fuente: { size: 11, color: "#6B7280" } }),
  estilo({
    id: "encabezado",
    fuente: { size: 11, color: "#FFFFFF", bold: true },
    fondo: "#4F46E5",
    alineacion: "Center",
    bordeColor: "#4338CA",
  }),
  estilo({ id: "texto", fuente: { size: 11 }, bordeColor: "#E5E7EB" }),
  estilo({ id: "textoAlt", fuente: { size: 11 }, fondo: "#F7F8FA", bordeColor: "#E5E7EB" }),
  estilo({
    id: "numero",
    fuente: { size: 11 },
    alineacion: "Right",
    formato: "#,##0.00",
    bordeColor: "#E5E7EB",
  }),
  estilo({
    id: "numeroAlt",
    fuente: { size: 11 },
    fondo: "#F7F8FA",
    alineacion: "Right",
    formato: "#,##0.00",
    bordeColor: "#E5E7EB",
  }),
  estilo({
    id: "entero",
    fuente: { size: 11 },
    alineacion: "Right",
    formato: "0",
    bordeColor: "#E5E7EB",
  }),
  estilo({
    id: "enteroAlt",
    fuente: { size: 11 },
    fondo: "#F7F8FA",
    alineacion: "Right",
    formato: "0",
    bordeColor: "#E5E7EB",
  }),
  estilo({
    id: "cantidad",
    fuente: { size: 11 },
    alineacion: "Right",
    formato: "#,##0.###",
    bordeColor: "#E5E7EB",
  }),
  estilo({
    id: "cantidadAlt",
    fuente: { size: 11 },
    fondo: "#F7F8FA",
    alineacion: "Right",
    formato: "#,##0.###",
    bordeColor: "#E5E7EB",
  }),
  estilo({
    id: "subtotal",
    fuente: { size: 11, bold: true, color: "#4338CA" },
    fondo: "#EEF2FF",
    bordeColor: "#C7D2FE",
  }),
  estilo({
    id: "subtotalNum",
    fuente: { size: 11, bold: true, color: "#4338CA" },
    fondo: "#EEF2FF",
    alineacion: "Right",
    formato: "#,##0.00",
    bordeColor: "#C7D2FE",
  }),
  estilo({
    id: "total",
    fuente: { size: 12, bold: true, color: "#FFFFFF" },
    fondo: "#4F46E5",
    bordeColor: "#4338CA",
  }),
  estilo({
    id: "totalNum",
    fuente: { size: 12, bold: true, color: "#FFFFFF" },
    fondo: "#4F46E5",
    alineacion: "Right",
    formato: "#,##0.00",
    bordeColor: "#4338CA",
  }),
].join("");

function estiloCelda(fila, columna, alterna) {
  if (fila.tipo === "total") return columna.tipo === "texto" ? "total" : "totalNum";
  if (fila.tipo === "subtotal") return columna.tipo === "texto" ? "subtotal" : "subtotalNum";
  if (columna.tipo === "texto") return alterna ? "textoAlt" : "texto";
  if (columna.tipo === "entero") return alterna ? "enteroAlt" : "entero";
  if (columna.tipo === "cantidad") return alterna ? "cantidadAlt" : "cantidad";
  return alterna ? "numeroAlt" : "numero";
}

function celdaXml(valor, estiloId, tipo) {
  const esNumero = tipo !== "texto" && valor !== "" && valor != null && Number.isFinite(Number(valor));
  if (esNumero) {
    return `<Cell ss:StyleID="${estiloId}"><Data ss:Type="Number">${Number(valor)}</Data></Cell>`;
  }
  return `<Cell ss:StyleID="${estiloId}"><Data ss:Type="String">${xml(valor ?? "")}</Data></Cell>`;
}

export function descargarReporteExcel({ nombre, hoja, titulo, detalle, columnas, filas }) {
  const ancho = columnas.length - 1;
  const columnasXml = columnas
    .map((columna) => `<Column ss:Width="${columna.ancho || 110}"/>`)
    .join("");

  let datos = 0;
  const cuerpo = filas
    .map((fila) => {
      const alterna = fila.tipo === "dato" && datos % 2 === 1;
      if (fila.tipo === "dato") datos += 1;
      const celdas = columnas
        .map((columna, indice) =>
          celdaXml(fila.celdas[indice], estiloCelda(fila, columna, alterna), columna.tipo)
        )
        .join("");
      return `<Row ss:Height="${fila.tipo === "total" ? 24 : 20}">${celdas}</Row>`;
    })
    .join("");

  const libro = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>${ESTILOS}</Styles>
<Worksheet ss:Name="${xml(hoja)}">
<Table>
${columnasXml}
<Row ss:Height="26">
  <Cell ss:MergeAcross="${ancho}" ss:StyleID="marca"><Data ss:Type="String">Distribuidora La Reforma</Data></Cell>
</Row>
<Row ss:Height="22">
  <Cell ss:MergeAcross="${ancho}" ss:StyleID="titulo"><Data ss:Type="String">${xml(titulo)}</Data></Cell>
</Row>
<Row ss:Height="18">
  <Cell ss:MergeAcross="${ancho}" ss:StyleID="detalle"><Data ss:Type="String">${xml(detalle)}</Data></Cell>
</Row>
<Row ss:Height="10"/>
<Row ss:Height="22">
  ${columnas.map((columna) => `<Cell ss:StyleID="encabezado"><Data ss:Type="String">${xml(columna.titulo)}</Data></Cell>`).join("")}
</Row>
${cuerpo}
</Table>
</Worksheet>
</Workbook>`;

  const blob = new Blob([libro], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre.endsWith(".xls") ? nombre : `${nombre}.xls`;
  enlace.click();
  URL.revokeObjectURL(url);
}
