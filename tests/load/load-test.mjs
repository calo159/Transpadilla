import { execSync } from "node:child_process";

execSync("artillery run tests/load/load-test.yml", { stdio: "inherit" });
