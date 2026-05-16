# RASMUS
## Reactive AI Self Modifying User System

Reactive/Real-Time/Recursive??? Unsure which R haha

Named after [Rasmus](https://comicsinfo.dk/rasmus.htm), a book I grew up loving about a mischievous ostrich!

**Author:** Emma Zafrir

## Project Description
RASMUS is a web-based interface for interacting with a simulated LLM system.

It features a self-modification system where RASMUS can rewrite its own frontend code based on the user's natural language instruction. 

## Features
- Multi-model routing: Conversation queries route towards Ollama 3.2 while code modification requests get sent to DeepSeek Coder. 
- Self-modification pipeline: Users can describe UI changes in natural language, then the system reads the relevant source file, passes it to DeepSeek Coder along with the Constitution, validates the output, and writes the patch to the disk for it to be updated!
- 3-layered safety architecture: (1) Constitution (system prompt) constraining LLM behavior; (2) server-side path scoping that blocks writes outside allowed dirs; (3) automatically generated timestamped file backups before every write to the disk.
- Diff-based code editing: model returns structured blocks instead of a full file regeneration. 
- User system: A general purpose LLM interface for chatting and experimenting.

## How to Run the Project
1. Install Ollama if not already downloaded: https://ollama.com/download

   ollama pull llama3.2

   ollama pull deepseek-coder:6.7b
2. Clone the repository:

   git clone https://github.com/ezafrir/RASMUS.git
3. Navigate into the project folder:

   cd RASMUS-main
4. Install dependencies by entering:

   npm install

   npm install express
5. Start the server by entering:

   npm start
6. Open the application in a browser: http://localhost:3000

