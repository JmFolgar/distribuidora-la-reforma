import { Router } from "express";
import { eq, sql, asc, and, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  ferCliente,
  ferDireccion,
  ferDepartamento,
  ferMunicipio,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  correoOpcionalSchema,
  esquemaNombrePersona,
  nitSchema,
  telefonoOpcionalSchema,
} from "../validacion.js";
import { codigoCliente, registrarAuditoria } from "../auditoria.js";

const router = Router();

const ROLES_LECTURA = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];
const ROLES_ESCRITURA = ["ADMINISTRADOR", "OPERADOR"];

router.use(requireAuth);

const optionalText = (max) =>
  z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

const clienteSchema = z
  .object({
    nombre: esquemaNombrePersona(180),
    nit: nitSchema,
    telefono: telefonoOpcionalSchema,
    correo: correoOpcionalSchema,
    idMunicipio: z
      .union([z.number().int().positive(), z.string(), z.null(), z.undefined()])
      .optional()
      .transform((v) => {
        if (v == null || v === "") return undefined;
        const n = Number(v);
        return Number.isInteger(n) && n > 0 ? n : undefined;
      }),
    zona: optionalText(10),
    colonia: optionalText(120),
    calle: optionalText(120),
    avenida: optionalText(120),
    numeroCasa: optionalText(30),
    referencia: optionalText(300),
  })
  .superRefine((data, ctx) => {
    const tieneDetalle = Boolean(
      data.zona ||
        data.colonia ||
        data.calle ||
        data.avenida ||
        data.numeroCasa ||
        data.referencia
    );
    if (tieneDetalle && !data.idMunicipio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["idMunicipio"],
        message: "Seleccione un municipio para la dirección",
      });
    }
  });

function fieldErrorsFromZod(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function splitNombre(nombre) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { primerNombre: "", primerApellido: "" };
  }
  if (parts.length === 1) {
    return { primerNombre: parts[0], primerApellido: parts[0] };
  }
  return {
    primerNombre: parts[0],
    primerApellido: parts.slice(1).join(" ").slice(0, 60),
  };
}

function nombreCompleto(cliente) {
  if (cliente.tipoPersona === "JURIDICA" && cliente.razonSocial) {
    return cliente.razonSocial;
  }
  if (
    cliente.primerNombre === cliente.primerApellido ||
    !cliente.primerApellido
  ) {
    return cliente.primerNombre || "";
  }
  return `${cliente.primerNombre} ${cliente.primerApellido}`.trim();
}

function textoDireccion(dir, municipio, departamento) {
  if (!dir) return null;
  const partes = [];
  if (dir.calle) partes.push(dir.calle);
  if (dir.avenida) partes.push(dir.avenida);
  if (dir.numeroCasa) partes.push(`No. ${dir.numeroCasa}`);
  if (dir.zona) partes.push(`Zona ${dir.zona}`);
  if (dir.colonia) partes.push(dir.colonia);
  if (dir.referencia) partes.push(dir.referencia);
  if (municipio?.nombre) partes.push(municipio.nombre);
  if (departamento?.nombre) partes.push(departamento.nombre);
  return partes.length ? partes.join(", ") : null;
}

function normalizarNit(nit) {
  return nit.trim().toUpperCase().replace(/\s+/g, "");
}

function parseId(param) {
  const id = Number(param);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function mapCliente(cliente) {
  let direccion = null;
  let dir = null;
  let municipio = null;
  let departamento = null;

  if (cliente.idDireccion) {
    [dir] = await db
      .select()
      .from(ferDireccion)
      .where(eq(ferDireccion.id, cliente.idDireccion))
      .limit(1);

    if (dir) {
      [municipio] = await db
        .select()
        .from(ferMunicipio)
        .where(eq(ferMunicipio.id, dir.idMunicipio))
        .limit(1);
      if (municipio) {
        [departamento] = await db
          .select()
          .from(ferDepartamento)
          .where(eq(ferDepartamento.id, municipio.idDepartamento))
          .limit(1);
      }
    }
    direccion = textoDireccion(dir, municipio, departamento);
  }

  return {
    id: cliente.id,
    nombre: nombreCompleto(cliente),
    nit: cliente.nit,
    correo: cliente.correo,
    telefono: cliente.telefono,
    direccion,
    idDireccion: cliente.idDireccion ?? null,
    idDepartamento: departamento?.id ?? null,
    idMunicipio: municipio?.id ?? null,
    zona: dir?.zona ?? null,
    colonia: dir?.colonia ?? null,
    calle: dir?.calle ?? null,
    avenida: dir?.avenida ?? null,
    numeroCasa: dir?.numeroCasa ?? null,
    referencia: dir?.referencia ?? null,
    estado: cliente.estado,
    activo: cliente.estado === "A",
    fechaCreacion: cliente.fechaCreacion,
  };
}

async function resolverDireccion(cliente, data) {
  const { idMunicipio, zona, colonia, calle, avenida, numeroCasa, referencia } =
    data;

  if (!idMunicipio) {
    return cliente.idDireccion ?? null;
  }

  const [mun] = await db
    .select({ id: ferMunicipio.id })
    .from(ferMunicipio)
    .where(eq(ferMunicipio.id, idMunicipio))
    .limit(1);

  if (!mun) {
    const err = new Error("MUNICIPIO_INVALIDO");
    err.code = "MUNICIPIO_INVALIDO";
    throw err;
  }

  const valores = {
    idMunicipio,
    zona: zona ?? null,
    colonia: colonia ?? null,
    calle: calle ?? null,
    avenida: avenida ?? null,
    numeroCasa: numeroCasa ?? null,
    referencia: referencia ?? null,
  };

  if (cliente.idDireccion) {
    await db
      .update(ferDireccion)
      .set(valores)
      .where(eq(ferDireccion.id, cliente.idDireccion));
    return cliente.idDireccion;
  }

  const [dir] = await db.insert(ferDireccion).values(valores).returning();
  return dir.id;
}

router.get("/", requireRole(...ROLES_LECTURA), async (_req, res, next) => {
  try {
    const clientes = await db
      .select()
      .from(ferCliente)
      .orderBy(asc(ferCliente.id));

    const data = [];
    for (const c of clientes) {
      data.push(await mapCliente(c));
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole(...ROLES_ESCRITURA), async (req, res, next) => {
  try {
    const parsed = clienteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Revise los campos obligatorios",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const data = parsed.data;
    const nitNorm = normalizarNit(data.nit);

    const [nitExiste] = await db
      .select({ id: ferCliente.id })
      .from(ferCliente)
      .where(sql`UPPER(REPLACE(${ferCliente.nit}, ' ', '')) = ${nitNorm}`)
      .limit(1);

    if (nitExiste) {
      return res.status(409).json({
        success: false,
        code: "NIT_DUPLICADO",
        message: "Ya existe un cliente con ese NIT",
        fields: { nit: "Ya existe un cliente con ese NIT" },
      });
    }

    const { primerNombre, primerApellido } = splitNombre(data.nombre);

    let idDireccion = null;
    try {
      idDireccion = await resolverDireccion({ idDireccion: null }, data);
    } catch (err) {
      if (err.code === "MUNICIPIO_INVALIDO") {
        return res.status(400).json({
          success: false,
          message: "El municipio seleccionado no existe",
          fields: { idMunicipio: "Seleccione un municipio válido" },
        });
      }
      throw err;
    }

    const [creado] = await db
      .insert(ferCliente)
      .values({
        idDireccion,
        tipoPersona: "INDIVIDUAL",
        nit: nitNorm.slice(0, 20),
        primerNombre: primerNombre.slice(0, 60),
        primerApellido: primerApellido.slice(0, 60),
        correo: data.correo ?? null,
        telefono: data.telefono ?? null,
        estado: "A",
      })
      .returning();

    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "CLIENTES",
      accion: "CREAR",
      entidad: "FER_CLIENTE",
      idRegistro: creado.id,
      registro: codigoCliente(creado.id),
      valorNuevo: {
        nombre: `${primerNombre} ${primerApellido}`.trim(),
        nit: creado.nit,
      },
      mensaje: `Alta del cliente ${codigoCliente(creado.id)}`,
    });

    res.status(201).json({
      success: true,
      data: await mapCliente(creado),
      message: "Cliente registrado correctamente",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireRole(...ROLES_ESCRITURA), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    const parsed = clienteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Revise los campos obligatorios",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const [cliente] = await db
      .select()
      .from(ferCliente)
      .where(eq(ferCliente.id, id))
      .limit(1);

    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const data = parsed.data;
    const nitNorm = normalizarNit(data.nit);

    const [nitExiste] = await db
      .select({ id: ferCliente.id })
      .from(ferCliente)
      .where(
        and(
          sql`UPPER(REPLACE(${ferCliente.nit}, ' ', '')) = ${nitNorm}`,
          ne(ferCliente.id, id)
        )
      )
      .limit(1);

    if (nitExiste) {
      return res.status(409).json({
        success: false,
        code: "NIT_DUPLICADO",
        message: "Ya existe un cliente con ese NIT",
        fields: { nit: "Ya existe un cliente con ese NIT" },
      });
    }

    const { primerNombre, primerApellido } = splitNombre(data.nombre);

    let idDireccion = cliente.idDireccion;
    try {
      idDireccion = await resolverDireccion(cliente, data);
    } catch (err) {
      if (err.code === "MUNICIPIO_INVALIDO") {
        return res.status(400).json({
          success: false,
          message: "El municipio seleccionado no existe",
          fields: { idMunicipio: "Seleccione un municipio válido" },
        });
      }
      throw err;
    }

    const [actualizado] = await db
      .update(ferCliente)
      .set({
        idDireccion,
        nit: nitNorm.slice(0, 20),
        primerNombre: primerNombre.slice(0, 60),
        primerApellido: primerApellido.slice(0, 60),
        correo: data.correo ?? null,
        telefono: data.telefono ?? null,
      })
      .where(eq(ferCliente.id, id))
      .returning();

    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "CLIENTES",
      accion: "MODIFICAR",
      entidad: "FER_CLIENTE",
      idRegistro: id,
      registro: codigoCliente(id),
      valorAnterior: {
        nombre: [cliente.primerNombre, cliente.primerApellido].filter(Boolean).join(" "),
        nit: cliente.nit,
        correo: cliente.correo,
        telefono: cliente.telefono,
      },
      valorNuevo: {
        nombre: `${primerNombre} ${primerApellido}`.trim(),
        nit: nitNorm.slice(0, 20),
        correo: data.correo ?? null,
        telefono: data.telefono ?? null,
      },
      mensaje: `Modificación del cliente ${codigoCliente(id)}`,
    });

    res.json({
      success: true,
      data: await mapCliente(actualizado),
      message: "Cliente actualizado correctamente",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
