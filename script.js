const API_URL = "https://api.groq.com/openai/v1/chat/completions";
// REPLACE THIS WITH YOUR REAL GROQ API KEY FROM https://console.groq.com/keys
const GROQ_API_KEY = "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";

let conversationHistory = [];
let currentChatId = null;
const CHATS_KEY = "auralis_chats";

// Safe localStorage handling
function getChats() {
    try {
        const raw = localStorage.getItem(CHATS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn("Corrupted chats data – resetting");
        localStorage.removeItem(CHATS_KEY);
        return [];
    }
}

function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function detectIntent(query) {
    const res = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: "Classify intent as exactly one of: code_request, text_request, other. Reply only the label." },
                { role: "user", content: query }
            ],
            max_tokens: 5,
            temperature: 0
        })
    });

    if (!res.ok) return "other";
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "other";
}

async function query(intent) {
    let systemPrompt = "";
    if (intent === "code_request") {
        systemPrompt = "You are a coding assistant. Always use clean markdown code blocks.";
    } else if (intent === "text_request") {
        systemPrompt = "You are a writing assistant. Respond clearly and professionally.";
    } else {
        systemPrompt = "You are Auralis, a kind and helpful assistant.";
    }

    const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory
    ];

    const res = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: messages,
            max_tokens: 3000,
            temperature: 0.7
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Groq API error: ${res.status} – ${err}`);
    }
    return await res.json();
}

function loadChats() {
    const chats = getChats();
    const list = document.getElementById("chat-list");
    list.innerHTML = "";
    chats.forEach((chat, i) => {
        const div = document.createElement("div");
        div.className = "chat-item" + (currentChatId === chat.id ? " active" : "");
        div.textContent = chat.title || `Chat ${i + 1}`;
        div.onclick = () => loadChat(chat.id);
        list.appendChild(div);
    });
}

function saveChat() {
    if (!currentChatId || conversationHistory.length === 0) return;
    let chats = getChats();
    const idx = chats.findIndex(c => c.id === currentChatId);
    const title = conversationHistory.find(m => m.role === "user")?.content.slice(0, 40) + "..." || "New Chat";
    const payload = { id: currentChatId, title, history: conversationHistory };
    if (idx === -1) chats.push(payload);
    else chats[idx] = payload;
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    loadChats();
}

function newChat() {
    currentChatId = Date.now().toString();
    conversationHistory = [];
    document.getElementById("chat-box").innerHTML = `
      <div class="welcome">
        <img src="images/mascot.png" alt="Auralis">
        <h2>Hello, I'm Auralis</h2>
        <p>Your gentle AI companion powered by Groq. Ask me anything.</p>
      </div>`;
    loadChats();
    toggleSidebar(false);
}

function loadChat(id) {
    const chat = getChats().find(c => c.id === id);
    if (!chat) return;
    currentChatId = id;
    conversationHistory = chat.history;
    renderMessages();
    loadChats();
    toggleSidebar(false);
}

function renderMessages() {
    const box = document.getElementById("chat-box");
    box.innerHTML = "";
    conversationHistory.forEach(msg => {
        if (msg.role === "user" || msg.role === "assistant") {
            const div = document.createElement("div");
            div.className = `message ${msg.role === "user" ? "user" : "bot"}`;
            if (msg.role === "user") {
                div.innerHTML = `<pre>${escapeHtml(msg.content)}</pre>`;
            } else {
                div.innerHTML = DOMPurify.sanitize(marked.parse(msg.content));
            }
            box.appendChild(div);
        }
    });
    box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById("user-input");
    const userMessage = input.value.trim();
    if (!userMessage || userMessage.length > 5000) return;

    if (!currentChatId) newChat();
    document.querySelector(".welcome")?.remove();

    // User message
    const userDiv = document.createElement("div");
    userDiv.className = "message user";
    userDiv.innerHTML = `<pre>${escapeHtml(userMessage)}</pre>`;
    document.getElementById("chat-box").appendChild(userDiv);

    conversationHistory.push({ role: "user", content: userMessage });
    input.value = ""; input.style.height = "auto";

    // Thinking...
    const thinking = document.createElement("div");
    thinking.className = "message bot";
    thinking.textContent = "Thinking...";
    document.getElementById("chat-box").appendChild(thinking);
    document.getElementById("chat-box").scrollTop = document.getElementById("chat-box").scrollHeight;

    try {
        const intent = await detectIntent(userMessage);
        const result = await query(intent);

        thinking.remove();
        const botDiv = document.createElement("div");
        botDiv.className = "message bot";
        const text = result.choices?.[0]?.message?.content || "No response.";
        botDiv.innerHTML = DOMPurify.sanitize(marked.parse(text));
        conversationHistory.push({ role: "assistant", content: text });
        document.getElementById("chat-box").appendChild(botDiv);
        saveChat();
    } catch (e) {
        console.error(e);
        thinking.remove();
        const err = document.createElement("div");
        err.className = "message bot error";
        err.textContent = "Sorry, something went wrong. Check console for details.";
        document.getElementById("chat-box").appendChild(err);
    }
    document.getElementById("chat-box").scrollTop = document.getElementById("chat-box").scrollHeight;
}

// Enter to send
document.getElementById("user-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize textarea
document.getElementById("user-input").addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
});

function toggleSidebar(force) {
    document.getElementById("sidebar").classList.toggle("open", force);
}

// Init
newChat();
loadChats();

// === CONTEXT MENU FOR DELETING CHATS ===
let contextMenu = null;
let contextTargetChatId = null;

function createContextMenu(x, y) {
    // Remove any existing menu
    if (contextMenu) contextMenu.remove();

    contextMenu = document.createElement("div");
    contextMenu.innerHTML = `
      <div class="context-item" id="delete-chat">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z"/>
        </svg>
        Delete Chat
      </div>
    `;
    Object.assign(contextMenu.style, {
        position: "fixed",
        top: `${y}px`,
        left: `${x}px`,
        background: "rgba(20, 35, 32, 0.95)",
        backdropFilter: "blur(16px)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "8px 0",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
        zIndex: 1000,
        fontSize: "14px",
        minWidth: "160px",
        color: "var(--text)",
        animation: "fadeIn 0.2s ease-out"
    });

    // Style for menu items
    const style = document.createElement("style");
    style.textContent = `
      .context-item {
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .context-item:hover {
        background: rgba(100, 230, 150, 0.2);
      }
      .context-item svg {
        stroke: #ff6b6b;
      }
      #delete-chat:hover {
        color: #ff6b6b;
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(contextMenu);

    // Delete action
    document.getElementById("delete-chat").onclick = () => {
        deleteChat(contextTargetChatId);
        closeContextMenu();
    };

    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener("click", closeContextMenu);
        document.addEventListener("contextmenu", closeContextMenu);
    }, 0);
}

function closeContextMenu() {
    if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
    }
    document.removeEventListener("click", closeContextMenu);
    document.removeEventListener("contextmenu", closeContextMenu);
}

function deleteChat(chatId) {
    if (!chatId) return;

    let chats = getChats();
    chats = chats.filter(c => c.id !== chatId);
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));

    // If deleting current chat, start a new one
    if (currentChatId === chatId) {
        newChat();
    } else {
        loadChats(); // Just refresh sidebar
    }
}

// Modify loadChats() to add right-click support
function loadChats() {
    const chats = getChats();
    const list = document.getElementById("chat-list");
    list.innerHTML = "";
    chats.forEach((chat, i) => {
        const div = document.createElement("div");
        div.className = "chat-item" + (currentChatId === chat.id ? " active" : "");
        div.textContent = chat.title || `Chat ${i + 1}`;

        // Left click: load chat
        div.onclick = (e) => {
            if (e.button === 0) { // Left click only
                loadChat(chat.id);
            }
        };

        // Right click: show context menu
        div.oncontextmenu = (e) => {
            e.preventDefault();
            contextTargetChatId = chat.id;
            createContextMenu(e.pageX, e.pageY);
        };

        // Optional: long press on mobile
        let pressTimer;
        div.addEventListener("touchstart", (e) => {
            pressTimer = setTimeout(() => {
                contextTargetChatId = chat.id;
                createContextMenu(e.touches[0].pageX, e.touches[0].pageY);
            }, 600);
        });
        div.addEventListener("touchend", () => clearTimeout(pressTimer));
        div.addEventListener("touchmove", () => clearTimeout(pressTimer));

        list.appendChild(div);
    });
}

// Also close menu when pressing Escape
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeContextMenu();
});

// Init stays the same
newChat();
loadChats();
