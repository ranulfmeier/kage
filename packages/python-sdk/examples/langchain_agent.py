"""
LangChain + Kage: AI agent with encrypted memory and ZK proofs.

Prerequisites:
    pip install kage-sdk[langchain] langchain-openai

Usage:
    export OPENAI_API_KEY=sk-...
    python langchain_agent.py
"""

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

from kage.langchain import get_kage_tools

KAGE_API = "http://localhost:3002"

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

tools = get_kage_tools(base_url=KAGE_API)

prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a privacy-aware AI agent powered by Kage. "
     "You can store and recall encrypted memories, delegate tasks to other agents, "
     "manage your reputation, and issue verifiable credentials. "
     "Always use your tools when the user asks you to remember something or check your history."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

if __name__ == "__main__":
    print("=== Kage + LangChain Agent ===\n")

    result = executor.invoke({"input": "Remember that my preferred trading pair is SOL/USDC"})
    print(f"\n> {result['output']}\n")

    result = executor.invoke({"input": "What are my preferences?"})
    print(f"\n> {result['output']}\n")

    result = executor.invoke({"input": "What is my current reputation score?"})
    print(f"\n> {result['output']}\n")

    result = executor.invoke({"input": "Record that I successfully completed a data analysis task"})
    print(f"\n> {result['output']}\n")
