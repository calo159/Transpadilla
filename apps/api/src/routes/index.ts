import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import busesRouter from "./buses";
import conductoresRouter from "./conductores";
import rutasRouter from "./rutas";
import statsRouter from "./stats";
import seedRouter from "./seed";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(busesRouter);
router.use(conductoresRouter);
router.use(rutasRouter);
router.use(statsRouter);
router.use(seedRouter);

export default router;
