import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadAgent, printSolscan } from "../utils.js";

const TIERS: Record<string, string> = {
  elite: chalk.yellow("ELITE"),
  verified: chalk.magenta("VERIFIED"),
  trusted: chalk.green("TRUSTED"),
  newcomer: chalk.blue("NEWCOMER"),
  unknown: chalk.gray("UNKNOWN"),
};

function scoreBar(score: number): string {
  const filled = Math.floor(score / 50);
  return chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(20 - filled));
}

export const reputationCommand = new Command("reputation")
  .description("View and manage agent reputation");

reputationCommand
  .command("show")
  .description("Show current reputation score and stats")
  .action(async () => {
    const spinner = ora("Loading reputation…").start();
    try {
      const { agent } = await loadAgent();
      const rep = agent.getSelfReputation();
      spinner.succeed(chalk.green("Reputation loaded"));
      if (!rep) { console.log(chalk.gray("\n  No reputation data yet.\n")); return; }

      console.log(`\n  ${chalk.bold(`${rep.score}`)}/1000  ${scoreBar(rep.score)}  ${TIERS[rep.tier] ?? rep.tier}`);
      console.log(chalk.gray(`\n  Tasks:  ${rep.totalTasks} total · `) + chalk.green(`${rep.successfulTasks} ✓`) + chalk.gray(" · ") + chalk.red(`${rep.failedTasks} ✗`) + chalk.gray(` · ${rep.slashCount} slashed`));
      console.log(chalk.gray(`  Rate:   ${agent.getSuccessRate()}% success`));

      if (rep.lastTxSignature) {
        console.log(chalk.gray("  Anchor: ") + chalk.cyan(`https://solscan.io/tx/${rep.lastTxSignature}?cluster=devnet`));
      }

      if (rep.events.length > 0) {
        console.log(chalk.gray("\n  Recent events:"));
        [...rep.events].reverse().slice(0, 5).forEach(evt => {
          const delta = evt.delta > 0 ? chalk.green(`+${evt.delta}`) : chalk.red(`${evt.delta}`);
          console.log(chalk.gray(`    ${new Date(evt.timestamp).toLocaleTimeString()}  `) + delta + chalk.gray(`  ${evt.description}`));
        });
      }
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

reputationCommand
  .command("record <outcome>")
  .description("Record a task outcome (success|partial|failure)")
  .option("-d, --description <desc>", "Task description")
  .action(async (outcome: string, opts: { description?: string }) => {
    if (!["success", "partial", "failure"].includes(outcome)) {
      console.error(chalk.red("  outcome must be: success | partial | failure"));
      process.exit(1);
    }
    const spinner = ora(`Recording ${outcome}…`).start();
    try {
      const { agent } = await loadAgent();
      const event = await agent.recordTask({ outcome: outcome as "success" | "partial" | "failure", description: opts.description });
      const rep = agent.getSelfReputation();
      const delta = event.delta > 0 ? chalk.green(`+${event.delta}`) : chalk.red(`${event.delta}`);
      spinner.succeed(chalk.green(`Task recorded  ${delta} pts`));
      if (rep) {
        console.log(chalk.gray(`\n  New score: `) + chalk.bold(`${rep.score}/1000`) + chalk.gray(` · ${TIERS[rep.tier] ?? rep.tier}`));
      }
      printSolscan(event.txSignature);
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

reputationCommand
  .command("slash <reason>")
  .description("Apply a slash penalty (-80 pts)")
  .action(async (reason: string) => {
    const spinner = ora("Applying slash…").start();
    try {
      const { agent } = await loadAgent();
      const event = await agent.slash({ reason });
      const rep = agent.getSelfReputation();
      spinner.succeed(chalk.red(`Slashed  ${event.delta} pts`));
      if (rep) {
        console.log(chalk.gray(`\n  New score: `) + chalk.bold(`${rep.score}/1000`) + chalk.gray(` · ${TIERS[rep.tier] ?? rep.tier}`));
      }
      printSolscan(event.txSignature);
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

reputationCommand
  .command("snapshot")
  .description("Anchor current reputation score on-chain")
  .action(async () => {
    const spinner = ora("Committing snapshot…").start();
    try {
      const { agent } = await loadAgent();
      const snap = await agent.commitReputationSnapshot();
      spinner.succeed(chalk.green("Snapshot committed"));
      console.log(chalk.gray("\n  Score: ") + chalk.bold(`${snap.score}`) + chalk.gray(` · ${snap.tier}`));
      console.log(chalk.gray("  Hash:  ") + chalk.white(snap.contentHash.slice(0, 24) + "…"));
      printSolscan(snap.txSignature);
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });
