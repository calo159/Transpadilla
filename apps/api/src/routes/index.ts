import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import busesRouter from "./buses";
import conductoresRouter from "./conductores";
import rutasRouter from "./rutas";
import paradasRouter from "./paradas";
import etaRouter from "./eta";
import statsRouter from "./stats";
import reportesRouter from "./reportes";
import auditoriaRouter from "./auditoria";
import seedRouter from "./seed";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(busesRouter);
router.use(conductoresRouter);
router.use(rutasRouter);
router.use(paradasRouter);
router.use(etaRouter);
router.use(statsRouter);
router.use(reportesRouter);
router.use(auditoriaRouter);
router.use(seedRouter);

export default router;
