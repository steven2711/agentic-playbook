import { main } from "./cli.js";
import { UsageError } from "./types.js";

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError) {
    console.error(`agentic: ${e.message}`);
    process.exitCode = 2;
  } else throw e;
}
