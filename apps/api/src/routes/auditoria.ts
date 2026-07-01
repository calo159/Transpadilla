import { Router } from "express";
import { pool } from "@workspace/db";
import { authMiddleware, requireRol } from "../middleware/auth";

// Historial de acciones administrativas. Solo admin. Paginado.
const router = Router();

router.get("/auditoria", authMiddleware, requireRol("admin"), async (req, res) => {
  const limite = Math.min(100, Math.max(1, parseInt(String(req.query["limite"] ?? "50"), 10) || 50));
  const offset = Math.max(0, parseInt(String(req.query["offset"] ?? "0"), 10) || 0);

  const { rows } = await pool.query(
    `SELECT a.id, a.accion, a.entidad_tipo, a.entidad_id, a.detalle, a.creado_en,
            u.nombre AS usuario_nombre
       FROM auditoria a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
      ORDER BY a.creado_en DESC
      LIMIT $1 OFFSET $2`,
    [limite, offset],
  );
  const [{ total }] = (await pool.query(`SELECT COUNT(*)::int AS total FROM auditoria`)).rows;

  res.json({ limite, offset, total, registros: rows });
});

export default router;
