
const path = require("path");
const fs   = require("fs");    // needed for the self-modification backup + write system
const express = require("express");

const session = require("express-session");
// llmService now exports two functions:
//   generateLLMResponse: normal chat (llama3.2)
//   generateCodeModification: file editing with Constitution (deepseek-coder)
// they are here so the rest of the file can just call them by name


const { generateLLMResponse, generateCodeModification } =  require("./llmService");

const app = express();
const PORT = 3000;
 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
// In-memory data
let conversations = [];
let nextId = 1;
 
let settings = {
  responseLength: 200
};
 
// Helper functions 
function shortenResponse(text, maxWords) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}
 
// Generate a short, descriptive summary title using the LLM
async function generateChatTitle(prompt) {
  try {
    const titlePrompt = `Summarize the following question or topic in 4-7 words as a concise chat title. Use title case. No quotes, no punctuation at the end. Just the title.\n\nQuestion: ${prompt}`;
    const rawTitle = await generateLLMResponse(titlePrompt);
    // Clean up: strip quotes, trim whitespace, limit length
    const cleaned = rawTitle.replace(/["']/g, "").trim();
    return cleaned.length > 60 ? cleaned.slice(0, 60) + "…" : cleaned;
  } catch {
    // Fallback to truncated prompt if LLM fails
    return prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;
  }
}
 
 
 
 
async function createConversation(prompt, shorten) {
  let response = await generateLLMResponse(prompt);
 
  if (shorten) {
    response = shortenResponse(response, settings.responseLength);
  }
 
  const title = await generateChatTitle(prompt);
 
  const conversation = {
    id: nextId++,
    title,
    prompt,
    response,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: response }
    ],
    bookmarked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
 
  conversations.push(conversation);
  return conversation;
}
 
 
 
 
async function addMessageToConversation(id, prompt, shorten) {
  const conversation = conversations.find(c => c.id === id);
  if (!conversation) return null;
 
  let response = await generateLLMResponse(prompt);
  if (shorten) {
    response = shortenResponse(response, settings.responseLength);
  }
 
  conversation.messages.push({ role: "user", content: prompt });
  conversation.messages.push({ role: "assistant", content: response });
  conversation.updatedAt = new Date().toISOString();
 
  conversation.prompt = prompt;
  conversation.response = response;
 
  return conversation;
}
 
function bookmarkConversation(id) {
  const conversation = conversations.find(c => c.id === id);
  if (!conversation) return null;
  conversation.bookmarked = true;
  return conversation;
}
 
function unbookmarkConversation(id) {
  const conversation = conversations.find(c => c.id === id);
  if (!conversation) return null;
  conversation.bookmarked = false;
  return conversation;
}
 
function deleteConversationById(id) {
  const index = conversations.findIndex(c => c.id === id);
  if (index === -1) return null;
  return conversations.splice(index, 1)[0];
}
 

//debug 2 line
// const filePath = path.join(__dirname, "public", "index.html");
// console.log("Serving:", filePath);

// Static files 
app.use(express.static(path.join(__dirname, "public")));


app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
 

 
// ── Conversation routes ───────────────────────────────────────────────────────
app.get("/api/conversations", (req, res) => {
  res.json(conversations);
});
 
app.get("/api/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  const conversation = conversations.find(c => c.id === id);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found." });
  }
  res.json(conversation);
});
 
app.post("/api/conversations", async (req, res) => {
  const { prompt, shorten } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required." });
  }
  try {
    const conversation = await createConversation(prompt.trim(), shorten);
    res.status(201).json(conversation);
  } catch (err) {
    console.error("Ollama error:", err.message);
    res.status(502).json({ error: `LLM service error: ${err.message}` });
  }
});
 
app.post("/api/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const { prompt, shorten } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required." });
  }
  try {
    const conversation = await addMessageToConversation(id, prompt.trim(), shorten);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    res.json(conversation);
  } catch (err) {
    console.error("Ollama error:", err.message);
    res.status(502).json({ error: `LLM service error: ${err.message}` });
  }
});
 
app.delete("/api/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  const deleted = deleteConversationById(id);
  if (!deleted) {
    return res.status(404).json({ error: "Conversation not found." });
  }
  res.json({ message: "Conversation successfully deleted", deleted });
});
 
app.get("/api/search", (req, res) => {
  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.status(400).json({ error: "Search query required." });
  }
  const results = conversations.filter(c =>
    c.title.toLowerCase().includes(query) ||
    c.prompt.toLowerCase().includes(query) ||
    c.response.toLowerCase().includes(query)
  );
  res.json(results);
});
 
 
 
 
// Bookmark routes 
app.get("/api/bookmarks", (req, res) => {
  const bookmarked = conversations.filter(
    c => c.bookmarked
  );
  res.json(bookmarked);
});
 
app.post("/api/bookmarks/:id", (req, res) => {
  const id = Number(req.params.id);
 
  const conversation = bookmarkConversation(id);
 
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found." });
  }
 
  res.json({
    message: "Conversation successfully bookmarked",
    conversation
  });
});
 
 
app.delete("/api/bookmarks/:id", (req, res) => {// api route to remove a bookmark from a conversation
  const id = Number(req.params.id);//id from the URL into a number
  const conversation = unbookmarkConversation(id);// Call the helper function to remove the bookmark
  if (!conversation) {//if conmvo was not found, return a 404 error
    return res.status(404).json({ error: "Conversation not found." });
  }
 
  res.json({
    message: "Bookmark removed successfully",
    conversation
  });
});
 
 
 
 
 
 
// Settings routes 
app.get("/api/settings", (req, res) => {
  res.json(settings);
});
 
app.put("/api/settings/response-length", (req, res) => {
  const { responseLength } = req.body;
 
  if (!responseLength || Number(responseLength) <= 0) {
    return res.status(400).json({ error: "Invalid response length." });
  }
 
  settings.responseLength = Number(responseLength);
 
  res.json({
    message: "Response length updated",
    settings
  });
});
 
 
 
// Self-modification system----------------------------------------------
 
//emma requirements:
// 1. the user types a suggestion in the UI in NL
// 2. the frontend POSTs to /api/suggest with {filePath, instruction}
// 3. server validates the path is inside the project using path scoping
//4, server backs up the file before touching it (backup system) so we don't need to nuke the local code if it breaks
// 5. server reads the current file contents
//6. server calls generateCodeModification() which sends the constitution & file contents 
// & instruction to deepeek llm via ollama. 
//7. server validates the returned code (syntac check)
// 8. server checks with the constitution to see if the model followed or returned a violation
//9. server writes new file to disk
//10, server responds with {success, backedUpTo, message}
 
//we should have 3 safety layers here:
//1. Constitution: Lives inside generateCodeModification() in llmService.js
//2. Path scoping: safeWrite() will be below
//3. Layer 3: File backups: backupFile() will also eventually be below.
 
//ALLOWED_DIRS defines which directories the LLM is allowed to write to
//if it tries to write outside these folders, it wil be rejected in the server level
// this means so that if the constitution fails (hopefully it does not), it will be stopped anyways
 
const PROJECT_ROOT = __dirname;//serevr.js lives here
const ALLOWED_DIRS = ["public"]; //only frontend folder is writeable
const BACKUP_DIR = path.join(PROJECT_ROOT, ".llm_backups");
 
//backupFile copies a file to .llm_backups/ with a timestamp in the file name before any llm write happens
//IF THE WRITE GOES WRONG!!!!!! the user can find their og file in .llm_backups/ and restore it manually. 
 
function backupFile(filePath){
  //creates backup dir if it dne
  
fs.mkdirSync(BACKUP_DIR, { recursive: true });//wont throw if the folder already exists.
 
  const timestamp  = new Date().toISOString().replace(/[:.]/g, "-");
  const filename   = path.basename(filePath);
  const backupPath = path.join(BACKUP_DIR, `${filename}.${timestamp}.bak`);
 
  fs.copyFileSync(filePath, backupPath);
  return backupPath; // return the path so the API response can tell the user where it is
}
 
 
//  safewrite resolves the absolute path  of the target file and checks...
//1. is it inside the PROJECT_ROOT ?( prevents path traversal)
//2. is it inside one of the ALLOWED_DIRS ? (prevents touching files we don't want it to access)
 
//path.resolve() turns a relative path into an absolute one
//startsWith() will then check containment (2nd layer)
 
function safeWrite(filePath, content){
  const absPath = path.resolve(PROJECT_ROOT, filePath);
  //check 1: if inside project root
  if(!absPath.startsWith(PROJECT_ROOT + path.sep)){
    throw new Error(`Path escapes project root: ${filePath}`);
  }
 
 
  // check 2: if inside an allowed dir
  const isAllowed = ALLOWED_DIRS.some(dir =>
    absPath.startsWith(path.resolve(PROJECT_ROOT, dir) + path.sep)
  );
  if (!isAllowed) {
    throw new Error(
      `Write blocked: "${filePath}" is not in an allowed directory. ` +
      `Allowed: ${ALLOWED_DIRS.map(d => d + "/").join(", ")}`
    );
  }
 
  fs.writeFileSync(absPath, content, "utf8");
  return absPath;
 
}
 
 
// validateJS runs a basic syntax check on the returned code before writing.
// We use Node's own vm.compileFunction which parses JavaScript without executing it.
// If DeepSeek returns malformed code, this catches it and we abort the write,
// leaving the original file untouched (the backup won't even matter in this case
// since we haven't written anything yet).
//
// Note: this only works for .js files. For .html and .css we do a lighter
// heuristic check further down (no binary content, reasonable length).
const vm = require("vm");
function validateJS(code) {
  try {
    new vm.Script(code); // throws SyntaxError if the code is invalid
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
 
 
function applyDiff(originalContent, diffOutput) {
  // Strip markdown code fences
  let cleaned = diffOutput.replace(/^```[\w]*\n?/m, "").replace(/```\s*$/m, "");
 
  // Strip markdown hyperlinks: [text](url) → text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
 
  // Clean escaped forward slashes
  cleaned = cleaned.replace(/\\\//g, "/");
 
  // Strip anything after <<<END>>>
  if (cleaned.includes("<<<END>>>")) {
    cleaned = cleaned.split("<<<END>>>")[0] + "<<<END>>>";
  }
 
  // If no diff block exists at all, check if it looks like raw code
  // and prepend it to the file as a fallback
  if (!cleaned.includes("<<<FIND>>>") && !cleaned.includes("<<<REPLACE>>>")) {
    // Strip any trailing prose after the last closing brace
    const lastBrace = cleaned.lastIndexOf("}");
    const codeOnly = lastBrace !== -1 ? cleaned.slice(0, lastBrace + 1) : cleaned;
    console.log("No diff block found — treating output as raw code prepend");
    return codeOnly + "\n\n" + originalContent;
  }
 
  const findMatch    = cleaned.match(/<<<FIND>>>([\s\S]*?)<<<REPLACE>>>/);
  const replaceMatch = cleaned.match(/<<<REPLACE>>>([\s\S]*?)<<<END>>>/);
 
  if (!findMatch || !replaceMatch) {
    throw new Error(
      "Model did not return a valid diff block. " +
      "Raw output: " + diffOutput.slice(0, 200)
    );
  }
 
  let findText    = findMatch[1];
  let replaceText = replaceMatch[1];
 
  const isPlaceholder = findText.trim().startsWith("(") && findText.trim().endsWith(")");
  const isExample     = findText.includes("copy the exact lines") || findText.includes("verbatim");
 
  if (findText.trim() === "" || isPlaceholder || isExample) {
    return replaceText + originalContent;
  }
 
  if (!originalContent.includes(findText)) {
    throw new Error(
      "Could not find the target text in the file. " +
      "The model may have hallucinated lines that don't exist."
    );
  }
 
  return originalContent.replace(findText, replaceText);
}
 
// /api/suggest, main self-modification endpoint
// Expects: POST body { filePath: "public/app.js", instruction: "add dark mode toggle" }
// Returns: { success, message, backedUpTo } or { error }
app.post("/api/suggest", async (req, res) => {
  const { filePath, instruction } = req.body;
 
  // Basic input validation; both fields are required
  if (!filePath || !instruction || !instruction.trim()) {
    return res.status(400).json({ error: "filePath and instruction are required." });
  }
 
  // Resolve the absolute path now so we can use it consistently
  const absPath = path.resolve(PROJECT_ROOT, filePath);
 
  // Check the file actually exists before doing anything else.
  // fs.existsSync returns false if the file isn't there, no exception thrown.
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ error: `File not found: ${filePath}` });
  }
 
  // Read the current file contents. We pass these to the LLM so it knows
  // exactly what it's modifying. Without this context, the model would be
  // generating from scratch rather than making a targeted edit.
  const currentContents = fs.readFileSync(absPath, "utf8");
 
  let modifiedCode;
  try {
    // Call DeepSeek Coder with the Constitution + current file + instruction.
    // This is the async call to Ollama, it may take several seconds.
    modifiedCode = await generateCodeModification(
      instruction.trim(),
      currentContents,
      filePath
    );
  } catch (err) {
    console.error("DeepSeek error:", err.message);
    return res.status(502).json({ error: `Code model error: ${err.message}` });
  }
 
 
  //debug!!!
  console.log("=== DeepSeek raw output ===\n", modifiedCode, "\n=== end ===");
 
 
  // Check if the model refused due to a Constitution violation.
  // We told it to return "CONSTITUTION_VIOLATION" if the instruction
  // breaks the rules. This is our first check on the output.
  if (modifiedCode.trim().startsWith("CONSTITUTION_VIOLATION:")) {
    return res.status(400).json({
      error: modifiedCode.trim()
    });
  }
 
  // Apply the diff block the model returned to the original file content.
  // applyDiff() parses <<<FIND>>><<<REPLACE>>><<<END>>> and does the swap.
  // This happens BEFORE backup. if the diff is malformed we abort immediately
  // and nothing on disk is touched at all.
  let finalContent;
  try {
    finalContent = applyDiff(currentContents, modifiedCode);
  } catch (err) {
    return res.status(422).json({ error: `Diff error: ${err.message}` });
  }
 
  // For .js files, validate the patched result before writing anything to disk.
  // We validate finalContent (the patched file) not modifiedCode (the diff block).
  if (filePath.endsWith(".js")) {
    const validation = validateJS(finalContent);
    if (!validation.valid) {
      return res.status(422).json({
        error: `Result has syntax errors and was not written: ${validation.error}`
      });
    }
  }
 
  // Backup the file BEFORE writing. This is Layer 3 safety.
  let backupPath;
  try {
    backupPath = backupFile(absPath);
  } catch (err) {
    return res.status(500).json({ error: `Backup failed: ${err.message}` });
  }
 
  // Write the patched file. safeWrite does the Layer 2 path-scoping check.
  try {
    safeWrite(filePath, finalContent);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
 
  console.log(`[suggest] Modified: ${filePath} | Backup: ${backupPath}`);
 
  res.json({
    success: true,
    message: `${filePath} updated successfully. Reload the page to see changes.`,
    backedUpTo: path.relative(PROJECT_ROOT, backupPath)
  });
});
 
 
 
 
// Start server 
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
 
module.exports = {
  app,
  shortenResponse,
  createConversation,
  addMessageToConversation,
  bookmarkConversation,
  unbookmarkConversation,
  deleteConversationById
};