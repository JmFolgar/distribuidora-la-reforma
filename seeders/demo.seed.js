/**
 * Datos de demostración para recorrer los flujos de la ferretería.
 * No modifica los usuarios ya definidos (jfolgar, lguevara, pquan, pinactivo).
 * Si el producto MART-16 ya existe, no vuelve a insertar nada.
 *
 * Uso: npm run db:seed:demo
 */
import "../backend/src/loadEnv.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../backend/src/db/index.js";
import {
  ferAprobacion,
  ferAuditoria,
  ferCategoria,
  ferCliente,
  ferCompra,
  ferDetalleCompra,
  ferDetalleDevolucion,
  ferDetallePedido,
  ferDetalleRecepcion,
  ferDetalleVenta,
  ferDevolucion,
  ferDireccion,
  ferEstadoPedido,
  ferHistorialPedido,
  ferInventario,
  ferMetodoPago,
  ferMovimientoInventario,
  ferMunicipio,
  ferPago,
  ferPedido,
  ferProducto,
  ferProveedor,
  ferRecepcion,
  ferSolicitudClave,
  ferUnidadMedida,
  ferUsuario,
  ferVenta,
} from "../backend/src/db/schema.js";

const MARCA = "MART-16";
const DIR_IMAGENES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../backend/uploads/productos"
);

const FOTOS = {
  "MART-16": "Stanley_graphite_claw_hammer.jpg",
  "CEM-50": "Lucky_Cement_Portland_Cement_Type1_50kg_20131030.jpg",
  "PIN-GAL": "Pote_de_pintura.jpeg",
  "CAB-12": "Electrical_wire.jpg",
  "PVC-12": "1_inch_PVc.jpg",
  "TOR-DW": "Drywall_screw.png",
  "CAS-01": "Yellow_hard_hat.jpg",
  "BRO-02": "White_Brush_on_a_paint_bucket.jpg",
  "CIN-AIS": "Electrical-tape_black.jpg",
  "GUA-CU": "Cowhide_leather_gloves_P1000226.jpg",
};

const NOMBRES = {
  "CAB-12": ["Cable eléctrico de cobre", "Cable de cobre con varios conductores."],
  "PVC-12": ["Tubo PVC de 1 pulgada", "Tubo de presión marcado como PVC de 1 pulgada."],
  "CAS-01": ["Casco de seguridad amarillo", "Casco tipo ingeniero, color amarillo."],
};

function gt(dia, hora = 9, minuto = 0) {
  const h = String(hora).padStart(2, "0");
  const m = String(minuto).padStart(2, "0");
  return new Date(`2026-10-${String(dia).padStart(2, "0")}T${h}:${m}:00-06:00`);
}

function money(valor) {
  return (Math.round(valor * 100) / 100).toFixed(2);
}

function urlFoto(archivo) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(archivo)}?width=720`;
}

function rutaLocal(codigo, extension) {
  return `/api/uploads/productos/demo-${codigo}.${extension}?v=2`;
}

async function guardarImagen(codigo) {
  const url = urlFoto(FOTOS[codigo]);
  const jpg = path.join(DIR_IMAGENES, `demo-${codigo}.jpg`);
  const png = path.join(DIR_IMAGENES, `demo-${codigo}.png`);
  fs.mkdirSync(DIR_IMAGENES, { recursive: true });
  try {
    const respuesta = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!respuesta.ok) throw new Error(String(respuesta.status));
    const bytes = Buffer.from(await respuesta.arrayBuffer());
    const esPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const esJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if ((!esPng && !esJpg) || bytes.length < 4000) throw new Error("archivo inválido");
    const extension = esPng ? "png" : "jpg";
    fs.writeFileSync(path.join(DIR_IMAGENES, `demo-${codigo}.${extension}`), bytes);
    if (extension === "png" && fs.existsSync(jpg)) fs.unlinkSync(jpg);
    if (extension === "jpg" && fs.existsSync(png)) fs.unlinkSync(png);
    return rutaLocal(codigo, extension);
  } catch (error) {
    console.warn(`  · imagen de ${codigo} no se descargó (${error.message}).`);
    if (fs.existsSync(png) && fs.statSync(png).size > 4000) return rutaLocal(codigo, "png");
    if (fs.existsSync(jpg) && fs.statSync(jpg).size > 4000) return rutaLocal(codigo, "jpg");
    return url.slice(0, 300);
  }
}

async function aplicarFotos() {
  for (const codigo of Object.keys(FOTOS)) {
    const imagen = await guardarImagen(codigo);
    const cambio = { imagen, fechaModificacion: new Date() };
    if (NOMBRES[codigo]) {
      cambio.nombre = NOMBRES[codigo][0];
      cambio.descripcion = NOMBRES[codigo][1];
    }
    await db.update(ferProducto).set(cambio).where(eq(ferProducto.codigo, codigo));
    await new Promise((resolver) => setTimeout(resolver, 800));
  }
}

async function requerirUsuario(correo) {
  const [usuario] = await db
    .select({ id: ferUsuario.id })
    .from(ferUsuario)
    .where(sql`LOWER(${ferUsuario.correo}) = ${correo}`)
    .limit(1);
  if (!usuario) {
    throw new Error(`Falta el usuario ${correo}. Ejecute primero el seeder de usuarios.`);
  }
  return usuario.id;
}

async function idCategoria(nombre) {
  const [fila] = await db
    .select({ id: ferCategoria.id })
    .from(ferCategoria)
    .where(eq(ferCategoria.nombre, nombre))
    .limit(1);
  if (!fila) throw new Error(`Falta la categoría ${nombre}.`);
  return fila.id;
}

async function idUnidad(codigo) {
  const [fila] = await db
    .select({ id: ferUnidadMedida.id })
    .from(ferUnidadMedida)
    .where(eq(ferUnidadMedida.codigo, codigo))
    .limit(1);
  if (!fila) throw new Error(`Falta la unidad ${codigo}.`);
  return fila.id;
}

async function estadosPedido(tx) {
  const filas = await tx.select().from(ferEstadoPedido);
  const mapa = Object.fromEntries(filas.map((fila) => [fila.codigo, fila.id]));
  for (const codigo of ["CREADO", "PENDIENTE_APROBACION", "APROBADO", "EN_PROCESO", "COMPLETADO", "CANCELADO"]) {
    if (!mapa[codigo]) throw new Error(`Falta el estado de pedido ${codigo}.`);
  }
  return mapa;
}

async function idMetodo(tx, codigo) {
  const [fila] = await tx
    .select({ id: ferMetodoPago.id })
    .from(ferMetodoPago)
    .where(eq(ferMetodoPago.codigo, codigo))
    .limit(1);
  if (!fila) throw new Error(`Falta el método de pago ${codigo}.`);
  return fila.id;
}

async function crearDireccion(tx, municipioId, datos) {
  const [fila] = await tx
    .insert(ferDireccion)
    .values({ idMunicipio: municipioId, ...datos })
    .returning({ id: ferDireccion.id });
  return fila.id;
}

async function historial(tx, pedidoId, usuarioId, anterior, nuevo, fecha, observacion) {
  await tx.insert(ferHistorialPedido).values({
    idPedido: pedidoId,
    idEstadoAnterior: anterior,
    idEstadoNuevo: nuevo,
    idUsuario: usuarioId,
    fechaCambio: fecha,
    observacion,
  });
}

async function auditar(tx, evento) {
  const valorNuevo = {};
  if (evento.registro) valorNuevo.registro = String(evento.registro);
  await tx.insert(ferAuditoria).values({
    idUsuario: evento.idUsuario,
    fechaEvento: evento.fecha,
    modulo: evento.modulo,
    accion: evento.accion,
    entidad: evento.entidad,
    idRegistro: evento.idRegistro,
    valorNuevo: Object.keys(valorNuevo).length ? valorNuevo : null,
    resultado: "EXITO",
    mensaje: evento.mensaje ?? null,
  });
}

async function mover(tx, producto, cambio) {
  const anterior = producto.stock;
  const nueva = anterior + cambio.delta;
  if (nueva < 0) throw new Error(`Existencia negativa en ${producto.codigo}`);
  const cantidad = Math.abs(cambio.delta);
  if (cantidad === 0) return;
  await tx.insert(ferMovimientoInventario).values({
    idInventario: producto.invId,
    idUsuario: cambio.usuarioId,
    tipoMovimiento: cambio.tipo,
    cantidad: String(cantidad),
    existenciaAnterior: String(anterior),
    existenciaNueva: String(nueva),
    fechaMovimiento: cambio.fecha,
    moduloOrigen: cambio.modulo,
    idRegistroOrigen: cambio.origenId,
    numeroDocumento: cambio.numero,
    motivo: cambio.motivo ?? null,
  });
  producto.version += 1;
  producto.stock = nueva;
  await tx
    .update(ferInventario)
    .set({
      existenciaActual: String(nueva),
      fechaUltimoMovimiento: cambio.fecha,
      version: producto.version,
    })
    .where(eq(ferInventario.id, producto.invId));
}

async function seed() {
  const [ya] = await db
    .select({ id: ferProducto.id })
    .from(ferProducto)
    .where(eq(ferProducto.codigo, MARCA))
    .limit(1);
  if (ya) {
    console.log("🖼  Actualizando fotos para que coincidan con cada producto…");
    await aplicarFotos();
    console.log("✅ Fotos actualizadas. Usuarios y movimientos sin cambios.");
    return;
  }

  const adminId = await requerirUsuario("jfolgar@gmail.com");
  const supervisorId = await requerirUsuario("lguevara@gmail.com");
  const operadorId = await requerirUsuario("pquan@gmail.com");

  const [municipio] = await db
    .select({ id: ferMunicipio.id })
    .from(ferMunicipio)
    .where(eq(ferMunicipio.codigo, "0101"))
    .limit(1);
  if (!municipio) {
    throw new Error("Falta el municipio Guatemala. Ejecute el seeder de ubicaciones.");
  }

  const categorias = {
    herramientas: await idCategoria("Herramientas"),
    materiales: await idCategoria("Materiales de construcción"),
    pinturas: await idCategoria("Pinturas y acabados"),
    electricidad: await idCategoria("Electricidad"),
    plomeria: await idCategoria("Plomería"),
    fijaciones: await idCategoria("Fijaciones"),
    seguridad: await idCategoria("Seguridad industrial"),
  };
  const unidades = {
    UNIDAD: await idUnidad("UNIDAD"),
    GALON: await idUnidad("GALON"),
    ROLLO: await idUnidad("ROLLO"),
    CAJA: await idUnidad("CAJA"),
  };

  console.log("🖼  Descargando imágenes de los productos…");
  const imagenes = {};
  for (const codigo of Object.keys(FOTOS)) {
    imagenes[codigo] = await guardarImagen(codigo);
  }

  await db.transaction(async (tx) => {
    const estado = await estadosPedido(tx);
    const efectivo = await idMetodo(tx, "EFECTIVO");
    const tarjeta = await idMetodo(tx, "TARJETA");
    const transferencia = await idMetodo(tx, "TRANSFERENCIA");

    async function cliente(datos) {
      const idDireccion = await crearDireccion(tx, municipio.id, datos.direccion);
      const [fila] = await tx
        .insert(ferCliente)
        .values({
          idDireccion,
          tipoPersona: datos.tipoPersona,
          nit: datos.nit,
          primerNombre: datos.primerNombre ?? null,
          primerApellido: datos.primerApellido ?? null,
          razonSocial: datos.razonSocial ?? null,
          correo: datos.correo,
          telefono: datos.telefono,
          estado: datos.estado,
          fechaCreacion: datos.fecha,
        })
        .returning({ id: ferCliente.id });
      await auditar(tx, {
        idUsuario: operadorId,
        fecha: datos.fecha,
        modulo: "CLIENTES",
        accion: "CREAR",
        entidad: "FER_CLIENTE",
        idRegistro: fila.id,
        mensaje: `Alta del cliente ${datos.razonSocial || datos.primerNombre}`,
      });
      return fila.id;
    }

    const ana = await cliente({
      tipoPersona: "INDIVIDUAL",
      nit: "3847291-K",
      primerNombre: "Ana Lucía",
      primerApellido: "López Méndez",
      correo: "ana.lopez@correo.com",
      telefono: "4213-8890",
      estado: "A",
      fecha: gt(2, 8, 40),
      direccion: {
        zona: "10",
        colonia: "Oakland",
        calle: "2a calle A",
        avenida: "15 avenida",
        numeroCasa: "12-45",
        referencia: "Casa de portón gris, frente al parque",
      },
    });
    const roble = await cliente({
      tipoPersona: "JURIDICA",
      nit: "7891234-5",
      razonSocial: "Constructora El Roble, S.A.",
      correo: "compras@elroble.com.gt",
      telefono: "2301-4470",
      estado: "A",
      fecha: gt(2, 9, 15),
      direccion: {
        zona: "4",
        colonia: "Centro histórico",
        calle: "6a calle",
        avenida: "7a avenida",
        numeroCasa: "4-22",
        referencia: "Edificio Roble, nivel 3",
      },
    });
    const miguel = await cliente({
      tipoPersona: "INDIVIDUAL",
      nit: "1928374-1",
      primerNombre: "Miguel Ángel",
      primerApellido: "Soto Ruiz",
      correo: "miguel.soto@correo.com",
      telefono: "5512-3344",
      estado: "I",
      fecha: gt(3, 11, 0),
      direccion: {
        zona: "7",
        colonia: "Bethania",
        calle: "3a calle",
        avenida: "Calzada San Juan",
        numeroCasa: "18-09",
        referencia: "Cliente dado de baja por falta de pago reiterada",
      },
    });
    const paz = await cliente({
      tipoPersona: "JURIDICA",
      nit: "5566778-9",
      razonSocial: "Taller Hermanos Paz",
      correo: "taller@hermanospaz.com",
      telefono: "2440-1188",
      estado: "A",
      fecha: gt(3, 15, 20),
      direccion: {
        zona: "11",
        colonia: "Miraflores",
        calle: "Avenida Las Américas",
        avenida: "22 calle",
        numeroCasa: "15-70",
        referencia: "Local 2, junto a la ferretería de la esquina",
      },
    });
    await cliente({
      tipoPersona: "JURIDICA",
      nit: "1029384-7",
      razonSocial: "Inversiones Los Pinos, S.A.",
      correo: "admin@lospinos.gt",
      telefono: "2360-2201",
      estado: "I",
      fecha: gt(4, 10, 5),
      direccion: {
        zona: "14",
        colonia: "El Carmen",
        calle: "1a calle",
        avenida: "15 avenida",
        numeroCasa: "8-11",
        referencia: "Cuenta inactiva desde septiembre",
      },
    });

    async function proveedor(datos) {
      const idDireccion = await crearDireccion(tx, municipio.id, datos.direccion);
      const [fila] = await tx
        .insert(ferProveedor)
        .values({
          idDireccion,
          nit: datos.nit,
          razonSocial: datos.razonSocial,
          nombreContacto: datos.contacto,
          correo: datos.correo,
          telefono: datos.telefono,
          estado: datos.estado,
          fechaCreacion: datos.fecha,
        })
        .returning({ id: ferProveedor.id });
      await auditar(tx, {
        idUsuario: supervisorId,
        fecha: datos.fecha,
        modulo: "PROVEEDORES",
        accion: "CREAR",
        entidad: "FER_PROVEEDOR",
        idRegistro: fila.id,
        mensaje: `Alta del proveedor ${datos.razonSocial}`,
      });
      return fila.id;
    }

    const centro = await proveedor({
      nit: "4455667-8",
      razonSocial: "Distribuidora Centroamericana, S.A.",
      contacto: "Rosa María Calderón",
      correo: "ventas@centroamericana.gt",
      telefono: "2320-1500",
      estado: "A",
      fecha: gt(1, 8, 30),
      direccion: {
        zona: "12",
        colonia: "Santa Elisa",
        calle: "Calzada Atanasio Tzul",
        avenida: "Avenida Petapa",
        numeroCasa: "52-10",
        referencia: "Bodega 4, parque industrial",
      },
    });
    const valle = await proveedor({
      nit: "6677889-0",
      razonSocial: "Pinturas del Valle, S.A.",
      contacto: "Carlos Humberto Véliz",
      correo: "pedidos@pinturasdelvalle.com",
      telefono: "7766-2104",
      estado: "A",
      fecha: gt(1, 9, 10),
      direccion: {
        zona: "9",
        colonia: "El Pedregal",
        calle: "3a calle",
        avenida: "6a avenida",
        numeroCasa: "9-18",
        referencia: "Planta de mezcla, ingreso por el portón azul",
      },
    });
    await proveedor({
      nit: "2233445-6",
      razonSocial: "Aceros del Sur",
      contacto: "Elena Juárez",
      correo: "contacto@acerosdelsur.gt",
      telefono: "7832-4410",
      estado: "I",
      fecha: gt(1, 16, 0),
      direccion: {
        zona: "21",
        colonia: "Nimajuyú",
        calle: "Calle Real",
        avenida: "Boulevard El Frutal",
        numeroCasa: "30-02",
        referencia: "Proveedor inactivo",
      },
    });

    const catalogo = [
      ["MART-16", "Martillo de uña 16 oz", "Mango de fibra, uña curva. Uso general de obra.", categorias.herramientas, unidades.UNIDAD, 28, 45, 8, "A"],
      ["CEM-50", "Cemento UGC 50 kg", "Saco de cemento gris para uso estructural.", categorias.materiales, unidades.UNIDAD, 62, 92, 20, "A"],
      ["PIN-GAL", "Pintura látex blanca 1 galón", "Látex interior, acabado mate.", categorias.pinturas, unidades.GALON, 78, 145, 12, "A"],
      ["CAB-12", "Cable eléctrico de cobre", "Cable de cobre con varios conductores.", categorias.electricidad, unidades.ROLLO, 185, 320, 6, "A"],
      ["PVC-12", "Tubo PVC de 1 pulgada", "Tubo de presión marcado como PVC de 1 pulgada.", categorias.plomeria, unidades.UNIDAD, 22, 48, 15, "A"],
      ["TOR-DW", "Tornillo drywall 1 pulgada", "Caja de 100 unidades, rosca fina.", categorias.fijaciones, unidades.CAJA, 18, 35, 10, "A"],
      ["CAS-01", "Casco de seguridad amarillo", "Casco tipo ingeniero, color amarillo.", categorias.seguridad, unidades.UNIDAD, 45, 85, 5, "A"],
      ["BRO-02", "Brocha de 2 pulgadas", "Cerdas de poliéster para látex.", categorias.pinturas, unidades.UNIDAD, 12, 28, 4, "A"],
      ["CIN-AIS", "Cinta aislante negra", "Rollo de 20 metros.", categorias.electricidad, unidades.UNIDAD, 8, 18, 8, "A"],
      ["GUA-CU", "Guantes de cuero", "Par para manejo de materiales.", categorias.seguridad, unidades.UNIDAD, 22, 40, 2, "I"],
    ];

    const productos = {};
    for (const item of catalogo) {
      const [codigo, nombre, descripcion, idCategoriaProd, idUnidadProd, compra, venta, minimo, estadoProd] = item;
      const [fila] = await tx
        .insert(ferProducto)
        .values({
          idCategoria: idCategoriaProd,
          idUnidadMedida: idUnidadProd,
          codigo,
          nombre,
          descripcion,
          imagen: imagenes[codigo],
          precioCompra: money(compra),
          precioVenta: money(venta),
          porcentajeImpuesto: "0.00",
          existenciaMinima: String(minimo),
          estado: estadoProd,
          fechaCreacion: gt(5, 8, 0),
          fechaModificacion: gt(5, 8, 0),
        })
        .returning({ id: ferProducto.id });
      const [inv] = await tx
        .insert(ferInventario)
        .values({
          idProducto: fila.id,
          existenciaActual: "0",
          cantidadReservada: "0",
          version: 0,
        })
        .returning({ id: ferInventario.id });
      productos[codigo] = {
        id: fila.id,
        codigo,
        invId: inv.id,
        stock: 0,
        version: 0,
        costo: compra,
        precio: venta,
      };
    }
    await auditar(tx, {
      idUsuario: adminId,
      fecha: gt(5, 8, 5),
      modulo: "PRODUCTOS",
      accion: "CREAR",
      entidad: "FER_PRODUCTO",
      idRegistro: productos["MART-16"].id,
      mensaje: "Carga inicial del catálogo de demostración",
    });

    async function compraRecibida({ numero, recepcion, proveedorId, fecha, lineas, observacion }) {
      const [compra] = await tx
        .insert(ferCompra)
        .values({
          idProveedor: proveedorId,
          numeroCompra: numero,
          fechaCompra: fecha,
          fechaEsperada: "2026-10-09",
          estado: "RECIBIDA",
          observacion,
        })
        .returning({ id: ferCompra.id });
      const detalles = [];
      for (const linea of lineas) {
        const [detalle] = await tx
          .insert(ferDetalleCompra)
          .values({
            idCompra: compra.id,
            idProducto: productos[linea.codigo].id,
            cantidad: String(linea.cantidad),
            costoUnitario: money(productos[linea.codigo].costo),
            porcentajeDescuento: "0.00",
            porcentajeImpuesto: "0.00",
          })
          .returning({ id: ferDetalleCompra.id });
        detalles.push({ ...linea, id: detalle.id });
      }
      const [rec] = await tx
        .insert(ferRecepcion)
        .values({
          idCompra: compra.id,
          numeroRecepcion: recepcion,
          fechaRecepcion: fecha,
          estado: "CONFIRMADA",
          observacion: "Recepción completa en bodega",
        })
        .returning({ id: ferRecepcion.id });
      for (const linea of detalles) {
        await tx.insert(ferDetalleRecepcion).values({
          idRecepcion: rec.id,
          idDetalleCompra: linea.id,
          cantidadRecibida: String(linea.cantidad),
          cantidadRechazada: "0",
        });
        await mover(tx, productos[linea.codigo], {
          tipo: "ENTRADA",
          delta: linea.cantidad,
          fecha,
          modulo: "COMPRAS",
          origenId: rec.id,
          numero: recepcion,
          motivo: `Recepción de ${numero}`,
          usuarioId: supervisorId,
        });
      }
      await auditar(tx, {
        idUsuario: supervisorId,
        fecha,
        modulo: "COMPRAS",
        accion: "RECEPCION",
        entidad: "FER_COMPRA",
        idRegistro: compra.id,
        mensaje: `Se recibió ${numero}`,
      });
    }

    await compraRecibida({
      numero: "COM-2026-0101",
      recepcion: "REC-2026-0101",
      proveedorId: centro,
      fecha: gt(6, 10, 30),
      observacion: "Pedido semanal de obra y ferretería.",
      lineas: [
        { codigo: "MART-16", cantidad: 50 },
        { codigo: "CEM-50", cantidad: 100 },
        { codigo: "TOR-DW", cantidad: 80 },
        { codigo: "PVC-12", cantidad: 20 },
        { codigo: "CAB-12", cantidad: 8 },
        { codigo: "CAS-01", cantidad: 2 },
        { codigo: "GUA-CU", cantidad: 12 },
      ],
    });
    await compraRecibida({
      numero: "COM-2026-0102",
      recepcion: "REC-2026-0102",
      proveedorId: valle,
      fecha: gt(8, 14, 0),
      observacion: "Reposición de pinturas y accesorios.",
      lineas: [
        { codigo: "PIN-GAL", cantidad: 16 },
        { codigo: "BRO-02", cantidad: 30 },
        { codigo: "CIN-AIS", cantidad: 12 },
      ],
    });

    const [compraPendiente] = await tx
      .insert(ferCompra)
      .values({
        idProveedor: centro,
        numeroCompra: "COM-2026-0103",
        fechaCompra: gt(28, 11, 20),
        fechaEsperada: "2026-11-05",
        estado: "CREADA",
        observacion: "Pendiente de pago al proveedor. No se recibe hasta cancelar la factura.",
      })
      .returning({ id: ferCompra.id });
    await tx.insert(ferDetalleCompra).values([
      {
        idCompra: compraPendiente.id,
        idProducto: productos["CAS-01"].id,
        cantidad: "24",
        costoUnitario: money(45),
        porcentajeDescuento: "0.00",
        porcentajeImpuesto: "0.00",
      },
      {
        idCompra: compraPendiente.id,
        idProducto: productos["CEM-50"].id,
        cantidad: "40",
        costoUnitario: money(62),
        porcentajeDescuento: "0.00",
        porcentajeImpuesto: "0.00",
      },
    ]);

    const [compraCancelada] = await tx
      .insert(ferCompra)
      .values({
        idProveedor: valle,
        numeroCompra: "COM-2026-0104",
        fechaCompra: gt(12, 16, 45),
        fechaEsperada: "2026-10-18",
        estado: "CANCELADA",
        observacion: "Se canceló porque el proveedor cambió el precio del galón.",
      })
      .returning({ id: ferCompra.id });
    await tx.insert(ferDetalleCompra).values({
      idCompra: compraCancelada.id,
      idProducto: productos["PIN-GAL"].id,
      cantidad: "20",
      costoUnitario: money(78),
      porcentajeDescuento: "0.00",
      porcentajeImpuesto: "0.00",
    });

    await mover(tx, productos["CAS-01"], {
      tipo: "AJUSTE",
      delta: -2,
      fecha: gt(9, 9, 0),
      modulo: "INVENTARIO",
      origenId: productos["CAS-01"].id,
      numero: "AJU-2026-0101",
      motivo: "Los dos cascos llegaron golpeados y se dieron de baja.",
      usuarioId: adminId,
    });
    await auditar(tx, {
      idUsuario: adminId,
      fecha: gt(9, 9, 0),
      modulo: "INVENTARIO",
      accion: "AJUSTE",
      entidad: "FER_PRODUCTO",
      idRegistro: productos["CAS-01"].id,
      registro: "AJU-2026-0101",
      mensaje: "Ajuste de baja de cascos dañados",
    });

    async function abrirPedido({ numero, clienteId, fecha, descuento, estadoFinal, observacion, lineas, vendedorId }) {
      const [pedido] = await tx
        .insert(ferPedido)
        .values({
          idCliente: clienteId,
          idEstadoPedido: estado[estadoFinal],
          numeroPedido: numero,
          fechaPedido: fecha,
          porcentajeDescuento: money(descuento),
          observacion,
        })
        .returning({ id: ferPedido.id });
      const detalles = [];
      for (const linea of lineas) {
        const [detalle] = await tx
          .insert(ferDetallePedido)
          .values({
            idPedido: pedido.id,
            idProducto: productos[linea.codigo].id,
            cantidad: String(linea.cantidad),
            precioUnitario: money(productos[linea.codigo].precio),
            porcentajeDescuento: "0.00",
            porcentajeImpuesto: "0.00",
          })
          .returning({ id: ferDetallePedido.id });
        detalles.push({ ...linea, id: detalle.id, precio: productos[linea.codigo].precio, costo: productos[linea.codigo].costo });
      }
      await historial(tx, pedido.id, vendedorId, null, estado.CREADO, fecha, "Pedido registrado");
      return { id: pedido.id, detalles };
    }

    await abrirPedido({
      numero: "PED-2026-0101",
      clienteId: ana,
      fecha: gt(29, 9, 10),
      descuento: 0,
      estadoFinal: "CREADO",
      observacion: "Borrador. Ana todavía no confirma la cantidad.",
      vendedorId: operadorId,
      lineas: [{ codigo: "MART-16", cantidad: 2 }],
    });

    const pendiente = await abrirPedido({
      numero: "PED-2026-0102",
      clienteId: roble,
      fecha: gt(27, 11, 40),
      descuento: 15,
      estadoFinal: "PENDIENTE_APROBACION",
      observacion: "Descuento del 15 % para la obra de zona 4. Supera el límite.",
      vendedorId: operadorId,
      lineas: [{ codigo: "CEM-50", cantidad: 8 }],
    });
    await historial(
      tx,
      pendiente.id,
      operadorId,
      estado.CREADO,
      estado.PENDIENTE_APROBACION,
      gt(27, 11, 41),
      "Enviado a aprobación por descuento del 15 %"
    );
    await tx.insert(ferAprobacion).values({
      idPedido: pendiente.id,
      idUsuarioSolicita: operadorId,
      tipoAprobacion: "DESCUENTO",
      valorSolicitado: "15.00",
      valorPermitido: "10.00",
      estado: "PENDIENTE",
      fechaSolicitud: gt(27, 11, 41),
    });

    const listo = await abrirPedido({
      numero: "PED-2026-0103",
      clienteId: paz,
      fecha: gt(28, 15, 5),
      descuento: 5,
      estadoFinal: "APROBADO",
      observacion: "Listo para facturar. El descuento no supera el límite.",
      vendedorId: operadorId,
      lineas: [{ codigo: "BRO-02", cantidad: 3 }],
    });
    await historial(tx, listo.id, operadorId, estado.CREADO, estado.APROBADO, gt(28, 15, 6), "Aprobado al enviar");

    const alLimite = await abrirPedido({
      numero: "PED-2026-0108",
      clienteId: paz,
      fecha: gt(30, 8, 20),
      descuento: 10,
      estadoFinal: "APROBADO",
      observacion: "Descuento igual al 10 %. No requiere aprobación.",
      vendedorId: operadorId,
      lineas: [{ codigo: "PVC-12", cantidad: 2 }],
    });
    await historial(tx, alLimite.id, operadorId, estado.CREADO, estado.APROBADO, gt(30, 8, 21), "Aprobado al enviar");

    const rechazado = await abrirPedido({
      numero: "PED-2026-0104",
      clienteId: miguel,
      fecha: gt(20, 10, 0),
      descuento: 18,
      estadoFinal: "CANCELADO",
      observacion: "Rechazado. El 18 % no se autorizó y el cliente está inactivo.",
      vendedorId: operadorId,
      lineas: [{ codigo: "CEM-50", cantidad: 6 }],
    });
    await historial(tx, rechazado.id, operadorId, estado.CREADO, estado.PENDIENTE_APROBACION, gt(20, 10, 5), "Enviado a aprobación");
    await historial(tx, rechazado.id, supervisorId, estado.PENDIENTE_APROBACION, estado.CANCELADO, gt(20, 16, 30), "Descuento rechazado");
    await tx.insert(ferAprobacion).values({
      idPedido: rechazado.id,
      idUsuarioSolicita: operadorId,
      idUsuarioAutoriza: supervisorId,
      tipoAprobacion: "DESCUENTO",
      valorSolicitado: "18.00",
      valorPermitido: "10.00",
      estado: "RECHAZADA",
      fechaSolicitud: gt(20, 10, 5),
      fechaRespuesta: gt(20, 16, 30),
      observacion: "El descuento queda fuera de la política.",
    });
    await auditar(tx, {
      idUsuario: supervisorId,
      fecha: gt(20, 16, 30),
      modulo: "PEDIDOS",
      accion: "RECHAZAR",
      entidad: "FER_PEDIDO",
      idRegistro: rechazado.id,
      registro: "PED-2026-0104",
      mensaje: "Se rechazó el descuento del 18 %",
    });

    async function vender({ pedido, numeroVenta, fecha, pagos, devolver }) {
      await tx
        .update(ferPedido)
        .set({ idEstadoPedido: estado.EN_PROCESO })
        .where(eq(ferPedido.id, pedido.id));
      await historial(tx, pedido.id, operadorId, estado.APROBADO, estado.EN_PROCESO, fecha, "Se registró la venta");

      const [venta] = await tx
        .insert(ferVenta)
        .values({
          idPedido: pedido.id,
          numeroFactura: numeroVenta,
          fechaVenta: fecha,
          estado: "FINALIZADA",
          fechaFinalizacion: fecha,
        })
        .returning({ id: ferVenta.id });
      await auditar(tx, {
        idUsuario: operadorId,
        fecha,
        modulo: "VENTAS",
        accion: "VENTA",
        entidad: "FER_VENTA",
        idRegistro: venta.id,
        registro: numeroVenta,
        mensaje: `Venta ${numeroVenta} finalizada`,
      });

      const detallesVenta = [];
      for (const linea of pedido.detalles) {
        const [detalle] = await tx
          .insert(ferDetalleVenta)
          .values({
            idVenta: venta.id,
            idDetallePedido: linea.id,
            cantidad: String(linea.cantidad),
            precioUnitario: money(linea.precio),
            costoUnitario: money(linea.costo),
            porcentajeDescuento: "0.00",
            porcentajeImpuesto: "0.00",
          })
          .returning({ id: ferDetalleVenta.id });
        detallesVenta.push({ ...linea, detalleVentaId: detalle.id });
        await mover(tx, productos[linea.codigo], {
          tipo: "SALIDA",
          delta: -linea.cantidad,
          fecha,
          modulo: "VENTAS",
          origenId: venta.id,
          numero: numeroVenta,
          motivo: `Salida por ${numeroVenta}`,
          usuarioId: operadorId,
        });
      }

      let pagado = 0;
      for (const pago of pagos) {
        await tx.insert(ferPago).values({
          idVenta: venta.id,
          idMetodoPago: pago.metodoId,
          numeroPago: pago.numero,
          fechaPago: pago.fecha,
          monto: money(pago.monto),
          referencia: pago.referencia ?? null,
          estado: "REGISTRADO",
          observacion: pago.observacion ?? null,
        });
        pagado += pago.monto;
        await auditar(tx, {
          idUsuario: operadorId,
          fecha: pago.fecha,
          modulo: "PAGOS",
          accion: "PAGO",
          entidad: "FER_PAGO",
          idRegistro: venta.id,
          registro: pago.numero,
          mensaje: `Pago de ${numeroVenta}`,
        });
      }

      if (devolver) {
        const linea = detallesVenta.find((item) => item.codigo === devolver.codigo);
        const [dev] = await tx
          .insert(ferDevolucion)
          .values({
            idVenta: venta.id,
            idUsuario: supervisorId,
            numeroDevolucion: devolver.numero,
            fechaDevolucion: devolver.fecha,
            motivo: devolver.motivo,
          })
          .returning({ id: ferDevolucion.id });
        await tx.insert(ferDetalleDevolucion).values({
          idDevolucion: dev.id,
          idDetalleVenta: linea.detalleVentaId,
          cantidad: String(devolver.cantidad),
        });
        await mover(tx, productos[devolver.codigo], {
          tipo: "DEVOLUCION",
          delta: devolver.cantidad,
          fecha: devolver.fecha,
          modulo: "VENTAS",
          origenId: dev.id,
          numero: devolver.numero,
          motivo: devolver.motivo,
          usuarioId: supervisorId,
        });
        await auditar(tx, {
          idUsuario: supervisorId,
          fecha: devolver.fecha,
          modulo: "VENTAS",
          accion: "DEVOLUCION",
          entidad: "FER_DEVOLUCION",
          idRegistro: dev.id,
          registro: devolver.numero,
          mensaje: devolver.motivo,
        });
      }

      const subtotal = pedido.detalles.reduce((suma, linea) => suma + linea.cantidad * linea.precio, 0);
      const total = Math.round(subtotal * (1 - (pedido.descuento || 0) / 100) * 100) / 100;
      if (Math.round(pagado * 100) >= Math.round(total * 100)) {
        await tx
          .update(ferPedido)
          .set({ idEstadoPedido: estado.COMPLETADO })
          .where(eq(ferPedido.id, pedido.id));
        await historial(tx, pedido.id, operadorId, estado.EN_PROCESO, estado.COMPLETADO, pagos.at(-1).fecha, "Saldo cubierto");
      }
      return venta.id;
    }

    const ventaSaldo = await abrirPedido({
      numero: "PED-2026-0105",
      clienteId: ana,
      fecha: gt(18, 9, 30),
      descuento: 0,
      estadoFinal: "APROBADO",
      observacion: "Mostrador. Quedó con saldo.",
      vendedorId: operadorId,
      lineas: [
        { codigo: "PIN-GAL", cantidad: 6 },
        { codigo: "CIN-AIS", cantidad: 4 },
      ],
    });
    ventaSaldo.descuento = 0;
    await historial(tx, ventaSaldo.id, operadorId, estado.CREADO, estado.APROBADO, gt(18, 9, 31), "Aprobado al enviar");
    await vender({
      pedido: ventaSaldo,
      numeroVenta: "VEN-2026-0105",
      fecha: gt(18, 9, 40),
      pagos: [
        {
          numero: "PAG-2026-0105",
          metodoId: efectivo,
          monto: 400,
          fecha: gt(18, 9, 45),
          observacion: "Abono en efectivo. Queda saldo.",
        },
      ],
    });

    const ventaCompleta = await abrirPedido({
      numero: "PED-2026-0106",
      clienteId: roble,
      fecha: gt(10, 8, 50),
      descuento: 8,
      estadoFinal: "APROBADO",
      observacion: "Obra El Roble, descuento del 8 %.",
      vendedorId: operadorId,
      lineas: [
        { codigo: "MART-16", cantidad: 10 },
        { codigo: "CEM-50", cantidad: 10 },
      ],
    });
    ventaCompleta.descuento = 8;
    await historial(tx, ventaCompleta.id, operadorId, estado.CREADO, estado.APROBADO, gt(10, 8, 51), "Aprobado al enviar");
    await vender({
      pedido: ventaCompleta,
      numeroVenta: "VEN-2026-0106",
      fecha: gt(10, 9, 15),
      pagos: [
        {
          numero: "PAG-2026-0106",
          metodoId: transferencia,
          monto: 1260.4,
          fecha: gt(10, 11, 0),
          referencia: "TRX-88421",
          observacion: "Transferencia del mismo día. Saldo en cero.",
        },
      ],
    });

    const ventaDevuelta = await abrirPedido({
      numero: "PED-2026-0107",
      clienteId: paz,
      fecha: gt(15, 13, 10),
      descuento: 0,
      estadoFinal: "APROBADO",
      observacion: "Pedido de taller.",
      vendedorId: operadorId,
      lineas: [
        { codigo: "MART-16", cantidad: 6 },
        { codigo: "TOR-DW", cantidad: 10 },
      ],
    });
    ventaDevuelta.descuento = 0;
    await historial(tx, ventaDevuelta.id, operadorId, estado.CREADO, estado.APROBADO, gt(15, 13, 11), "Aprobado al enviar");
    await vender({
      pedido: ventaDevuelta,
      numeroVenta: "VEN-2026-0107",
      fecha: gt(15, 13, 20),
      pagos: [
        {
          numero: "PAG-2026-0107",
          metodoId: efectivo,
          monto: 620,
          fecha: gt(15, 13, 25),
          observacion: "Pago de contado.",
        },
      ],
      devolver: {
        codigo: "MART-16",
        cantidad: 2,
        numero: "DEV-2026-0101",
        fecha: gt(22, 10, 15),
        motivo: "Dos martillos llegaron con el mango flojo. Se devolvieron a bodega.",
      },
    });

    const ventaAbono = await abrirPedido({
      numero: "PED-2026-0109",
      clienteId: roble,
      fecha: gt(21, 16, 0),
      descuento: 0,
      estadoFinal: "APROBADO",
      observacion: "Material eléctrico e hidráulico. Crédito parcial.",
      vendedorId: operadorId,
      lineas: [
        { codigo: "PVC-12", cantidad: 5 },
        { codigo: "CAB-12", cantidad: 6 },
        { codigo: "CIN-AIS", cantidad: 5 },
      ],
    });
    ventaAbono.descuento = 0;
    await historial(tx, ventaAbono.id, operadorId, estado.CREADO, estado.APROBADO, gt(21, 16, 1), "Aprobado al enviar");
    await vender({
      pedido: ventaAbono,
      numeroVenta: "VEN-2026-0109",
      fecha: gt(21, 16, 20),
      pagos: [
        {
          numero: "PAG-2026-0109",
          metodoId: tarjeta,
          monto: 500,
          fecha: gt(21, 16, 30),
          referencia: "VISA-4521",
          observacion: "Abono con tarjeta. El resto queda pendiente.",
        },
      ],
    });

    const ventaPintura = await abrirPedido({
      numero: "PED-2026-0110",
      clienteId: ana,
      fecha: gt(24, 12, 5),
      descuento: 0,
      estadoFinal: "APROBADO",
      observacion: "Segunda compra de pintura del mes.",
      vendedorId: operadorId,
      lineas: [{ codigo: "PIN-GAL", cantidad: 6 }],
    });
    ventaPintura.descuento = 0;
    await historial(tx, ventaPintura.id, operadorId, estado.CREADO, estado.APROBADO, gt(24, 12, 6), "Aprobado al enviar");
    await vender({
      pedido: ventaPintura,
      numeroVenta: "VEN-2026-0110",
      fecha: gt(24, 12, 15),
      pagos: [
        {
          numero: "PAG-2026-0110",
          metodoId: efectivo,
          monto: 870,
          fecha: gt(24, 12, 20),
          observacion: "Pago de contado.",
        },
      ],
    });

    const autorizado = await abrirPedido({
      numero: "PED-2026-0111",
      clienteId: paz,
      fecha: gt(14, 9, 0),
      descuento: 12,
      estadoFinal: "APROBADO",
      observacion: "El 12 % se autorizó para el taller.",
      vendedorId: operadorId,
      lineas: [{ codigo: "TOR-DW", cantidad: 4 }],
    });
    autorizado.descuento = 12;
    await historial(tx, autorizado.id, operadorId, estado.CREADO, estado.PENDIENTE_APROBACION, gt(14, 9, 5), "Enviado a aprobación");
    await historial(tx, autorizado.id, supervisorId, estado.PENDIENTE_APROBACION, estado.APROBADO, gt(14, 11, 20), "Descuento autorizado");
    await tx.insert(ferAprobacion).values({
      idPedido: autorizado.id,
      idUsuarioSolicita: operadorId,
      idUsuarioAutoriza: supervisorId,
      tipoAprobacion: "DESCUENTO",
      valorSolicitado: "12.00",
      valorPermitido: "10.00",
      estado: "APROBADA",
      fechaSolicitud: gt(14, 9, 5),
      fechaRespuesta: gt(14, 11, 20),
      observacion: "Se autoriza por compra recurrente del taller.",
    });
    await auditar(tx, {
      idUsuario: supervisorId,
      fecha: gt(14, 11, 20),
      modulo: "PEDIDOS",
      accion: "APROBAR",
      entidad: "FER_PEDIDO",
      idRegistro: autorizado.id,
      registro: "PED-2026-0111",
      mensaje: "Se aprobó el descuento del 12 %",
    });
    await vender({
      pedido: autorizado,
      numeroVenta: "VEN-2026-0111",
      fecha: gt(14, 15, 10),
      pagos: [
        {
          numero: "PAG-2026-0111",
          metodoId: transferencia,
          monto: 123.2,
          fecha: gt(14, 15, 40),
          referencia: "TRX-19044",
          observacion: "Pago total por transferencia.",
        },
      ],
    });

    const [clavePendiente] = await tx
      .select({ id: ferSolicitudClave.id })
      .from(ferSolicitudClave)
      .where(and(eq(ferSolicitudClave.idUsuario, operadorId), eq(ferSolicitudClave.estado, "PENDIENTE")))
      .limit(1);
    if (!clavePendiente) {
      await tx.insert(ferSolicitudClave).values({
        idUsuario: operadorId,
        fecha: gt(29, 18, 10),
        estado: "PENDIENTE",
      });
    }
  });

  console.log("✅ Demo lista. Usuarios sin cambios.");
  console.log("   Bajo el mínimo: pintura, cable, tubo, casco y cinta.");
  console.log("   Clientes inactivos: Miguel Ángel Soto e Inversiones Los Pinos.");
  console.log("   Compra pendiente de pago: COM-2026-0103.");
  console.log("   Ventas con saldo: VEN-2026-0105 y VEN-2026-0109.");
  console.log("   Pedido por aprobar: PED-2026-0102 (15 %). Listo para vender: PED-2026-0103.");
}

seed()
  .catch((error) => {
    console.error("❌ Error en el seeder de demo:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
