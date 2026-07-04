import { execSync } from "node:child_process";

execSync("artillery run load-test.yml", { stdio: "inherit" });
