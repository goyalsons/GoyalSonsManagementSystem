import { beforeAll, afterAll } from "vitest";
import { loadTestEnv } from "../helpers/env.js";
import { getTestPrisma, disconnectTestPrisma } from "../helpers/db.js";

loadTestEnv();
beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.DOTENV_PATH = ".env.test";
});

afterAll(async () => {
  await disconnectTestPrisma();
});
