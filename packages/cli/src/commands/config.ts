import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, saveConfig, KEYPAIR_PATH, CONFIG_PATH, loadOrCreateKeypair } from "../utils.js";

export const configCommand = new Command("config")
  .description("View or update CLI configuration");

configCommand
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(chalk.gray("\n  Config file: ") + chalk.white(CONFIG_PATH));
    console.log(chalk.gray("  Keypair:     ") + chalk.white(KEYPAIR_PATH));
    console.log(chalk.gray("  RPC URL:     ") + chalk.cyan(config.rpcUrl));
    console.log(chalk.gray("  Program ID:  ") + chalk.white(config.programId));
    console.log(chalk.gray("  Network:     ") + chalk.white(config.network));
    console.log(chalk.gray("  Model:       ") + chalk.white(config.model));
    console.log(chalk.gray("  Storage:     ") + (config.storageBackend === "arweave" ? chalk.green("arweave (permanent)") : chalk.white("memory (dev)")));
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    console.log(chalk.gray("  API Key:     ") + (hasApiKey ? chalk.green("set ✓") : chalk.red("not set ✗")));
    console.log();
  });

configCommand
  .command("set <key> <value>")
  .description("Set a config value (rpcUrl|network|model|programId)")
  .action((key: string, value: string) => {
    const allowed = ["rpcUrl", "network", "model", "programId"];
    if (!allowed.includes(key)) {
      console.error(chalk.red(`  Unknown key: ${key}`));
      console.error(chalk.gray(`  Allowed: ${allowed.join(", ")}`));
      process.exit(1);
    }
    saveConfig({ [key]: value } as never);
    console.log(chalk.green(`\n  ✓ ${key} = ${value}\n`));
  });

configCommand
  .command("keypair")
  .description("Show or generate the agent keypair")
  .option("--generate", "Force generate a new keypair", false)
  .action((opts: { generate: boolean }) => {
    if (opts.generate) {
      const { existsSync, unlinkSync } = require("fs");
      if (existsSync(KEYPAIR_PATH)) unlinkSync(KEYPAIR_PATH);
      console.log(chalk.yellow("\n  Generating new keypair…"));
    }
    const kp = loadOrCreateKeypair();
    console.log(chalk.gray("\n  Public key: ") + chalk.cyan(kp.publicKey.toBase58()));
    console.log(chalk.gray("  Path:       ") + chalk.white(KEYPAIR_PATH));
    console.log(chalk.gray("  ") + chalk.red("Keep your keypair file safe — never share it!\n"));
  });
