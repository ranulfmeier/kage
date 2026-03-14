import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadAgent, printSolscan } from "../utils.js";

export const storeCommand = new Command("store")
  .description("Encrypt and store a memory on-chain")
  .argument("<text>", "The memory content to store")
  .option("-t, --type <type>", "Memory type (general|credential|task|knowledge)", "general")
  .action(async (text: string, opts: { type: string }) => {
    const spinner = ora("Initializing agent…").start();
    try {
      const { agent } = await loadAgent();
      spinner.text = "Encrypting and storing memory…";
      const response = await agent.chat(`remember: ${text}`);
      spinner.succeed(chalk.green("Memory stored successfully"));
      console.log(chalk.gray("\n  Content: ") + chalk.white(text));
      if (response.proof) {
        console.log(chalk.gray("  CID:     ") + chalk.cyan(response.proof.cid ?? "—"));
        printSolscan(response.proof.txSignature);
        if (response.proof.umbraProof) {
          console.log(chalk.gray("  Umbra:   ") + chalk.magenta("shielded ✓"));
        }
      }
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });
