import { config } from "dotenv";
import { resolve } from "path";

// This module MUST be imported first (as a side-effect import) in serve.ts
// to ensure env vars are set before any other module evaluates.
const rootEnvPath = resolve(import.meta.dirname, "../../.env");

config({ path: rootEnvPath });
