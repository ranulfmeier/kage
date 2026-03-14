import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as readline from "readline";
import { loadAgent, printSolscan } from "../utils.js";

export const chatCommand = new Command("chat")
  .description("Start an interactive chat session with your Kage agent")
  .option("--deep-think", "Enable Extended Thinking (claude-3-7-sonnet, slower but deeper)", false)
  .action(async (opts: { deepThink: boolean }) => {
    const spinner = ora("Initializing Kage agent…").start();
    let agent: Awaited<ReturnType<typeof loadAgent>>["agent"];
    try {
      ({ agent } = await loadAgent());
      spinner.succeed(chalk.green("Agent ready"));
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${(err as Error).message}`));
      process.exit(1);
    }

    console.log(chalk.gray("\n  Type your message and press Enter. Ctrl+C to exit."));
    if (opts.deepThink) {
      console.log(chalk.magenta("  🧠 Deep Think mode ON"));
    }
    console.log(chalk.gray("  Commands: /memories · /clear · /did · /reputation · /exit\n"));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const prompt = () => {
      rl.question(chalk.bold("you › "), async (input) => {
        const text = input.trim();
        if (!text) return prompt();

        if (text === "/exit") {
          console.log(chalk.gray("\n  Goodbye.\n"));
          rl.close();
          process.exit(0);
        }

        if (text === "/clear") {
          agent.clearHistory();
          console.log(chalk.gray("  Conversation cleared.\n"));
          return prompt();
        }

        if (text === "/memories") {
          const mems = await agent.listMemories();
          if (mems.length === 0) {
            console.log(chalk.gray("  No memories stored yet.\n"));
          } else {
            mems.slice(0, 10).forEach((m, i) => {
              console.log(chalk.gray(`  [${i + 1}] ${m.cid.slice(0, 16)}… · ${m.memoryType} · ${new Date(m.createdAt).toLocaleTimeString()}`));
            });
            console.log();
          }
          return prompt();
        }

        if (text === "/did") {
          const doc = agent.getSelfDIDDocument();
          if (doc) {
            console.log(chalk.gray("  DID: ") + chalk.cyan(agent.getSelfDID()));
            console.log(chalk.gray("  Tier: ") + chalk.white(doc.kage.agentType));
            console.log(chalk.gray("  Caps: ") + chalk.white(doc.kage.capabilities.join(", ")));
            console.log();
          }
          return prompt();
        }

        if (text === "/reputation") {
          const rep = agent.getSelfReputation();
          if (rep) {
            const bar = "█".repeat(Math.floor(rep.score / 50)) + "░".repeat(20 - Math.floor(rep.score / 50));
            console.log(chalk.gray("  Score: ") + chalk.bold(`${rep.score}/1000`) + chalk.gray(` [${bar}] ${rep.tier.toUpperCase()}`));
            console.log(chalk.gray(`  Tasks: ${rep.totalTasks} total · ${rep.successfulTasks} success · ${rep.failedTasks} fail · ${rep.slashCount} slashed`));
            console.log();
          }
          return prompt();
        }

        const thinkSpinner = ora({ text: chalk.gray("thinking…"), color: "gray" }).start();
        try {
          const response = await agent.chat(text, opts.deepThink);
          thinkSpinner.stop();

          if (response.reasoningSteps && response.reasoningSteps.length > 0) {
            console.log(chalk.gray("\n  reasoning:"));
            response.reasoningSteps.forEach((s, i) => {
              console.log(chalk.gray(`    ${i + 1}. ${s.replace(/^\d+[\.\)]\s*/, "")}`));
            });
          }

          console.log("\n" + chalk.bold("kage › ") + chalk.white(response.text));

          if (response.proof) {
            printSolscan(response.proof.txSignature);
          }
          if (response.reasoning) {
            console.log(
              chalk.gray(`  🔒 reasoning: ${response.reasoning.charCount} chars encrypted · hash: ${response.reasoning.contentHash.slice(0, 16)}…`)
            );
          }
          console.log();
        } catch (err) {
          thinkSpinner.fail(chalk.red(`Error: ${(err as Error).message}`));
        }
        prompt();
      });
    };

    prompt();
  });
