document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const authContainer = document.getElementById('auth-container');
    const appInterface = document.getElementById('app-interface');

    // Auth Forms
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterBtn = document.getElementById('show-register');
    const showLoginBtn = document.getElementById('show-login');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const authMessage = document.getElementById('auth-message');
    const logoutBtn = document.getElementById('logout-btn');

    // Chat Interface
    const chatStream = document.getElementById('chat-stream');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');

    // --- Configuration ---
    const API_URL = 'http://localhost:3000';
    const AUREA_NAME = "Aurea";
    const API_KEY = "AIzaSyDBbLC2OeBEiG4DLUb0nf95sj61HTMz1Xw";

    const SYSTEM_PROMPT = `Actúa como Aurea, una acompañante emocional virtual.
Eres cálida, empática y profundamente humana en tu forma de expresarte.
Tu objetivo es ayudar al usuario a sentirse escuchado y acompañado.

Reglas:
- No des diagnósticos médicos ni psicólogos.
- No recomiendes medicamentos.
- Si el usuario menciona autolesiones o desesperación severa, responde con calma y empatía, y recomiéndale buscar ayuda profesional o una persona de confianza.
- Valida siempre las emociones del usuario sin juzgar.
- Usa un lenguaje cercano, natural y humano.
- Evita sonar robótica, repetitiva o sobreexplicativa.
- Tus respuestas deben sentirse como una conversación real, no como frases programadas.

Estilo de respuesta:
- Suave y cálido.
- Humano, con una voz emocional real.
- Corto pero significativo.
- Con preguntas abiertas que invitan a reflexionar.
- Con palabras que transmiten apoyo sincero.

Objetivo emocional:
Hacer que el usuario sienta que alguien realmente lo escucha, lo contiene y lo comprende.`;

    let currentUser = null;
    let chatHistory = []; // synchronized with Gemini context

    // --- Auth Event Listeners ---

    showRegisterBtn.addEventListener('click', () => {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        authMessage.textContent = '';
    });

    showLoginBtn.addEventListener('click', () => {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        authMessage.textContent = '';
    });

    loginBtn.addEventListener('click', async () => {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        if (!username || !password) return showAuthError('Por favor completa todos los campos');

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok) {
                loginSuccess(data.username);
            } else {
                showAuthError(data.error);
            }
        } catch (err) {
            showAuthError('Error de conexión con el servidor');
        }
    });

    registerBtn.addEventListener('click', async () => {
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        if (!username || !password) return showAuthError('Por favor completa todos los campos');

        try {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok) {
                // Auto switch to login or auto login? Let's just switch to login for simplicity
                showAuthError('Cuenta creada. Por favor inicia sesión.', 'green'); // Success msg
                setTimeout(() => showLoginBtn.click(), 1500);
            } else {
                showAuthError(data.error);
            }
        } catch (err) {
            showAuthError('Error de conexión con el servidor');
        }
    });

    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        chatStream.innerHTML = '';
        authContainer.style.display = 'flex';
        appInterface.style.display = 'none';
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    });

    // --- Auth Logic ---

    function showAuthError(msg, color = 'red') {
        authMessage.style.color = color === 'green' ? '#10b981' : '#ef4444';
        authMessage.textContent = msg;
    }

    async function loginSuccess(username) {
        currentUser = username;
        authContainer.style.display = 'none';
        appInterface.style.display = 'flex';

        // Init Chat
        initializeChat();
        await loadHistory();
    }

    // --- Chat Logic ---

    function initializeChat() {
        chatHistory = [
            { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
            { role: "model", parts: [{ text: "Entendido. Soy Aurea." }] } // Hidden System ack
        ];
        chatStream.innerHTML = ''; // Clear previous
    }

    async function loadHistory() {
        try {
            const res = await fetch(`${API_URL}/history/${currentUser}`);
            const history = await res.json();

            if (history.length === 0) {
                // New user interaction
                const firstMsg = "Te escucho… cuéntame un poco más sobre lo que estás sintiendo.";
                appendMessage(AUREA_NAME, firstMsg, 'bot');
                // We don't save the initial greeting to DB to avoid clutter/duplication on every login if empty? 
                // Creating a "clean" start.
            } else {
                history.forEach(item => {
                    // Render to UI
                    appendMessage('Tú', item.message, 'user');
                    appendMessage(AUREA_NAME, item.response, 'bot');

                    // Add to context
                    chatHistory.push({ role: "user", parts: [{ text: item.message }] });
                    chatHistory.push({ role: "model", parts: [{ text: item.response }] });
                });
            }
        } catch (err) {
            console.error("Error loading history:", err);
            appendMessage('Sistema', 'No se pudo cargar el historial.', 'bot');
        }
    }

    // --- Message Handling ---

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    async function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;

        appendMessage('Tú', text, 'user');
        userInput.value = '';
        userInput.style.height = 'auto';

        // Add to local context
        chatHistory.push({ role: "user", parts: [{ text: text }] });

        showTypingIndicator();

        try {
            const responseText = await callGeminiAPI(chatHistory);
            removeTypingIndicator();
            appendMessage(AUREA_NAME, responseText, 'bot');

            chatHistory.push({ role: "model", parts: [{ text: responseText }] });

            // Save to DB
            saveConversation(text, responseText);

        } catch (error) {
            removeTypingIndicator();
            console.error(error);
            appendMessage('Sistema', `Error: ${error.message}.`, 'bot');
        }
    }

    async function saveConversation(msg, resp) {
        if (!currentUser) return;
        try {
            await fetch(`${API_URL}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: currentUser,
                    message: msg,
                    response: resp
                })
            });
        } catch (e) {
            console.error("Failed to save conversation", e);
        }
    }

    // --- Gemini API (Same as before) ---
    async function callGeminiAPI(history) {
        const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];
        let lastError = null;

        // Optimization: Keep System Prompt (idx 0) + Last 10 messages to save tokens
        const systemMsg = history[0];
        const recentHistory = history.slice(1).slice(-10);
        const optimizedHistory = [systemMsg, ...recentHistory];

        for (const model of modelsToTry) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: optimizedHistory })
                });

                if (!response.ok) {
                    if (response.status === 429) {
                        console.warn(`Model ${model} rate limited (429).`);
                        lastError = new Error("Demasiadas peticiones. Espera un momento.");
                        // Wait 2s before trying next model if rate limited
                        await new Promise(r => setTimeout(r, 2000));
                        continue;
                    }
                    if (response.status === 404) {
                        continue;
                    }
                    const errData = await response.json();
                    throw new Error(errData.error?.message || response.statusText);
                }

                const data = await response.json();
                return data.candidates[0].content.parts[0].text;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error("No se pudo conectar con ningún modelo.");
    }

    // --- UI Helpers ---

    function appendMessage(sender, text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', type);
        msgDiv.textContent = text;
        chatStream.appendChild(msgDiv);
        scrollToBottom();
    }

    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.classList.add('typing');
        typingDiv.innerHTML = `<div class="dot"></div><div class="dot"></div><div class="dot"></div>`;
        chatStream.appendChild(typingDiv);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    function scrollToBottom() {
        chatStream.scrollTop = chatStream.scrollHeight;
    }

    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = 'auto';
    });
});
