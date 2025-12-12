require('dotenv').config();
const express = require('express');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname)));

// Fallback for root to ensure index.html is served if static fails matching or for explicit root request
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'), (err) => {
        if (err) {
            console.error("Error serving index.html:", err);
            res.status(500).send("Error loading app: " + err.message);
        }
    });
});

// Database Setup
// Database Setup
// Use :memory: for Vercel/Serverless if no external DB provided to prevent "Right-only file system" errors.
const tursoUrl = process.env.TURSO_DATABASE_URL || 'file::memory:';
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let db;
try {
    db = createClient({
        url: tursoUrl,
        authToken: tursoToken,
    });
    console.log(`Database client initialized. URL: ${tursoUrl}`);
} catch (err) {
    console.error("Failed to initialize database client:", err);
    // Fallback? If db is undefined, routes will crash.
    // We should probably assign a mock or ensure it's handled.
    db = { execute: async () => ({ rows: [] }) }; // Mock to prevent crash
}

// Helper to create tables
async function createTables() {
    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            message TEXT,
            response TEXT,
            FOREIGN KEY(username) REFERENCES users(username)
        )`);
        console.log("Tables ensured.");
    } catch (e) {
        console.error("Error creating tables:", e);
    }
}

createTables();

// Routes

// Register
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute({
            sql: `INSERT INTO users (username, password) VALUES (?, ?)`,
            args: [username, hashedPassword]
        });
        res.json({ message: 'Usuario creado exitosamente' });
    } catch (e) {
        // Check for unique constraint violation
        if (e.message && e.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }
        res.status(500).json({ error: 'Error del servidor: ' + e.message });
    }
});

// Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.execute({
            sql: `SELECT * FROM users WHERE username = ?`,
            args: [username]
        });

        const user = result.rows[0];

        if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (validPassword) {
            res.json({ message: 'Login exitoso', username: user.username });
        } else {
            res.status(400).json({ error: 'Contraseña incorrecta' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Error de base de datos' });
    }
});

// Save Conversation
app.post('/log', async (req, res) => {
    const { username, message, response } = req.body;
    try {
        await db.execute({
            sql: `INSERT INTO conversations (username, message, response) VALUES (?, ?, ?)`,
            args: [username, message, response]
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get History
app.get('/history/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const result = await db.execute({
            sql: `SELECT message, response FROM conversations WHERE username = ? ORDER BY timestamp ASC`,
            args: [username]
        });
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
