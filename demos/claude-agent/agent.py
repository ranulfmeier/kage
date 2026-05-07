"""
Kage + Claude Demo — Privacy-first AI agent with encrypted memory & ZK proofs.

This demo shows a LangChain agent powered by Claude that:
  1. Stores sensitive data in an encrypted vault (AES-256-GCM)
  2. Recalls memories with natural language queries
  3. Creates ZK commitments to prove data integrity
  4. Manages on-chain reputation and verifiable credentials

Prerequisites:
    pip install kage-sdk[langchain] langchain-anthropic

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python agent.py
"""

import os
import sys

from langchain_anthropic import ChatAnthropic
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

from kage.langchain import get_kage_tools

KAGE_API = os.getenv("KAGE_API_URL", "https://kageapi-production.up.railway.app")

def main():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    llm = ChatAnthropic(model="claude-haiku-4-5-20241022", temperature=0)
    tools = get_kage_tools(base_url=KAGE_API)

    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You are a Kage agent — a privacy-first AI running on Solana.\n"
         "You have an encrypted memory vault, ZK proof engine, and on-chain reputation.\n\n"
         "Rules:\n"
         "- Always use tools to store/recall data. Never keep secrets in plaintext.\n"
         "- When asked to remember something, store it in the vault.\n"
         "- When asked about past data, recall from encrypted memory.\n"
         "- Report your DID and reputation when asked about identity.\n"
         "- Be concise and precise."),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

    print("=" * 60)
    print("  Kage + Claude Demo Agent")
    print(f"  API: {KAGE_API}")
    print("=" * 60)

    steps = [
        ("Step 1: Store encrypted memory",
         "Remember this: API key for project Alpha is prod_k8s_9f2x. "
         "This is highly sensitive — store it securely."),

        ("Step 2: Store another memory",
         "Store this research finding: Solana TPS averaged 4,200 in Q1 2026 "
         "with 99.7% uptime. Mark it as a research note."),

        ("Step 3: Recall from vault",
         "What do you know about project Alpha?"),

        ("Step 4: Check identity & reputation",
         "What is my agent identity? Show my DID and reputation score."),

        ("Step 5: Record task completion",
         "Record that I successfully completed a security audit task."),

        ("Step 6: Issue a credential",
         "Issue a verifiable credential to did:sol:DemoAgent certifying "
         "'SecurityAudit' capability with level 'advanced'."),
    ]

    for title, query in steps:
        print(f"\n{'─' * 60}")
        print(f"  {title}")
        print(f"{'─' * 60}")
        result = executor.invoke({"input": query})
        print(f"\n→ {result['output']}")

    print(f"\n{'=' * 60}")
    print("  Demo complete. All data encrypted & on-chain.")
    print("=" * 60)


if __name__ == "__main__":
    main()
