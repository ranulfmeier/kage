"""
Kage + CrewAI Demo — Multi-agent swarm with encrypted coordination.

Three agents collaborate on a security research mission:
  - Scout: Gathers intelligence, stores findings in encrypted vault
  - Analyst: Recalls data, issues credentials, builds reputation
  - Commander: Delegates tasks, manages team vault, records outcomes

Prerequisites:
    pip install kage-sdk[crewai] crewai crewai-tools

Usage:
    export OPENAI_API_KEY=sk-...
    python swarm.py
"""

import os
import sys

from crewai import Agent, Crew, Task, Process

from kage.crewai_tools import get_kage_tools

KAGE_API = os.getenv("KAGE_API_URL", "https://kageapi-production.up.railway.app")


def main():
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY not set")
        sys.exit(1)

    tools = get_kage_tools(base_url=KAGE_API)

    scout = Agent(
        role="Intelligence Scout",
        goal="Gather sensitive information and store it securely in Kage's encrypted vault",
        backstory=(
            "You are a field intelligence agent. Your job is to collect critical data "
            "and immediately encrypt it using Kage's memory vault. You never leave "
            "sensitive information in plaintext. After storing data, you verify it "
            "was saved by listing memories."
        ),
        tools=tools,
        verbose=True,
    )

    analyst = Agent(
        role="Security Analyst",
        goal="Analyze stored intelligence, verify data integrity, and issue credentials",
        backstory=(
            "You are a senior analyst who reviews encrypted intelligence from the vault. "
            "You recall stored memories, cross-reference findings, and issue verifiable "
            "credentials to agents who produce quality work. You also track reputation."
        ),
        tools=tools,
        verbose=True,
    )

    commander = Agent(
        role="Mission Commander",
        goal="Coordinate the team, delegate tasks, and record mission outcomes",
        backstory=(
            "You lead the operation. You delegate tasks to other agents using Kage's "
            "shielded delegation system. After the mission, you record task outcomes "
            "to update each agent's on-chain reputation score."
        ),
        tools=tools,
        verbose=True,
    )

    gather_intel = Task(
        description=(
            "Collect the following intelligence and store each item in Kage's encrypted vault:\n"
            "1. 'Target network uses Solana validators in 3 regions: US-East, EU-West, APAC'\n"
            "2. 'Observed 847 unique wallet addresses interacting with the protocol'\n"
            "After storing, list all memories to confirm data is persisted."
        ),
        expected_output=(
            "Confirmation that both intelligence items are stored in the encrypted vault, "
            "with a list of all current memories."
        ),
        agent=scout,
    )

    analyze_data = Task(
        description=(
            "Recall the intelligence stored by the Scout. Analyze the findings and:\n"
            "1. Check the agent's current reputation score\n"
            "2. Get the agent's DID identity\n"
            "3. Issue a 'FieldIntelligence' credential to did:sol:ScoutAgent "
            "with claim: {quality: 'verified', coverage: 'comprehensive'}"
        ),
        expected_output=(
            "Analysis summary with reputation score, DID identity, "
            "and confirmation of the issued credential."
        ),
        agent=analyst,
    )

    coordinate_mission = Task(
        description=(
            "As mission commander, finalize the operation:\n"
            "1. Record a successful task outcome with description 'Multi-agent intelligence operation completed'\n"
            "2. Check the final reputation score\n"
            "3. Store a mission summary in encrypted memory: "
            "'Operation Kage Demo: 2 agents, 2 intel items collected, 1 credential issued. Status: SUCCESS'"
        ),
        expected_output=(
            "Mission summary with updated reputation and confirmation "
            "that the mission report is securely stored."
        ),
        agent=commander,
    )

    crew = Crew(
        agents=[scout, analyst, commander],
        tasks=[gather_intel, analyze_data, coordinate_mission],
        process=Process.sequential,
        verbose=True,
    )

    print("=" * 60)
    print("  Kage + CrewAI Multi-Agent Swarm")
    print(f"  API: {KAGE_API}")
    print(f"  Agents: Scout → Analyst → Commander")
    print("=" * 60)

    result = crew.kickoff()

    print(f"\n{'=' * 60}")
    print("  Mission Complete")
    print("=" * 60)
    print(f"\n{result}")


if __name__ == "__main__":
    main()
