import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "../layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import { getDashboard } from "../api/client";

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  });
}

function formatCantidad(value) {
  const n = Number(value || 0);
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("es-GT", { maximumFractionDigits: 3 });
}

function etiquetaDia(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia)).toLocaleDateString("es-GT", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function etiquetaMes(iso) {
  const [anio, mes] = iso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString("es-GT", {
    month: "short",
    timeZone: "UTC",
  });
}

function indicesEtiqueta(total) {
  if (total <= 1) return [0];
  if (total <= 8) return Array.from({ length: total }, (_, indice) => indice);
  const marcas = total <= 16 ? 6 : 5;
  const indices = [];
  for (let i = 0; i < marcas; i += 1) {
    indices.push(Math.round((i * (total - 1)) / (marcas - 1)));
  }
  return [...new Set(indices)];
}

function escala(max) {
  const rough = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const fraccion = rough / pow;
  const nice = fraccion <= 1 ? 1 : fraccion <= 2 ? 2 : fraccion <= 5 ? 5 : 10;
  const step = nice * pow;
  const top = Math.ceil(max / step - 1e-9) * step;
  const marcas = [];
  for (let valor = 0; valor <= top + step * 0.01; valor += step) {
    marcas.push(Math.round(valor * 100) / 100);
  }
  return { top, marcas };
}

function textoEje(valor) {
  if (valor >= 1000) {
    const miles = valor / 1000;
    return Number.isInteger(miles) ? `${miles}k` : `${miles.toFixed(1)}k`;
  }
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(0);
}

function GraficaLineas({ puntos, vacio, etiqueta, aria }) {
  const hayVentas = puntos.some((punto) => punto.total > 0);
  if (!hayVentas) {
    return <p className="dash-vacio">{vacio}</p>;
  }

  const width = 640;
  const height = 220;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(...puntos.map((punto) => punto.total));
  const { top, marcas } = escala(max);
  const x = (indice) =>
    puntos.length === 1 ? pad.l + innerW / 2 : pad.l + (indice / (puntos.length - 1)) * innerW;
  const y = (valor) => pad.t + innerH - (valor / top) * innerH;
  const linea = puntos
    .map((punto, indice) => `${indice === 0 ? "M" : "L"} ${x(indice).toFixed(1)} ${y(punto.total).toFixed(1)}`)
    .join(" ");
  const area = `${linea} L ${x(puntos.length - 1).toFixed(1)} ${(pad.t + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(pad.t + innerH).toFixed(1)} Z`;
  const texto = etiqueta === "mes" ? etiquetaMes : etiquetaDia;
  const etiquetas = indicesEtiqueta(puntos.length);

  return (
    <svg className="dash-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria}>
      {marcas.map((marca) => (
        <g key={marca}>
          <line
            x1={pad.l}
            x2={width - pad.r}
            y1={y(marca)}
            y2={y(marca)}
            className="dash-line__grid"
          />
          <text x={pad.l - 8} y={y(marca) + 4} className="dash-line__tick" textAnchor="end">
            {textoEje(marca)}
          </text>
        </g>
      ))}
      <path d={area} className="dash-line__area" />
      <path d={linea} className="dash-line__stroke" />
      {puntos.map((punto, indice) =>
        punto.total > 0 ? (
          <circle key={punto.fecha} cx={x(indice)} cy={y(punto.total)} r="3.5" className="dash-line__dot">
            <title>{`${texto(punto.fecha)}: ${formatMoney(punto.total)}`}</title>
          </circle>
        ) : null
      )}
      {etiquetas.map((indice) => (
        <text
          key={puntos[indice].fecha}
          x={x(indice)}
          y={height - 6}
          className="dash-line__tick"
          textAnchor="middle"
        >
          {texto(puntos[indice].fecha)}
        </text>
      ))}
    </svg>
  );
}

function GraficaBarras({ productos }) {
  if (!productos.length) {
    return <p className="dash-vacio">Todavía no hay productos vendidos.</p>;
  }
  const max = Math.max(...productos.map((producto) => producto.cantidad));
  return (
    <ul className="dash-bars">
      {productos.map((producto) => (
        <li key={producto.id}>
          <div className="dash-bars__meta">
            <span className="dash-bars__nombre" title={producto.nombre}>
              {producto.nombre}
            </span>
            <span className="dash-bars__cantidad">{formatCantidad(producto.cantidad)}</span>
          </div>
          <div className="dash-bars__track" aria-hidden="true">
            <div
              className="dash-bars__fill"
              style={{ width: `${max > 0 ? (producto.cantidad / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const VISTAS_VENTA = [
  {
    id: "30",
    boton: "30 días",
    titulo: "Ventas por día",
    texto: "Últimos 30 días.",
    campo: "ventasPorDia",
    vacio: "Todavía no hay ventas en los últimos 30 días.",
    etiqueta: "dia",
  },
  {
    id: "mes",
    boton: "Este mes",
    titulo: "Ventas del mes",
    texto: "Día por día, en el mes en curso.",
    campo: "ventasDelMes",
    vacio: "Todavía no hay ventas en este mes.",
    etiqueta: "dia",
  },
  {
    id: "anio",
    boton: "Por mes",
    titulo: "Ventas por mes",
    texto: "Últimos 12 meses.",
    campo: "ventasPorMes",
    vacio: "Todavía no hay ventas en los últimos 12 meses.",
    etiqueta: "mes",
  },
];

export default function MenuPage() {
  const { usuario } = useAuth();
  const [datos, setDatos] = useState(null);
  const [vistaId, setVistaId] = useState("30");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const nombre = usuario?.nombreCompleto?.split(" ")[0] || "usuario";
  const vista = VISTAS_VENTA.find((item) => item.id === vistaId) || VISTAS_VENTA[0];

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError("");
    getDashboard()
      .then((res) => {
        if (activo) setDatos(res.data);
      })
      .catch((err) => {
        if (activo) setError(err.message || "No se pudo cargar el tablero");
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  return (
    <AppShell
      title="Dashboard"
      subtitle={`Bienvenido, ${nombre}. Estos indicadores salen de los registros del sistema.`}
    >
      {loading ? (
        <div className="status-pending">
          <Loader2 className="spin" size={18} />
          Cargando el tablero…
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {datos ? (
        <>
          <section className="dash-kpis" aria-label="Indicadores">
            <article className="card dash-kpi">
              <p className="dash-kpi__label">Ventas del día</p>
              <p className="dash-kpi__value">{formatMoney(datos.ventasDia)}</p>
            </article>
            <article className="card dash-kpi">
              <p className="dash-kpi__label">Ventas del mes</p>
              <p className="dash-kpi__value">{formatMoney(datos.ventasMes)}</p>
            </article>
            <article className="card dash-kpi">
              <p className="dash-kpi__label">Pedidos pendientes de aprobación</p>
              <p className={`dash-kpi__value${datos.pedidosPendientes > 0 ? " dash-kpi__value--alerta" : ""}`}>
                {datos.pedidosPendientes}
              </p>
            </article>
            <article className="card dash-kpi">
              <p className="dash-kpi__label">Productos bajo el mínimo</p>
              <p className={`dash-kpi__value${datos.productosBajoMinimo > 0 ? " dash-kpi__value--alerta" : ""}`}>
                {datos.productosBajoMinimo}
              </p>
            </article>
            <article className="card dash-kpi">
              <p className="dash-kpi__label">Saldo por cobrar</p>
              <p className={`dash-kpi__value${datos.saldoPorCobrar > 0 ? " dash-kpi__value--alerta" : ""}`}>
                {formatMoney(datos.saldoPorCobrar)}
              </p>
            </article>
          </section>

          <section className="dash-charts">
            <article className="card">
              <h2 className="card-title">{vista.titulo}</h2>
              <p className="dash-chart__hint">{vista.texto}</p>
              <div className="reporte-elige" role="group" aria-label="Periodo de ventas">
                {VISTAS_VENTA.map((opcion) => (
                  <button
                    key={opcion.id}
                    type="button"
                    className={opcion.id === vista.id ? "is-active" : undefined}
                    onClick={() => setVistaId(opcion.id)}
                  >
                    {opcion.boton}
                  </button>
                ))}
              </div>
              <GraficaLineas
                puntos={datos[vista.campo] || []}
                vacio={vista.vacio}
                etiqueta={vista.etiqueta}
                aria={vista.titulo}
              />
            </article>
            <article className="card">
              <h2 className="card-title">Productos más vendidos</h2>
              <p className="card-text">Los cinco con más unidades vendidas.</p>
              <GraficaBarras productos={datos.productosMasVendidos || []} />
            </article>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
