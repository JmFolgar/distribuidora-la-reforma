import "./loadEnv.js";
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import productosRouter from "./routes/productos.js";
import usuariosRouter from "./routes/usuarios.js";
import clientesRouter from "./routes/clientes.js";
import ubicacionesRouter from "./routes/ubicaciones.js";
import proveedoresRouter from "./routes/proveedores.js";
import comprasRouter from "./routes/compras.js";
import inventarioRouter from "./routes/inventario.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "API Distribuidora Nova",
    version: "1.0.0",
  });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/productos", productosRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/clientes", clientesRouter);
app.use("/api/ubicaciones", ubicacionesRouter);
app.use("/api/proveedores", proveedoresRouter);
app.use("/api/compras", comprasRouter);
app.use("/api/inventario", inventarioRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🔧 Distribuidora Nova API → http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
