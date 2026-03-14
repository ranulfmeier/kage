import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadAgent } from "../utils.js";

export const recallCommand = new Command("recall")
  .description("Recall encrypted memories from the vault")
  .argument("[query]", "What to recall (leave empty for all memories)")
  .option("-n, --limit <n>", "Max memories to show", "10")
  .action(async (query: string | undefined, opts: { limit: string }) => {
    const spinner = ora("Initializing agent…").start();
    try {
      const { agent } = await loadAgent();
      if (query) {
        spinner.text = "Searching memories…";
        const response = await agent.chat(`recall: ${query}`);
        spinner.succeed(chalk.green("Recall complete"));
        console.log("\n" + chalk.white(response.text));
      } else {
        spinner.text = "Loading memories…";
        const memories = await agent.listMemories();
        spinner.succeed(chalk.green(`${memories.length} memories found`));
        if (memories.length === 0) {
          console.log(chalk.gray("\n  No memories yet. Use `kage store <text>` to add one."));
          return;
        }
        const limit = parseInt(opts.limit, 10);
        memories.slice(0, limit).forEach((m, i) => {
          console.log(
            chalk.gray(`\n  [${i + 1}] `) +
              chalk.cyan(m.cid.slice(0, 16) + "…") +
              chalk.gray(` · ${m.memoryType} · ${new Date(m.createdAt).toLocaleString()}`)
          );
        });
        if (memories.length > limit) {
          console.log(chalk.gray(`\n  … and ${memories.length - limit} more. Use -n to show more.`));
        }
      }
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });
