#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import { storeCommand } from "./commands/store.js";
import { recallCommand } from "./commands/recall.js";
import { chatCommand } from "./commands/chat.js";
import { didCommand } from "./commands/did.js";
import { reputationCommand } from "./commands/reputation.js";
import { configCommand } from "./commands/config.js";

console.log(chalk.bold.white("\n  影  KAGE") + chalk.gray(" · Privacy-first AI Agent CLI\n"));

program
  .name("kage")
  .description("Privacy-first AI agent with encrypted memory, DID, and on-chain reputation")
  .version("0.1.0");

program.addCommand(chatCommand);
program.addCommand(storeCommand);
program.addCommand(recallCommand);
program.addCommand(didCommand);
program.addCommand(reputationCommand);
program.addCommand(configCommand);

program.addHelpText("after", `
${chalk.bold("Examples:")}
  ${chalk.cyan("kage chat")}                           Interactive chat session
  ${chalk.cyan("kage chat --deep-think")}              Chat with Extended Thinking
  ${chalk.cyan('kage store "my trading alpha"')}       Encrypt & store a memory
  ${chalk.cyan('kage recall "trading"')}               Recall memories by keyword
  ${chalk.cyan("kage recall")}                         List all memories
  ${chalk.cyan("kage did show")}                       Show agent DID document
  ${chalk.cyan('kage did issue did:sol:xxx AgentCapability \'{"level":"trusted"}\'')}
  ${chalk.cyan("kage reputation show")}                View score and tier
  ${chalk.cyan("kage reputation record success -d 'Completed task'")}
  ${chalk.cyan("kage reputation snapshot")}            Anchor score on-chain
  ${chalk.cyan("kage config show")}                    View current config
  ${chalk.cyan("kage config set rpcUrl https://...")}  Update RPC endpoint

${chalk.bold("Environment:")}
  ${chalk.yellow("ANTHROPIC_API_KEY")}  Required — your Anthropic API key
  ${chalk.yellow("SOLANA_RPC_URL")}     Optional — custom RPC (default: devnet)
`);

program.parse(process.argv);
