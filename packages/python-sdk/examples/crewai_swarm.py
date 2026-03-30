"""
CrewAI + Kage: Multi-agent swarm with encrypted task delegation.

Prerequisites:
    pip install kage-sdk[crewai] crewai

Usage:
    export OPENAI_API_KEY=sk-...
    python crewai_swarm.py
"""

from crewai import Agent, Crew, Task

from kage.crewai_tools import get_kage_tools

KAGE_API = "http://localhost:3002"

kage_tools = get_kage_tools(base_url=KAGE_API)

researcher = Agent(
    role="Research Analyst",
    goal="Gather and store research findings securely in encrypted memory",
    backstory=(
        "You are a meticulous researcher who uses Kage's encrypted vault "
        "to store all findings. You never keep sensitive data in plaintext."
    ),
    tools=kage_tools,
    verbose=True,
)

coordinator = Agent(
    role="Task Coordinator",
    goal="Delegate tasks to other agents and track reputation",
    backstory=(
        "You coordinate work across a swarm of AI agents. "
        "You use Kage to delegate tasks with encrypted payloads "
        "and monitor agent reputation scores."
    ),
    tools=kage_tools,
    verbose=True,
)

research_task = Task(
    description=(
        "Research the current state of AI agent privacy solutions on Solana. "
        "Store your key findings in the encrypted memory vault. "
        "Then check your reputation score."
    ),
    expected_output="A summary of findings with confirmation they were stored securely.",
    agent=researcher,
)

coordination_task = Task(
    description=(
        "Review the research findings from memory. "
        "Record a successful task completion to update the reputation. "
        "List all stored memories to verify the data is persisted."
    ),
    expected_output="Confirmation of task recording and memory verification.",
    agent=coordinator,
)

crew = Crew(
    agents=[researcher, coordinator],
    tasks=[research_task, coordination_task],
    verbose=True,
)

if __name__ == "__main__":
    print("=== Kage + CrewAI Multi-Agent Swarm ===\n")
    result = crew.kickoff()
    print(f"\n=== Final Result ===\n{result}")
