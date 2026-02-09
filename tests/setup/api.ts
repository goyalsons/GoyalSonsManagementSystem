import { beforeAll } from "vitest";
import { loadTestEnv } from "../helpers/env.js";

loadTestEnv();
beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.DOTENV_PATH = ".env.test";
});
