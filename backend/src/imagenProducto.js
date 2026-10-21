import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";

const dir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../uploads/productos"
);
fs.mkdirSync(dir, { recursive: true });

const MAX_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = file.mimetype === "image/png" ? ".png" : ".jpg";
      cb(null, `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
      return;
    }
    const err = new Error("TIPO_IMAGEN");
    err.code = "TIPO_IMAGEN";
    cb(err);
  },
});

export function rutaPublica(filename) {
  return `/api/uploads/productos/${filename}`;
}

export function borrarImagen(ruta) {
  if (!ruta || !ruta.startsWith("/api/uploads/productos/")) return;
  const archivo = path.join(dir, path.basename(ruta));
  fs.unlink(archivo, () => {});
}

export function firmaValida(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(8);
  try {
    fs.readSync(fd, buf, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return jpeg || png;
}

export function subirImagen(req, res, next) {
  upload.single("imagen")(req, res, (err) => {
    if (!err) return next();
    const grande = err.code === "LIMIT_FILE_SIZE";
    const message = grande
      ? "La imagen no puede superar 2 MB"
      : "La imagen debe ser JPG o PNG";
    return res.status(400).json({
      success: false,
      message,
      fields: { imagen: message },
    });
  });
}

export function rechazarImagenInvalida(req, res) {
  if (!req.file) return false;
  if (firmaValida(req.file.path)) return false;
  borrarImagen(rutaPublica(req.file.filename));
  res.status(400).json({
    success: false,
    message: "La imagen debe ser JPG o PNG",
    fields: { imagen: "La imagen debe ser JPG o PNG" },
  });
  return true;
}
