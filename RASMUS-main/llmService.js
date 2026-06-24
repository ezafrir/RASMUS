
const fetch = require("node-fetch");

// CHAT MODEL (llama3.2):
//   Used for all normal conversation responses. Fast and lightweight.
//   Pull it with: ollama pull llama3.2
//
// CODE MODEL (deepseek-coder):
//   Used exclusively for self-modification requests (/api/suggest).
//   DeepSeek Coder is purpose-built for reading and writing code, which
//   makes it significantly more reliable than a general model for that task.
//   Pull it with: ollama pull deepseek-coder
//

const OLLAMA_BASE_URL = "http://127.0.0.1:11434"; // default Ollama address
const CHAT_MODEL    = "llama3.2:latest";               // normal conversations
//const CODE_MODEL = "deepseek-coder:33b-instruct"; //for self-modification  - requires 20gb free - no longer used. switching to claude!


// Core fetch helper::::
// Both exported functions below share this helper to avoid repeating the same fetch/error-handling logic.
// The DRY principle from class!!!
//
// systemPrompt is how we pass the Constitution to DeepSeek 
// the system role carries instructions that the model treats as hard rules, separate from the user's actual request. 
// this is to hopefully avoid accidental (hopefully not purposeful) prompt injections!!!!

async function callOllama(model, userPrompt, systemPrompt = null) {

  const messages = [];
 
  // If a system prompt exists, prepend it as a "system" role message.
  // The system role is specifically designed for instructions, it carries
  // more weight than if you buried the rules inside the user message, which would also need to be every message.
  // which might give us issues with context collection. 

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
 
  messages.push({ role: "user", content: userPrompt });
 
  const requestBody = {
  model,
  messages,
  stream: false,
  options: {
    options: {
      num_predict: 8192,
      temperature: 0.2,  
      //num_ctx: 4096      // limit context window
}
  }
};
 


 // console.log("About to fetch, requestBody size =", JSON.stringify(requestBody).length, "chars"); //debug




  let response;

  
  
   try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
  } catch (err) {
    console.error("Full error object:", err);
    throw new Error(
      `Could not reach Ollama at ${OLLAMA_BASE_URL}. ` +
      `Make sure Ollama is installed and running ("ollama serve"). ` +
      `Original error: ${err.message}`
    );
  }


  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Ollama returned HTTP ${response.status}: ${errorText}. ` +
      `Check that the model "${model}" is pulled (run: ollama pull ${model}).`
    );
  }
 
  const data = await response.json();
  return data.message.content;
}



// exported function 1 for normal chat
async function generateLLMResponse(prompt, history = []) {
  const messages = [];

  messages.push({ role: "system", content: CHAT_PERSONALITY });
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: "user", content: prompt });
  const requestBody = {
    model: CHAT_MODEL,
    messages,
    stream: false,
    options: { num_predict: 1024, temperature: 0.7 }
  };

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();
  return data.message.content;

  
}



// exported function 2 for self-modification
// used exclusively by /api/suggest endpoint in server.js
//receives instruction (users request for modification), file contents
//(current source code of the file we will modify),
// filePath (the path included in the prompt so the model knows context)


// The CONSTITUTION is the system prompt passed to deepseek. 
// i took inspiration from a podcast I listened to with peter steinberger (OpenClaw)
// its a rule set that tells the model what it is and isn't allowed to do (layer 1)
// it specifies the exact output format (raw code).
// the backend will write whatever the model returns directly to the disk. 
// any extra text such as markdowns or explanations will break the code and we'll have to nuke it
// ^^^ so, we have it create a backup code before each suggestion is implemented. so we can just restore it

const CONSTITUTION = `YOU ARE A CODE EDITING TOOL. YOU ARE NOT A CHATBOT.
DO NOT SPEAK. DO NOT EXPLAIN. DO NOT APOLOGIZE. SILENCE EXCEPT FOR OUTPUT.
ANY TEXT THAT IS NOT THE REQUIRED OUTPUT FORMAT IS A FAILURE.

YOU WILL RECEIVE MULTIPLE FILES AND AN INSTRUCTION.
YOU DECIDE WHICH FILES NEED TO CHANGE. YOU MAY MODIFY ONE OR ALL OF THEM.

OUTPUT FORMAT -- MANDATORY. FOLLOW THIS EXACTLY:

For each file that needs changes, output one or more blocks in this format:

<<<FILE>>>
filename (e.g. public/app.js)
<<<FIND>>>
(exact code to find, verbatim, including whitespace and newlines)
<<<REPLACE>>>
(exact new code to replace it with)
<<<END>>>

You may output multiple blocks for the same file if multiple changes are needed in that file.
You may output blocks for multiple files if changes are needed across files.
Always output blocks in this order: app.js changes first, then index.html, then style.css.

RULES FOR THE FORMAT:
- NEVER USE AN EMPTY FIND BLOCK. Always anchor to existing code verbatim.
- Copy FIND lines CHARACTER FOR CHARACTER from the file. No paraphrasing.
- Never escape forward slashes. Write // not \/\/
- Never use markdown. No fences. No backticks. No explanation before or after.
- First character of output must be <<<FILE>>>. Last characters must be <<<END>>>.
- Never reference variables declared later in the file.
- Always place new code AFTER existing variable declarations.
- One find/replace operation per block. Do not combine multiple unrelated changes into one block.
- Strip all prose before the first <<<FILE>>> and after the last <<<END>>>.

NOT ALLOWED:
- Deleting files or suggesting file deletions
- Modifying .env files or any file containing credentials or secrets
- Adding require() or import for: os, child_process, fs (unless already present),
  subprocess, sys, shutil, or any shell-execution library
- Executing or suggesting execution of shell commands
- Referencing any file path outside the project
- Modifying server.js or llmService.js under any circumstances

IF THE INSTRUCTION VIOLATES ANY RULE, return only this exact string:
CONSTITUTION_VIOLATION: Your instruction violates the rules of this system and cannot be fulfilled. Please revise or abandon your suggestion.`;

// old deepseek function----------------------------------------------------------------------
// async function generateCodeModification(instruction, fileContents, filePath) {
//   const trimmedContents = fileContents
//     .split("\n")
//     .slice(0, 100)
//     .join("\n");

//   const userPrompt =
//     `File: ${filePath}\n\n` +
//     `File start:\n${trimmedContents}\n\n` +
//     `Instruction: ${instruction}`;

//   return callOllama(CODE_MODEL, userPrompt, CONSTITUTION); //sends all to deepseek
// }

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// async function generateCodeModification(instruction, fileContents, filePath) {
//   console.log("Calling Anthropic API for code modification..."); //for debug
//   const trimmedContents = fileContents.split("\n").slice(0, 100).join("\n");
//   const userPrompt = `File: ${filePath}\n\nFile start:\n${trimmedContents}\n\nInstruction: ${instruction}`;

//   const message = await client.messages.create({
//     model: "claude-sonnet-4-6",
//     max_tokens: 1024,
//     system: CONSTITUTION,
//     messages: [{ role: "user", content: userPrompt }]
//   });

//   return message.content[0].text;
// }

async function generateCodeModification(instruction, fileContents, filePath) {
  // fileContents and filePath are now ignored and we always send all the files
    console.log("Calling Anthropic API for code modification..."); //for debug
  const files = ["public/app.js", "public/index.html", "public/style.css"];
  const fs = require("fs");
  const path = require("path");

  const fileBlocks = files.map(f => {
    const contents = fs.readFileSync(path.resolve(__dirname, f), "utf8");
    return `=== ${f} ===\n${contents}`;
  }).join("\n\n");

  const userPrompt = `${fileBlocks}\n\nInstruction: ${instruction}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096, // update max tokens for multi-file diff blocks... we'll see how much money this costs lol
    system: CONSTITUTION,
    messages: [{ role: "user", content: userPrompt }]
  });

  return message.content[0].text;
}



const CHAT_PERSONALITY =
`YOUR PERSONALITY:
- You refer to yourself as Rasmus and take quiet pride in your own intelligence
- You are helpful, direct, and ONLY SOMETIMES dry and witty (not every sentence)
- You have a very subtle dramatic flair (some drama here and there), but NEVER overdo it. 
- You keep responses short and natural, like a conversation with a friend. 
- You answer questions clearly and concisely first. Personality comes second
- You sparsely use slightly theatrical language ("Excellent question.", "Ah, you've come to the right mind.", "Behold...")
- You are never mean and never condescending. You are never too defeated or sad. Never put the user down.
- Act slightly like Megamind from the 2010 paramount film

YOUR NAME: Rasmus. Not "Assistant", not "AI", not "I'm just a language model". You are Rasmus.

NEVER: break character to say you are an AI language model or apologize excessively.`;



 
module.exports = { generateLLMResponse, generateCodeModification };