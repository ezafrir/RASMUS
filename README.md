# RASMUS
## Recursive AI Self Modifying User System

Named after [Rasmus](https://comicsinfo.dk/rasmus.htm), a book I grew up loving about a mischievous ostrich!

**Author:** Emma Zafrir

## Project Description
RASMUS is a web-based interface for interacting with a simulated LLM system.

It features a self-modification system where RASMUS can rewrite its own UI based on how the user thinks! 

## Features
- Cognitive style adaptation: Passively logs interaction signals (keyword patterns, phrasing) to infer sequential vs. global processing style. When a leaning threshold is crossed, RASMUS autonomously triggers a UI modification via the self-modification pipeline!
- Multi-file self-modification pipeline: Users can describe UI changes in natural language. RASMUS sends all 3 frontend files to Claude Sonnet as context along with the Constitution, receives structured multi-file diff blocks, validates the outputs, and writes the patch to the disk for it to be updated!
- Multi-model routing: Conversation queries route to Llama 3.2 (local via Ollama); code modification requests route to Claude Sonnet (Anthropic API).
- 3-layered safety architecture: (1) Constitution (system prompt) constraining LLM behavior; (2) server-side path scoping that blocks writes outside allowed dirs; (3) automatically generated timestamped file backups before every write to the disk.
- Diff-based code editing: model returns structured blocks instead of a full file regeneration. 


## How to Run the Project
1. Install Ollama if not already downloaded: https://ollama.com/download

   ollama pull llama3.2

   ollama pull deepseek-coder:6.7b
2. Add your Anthropic API key to a `.env` file in the project root:

   ANTHROPIC_API_KEY=sk-ant-...
3. Clone the repository:

   git clone https://github.com/ezafrir/RASMUS.git
3. Navigate into the project folder:

   cd RASMUS-main
4. Install dependencies by entering:

   npm install

   npm install express
5. Start the server by entering:

   npm start
6. Open the application in a browser: http://localhost:3000

