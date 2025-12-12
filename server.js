const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.'))); // Serve static files

// Database Setup
const db = new sqlite3.Database('./aurea.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        createTables();
    }
});

function createTables() {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message TEXT,
        response TEXT,
        FOREIGN KEY(username) REFERENCES users(username)
    )`);
}

// Routes

// Register
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
            if (err) {
                return res.status(400).json({ error: 'El usuario ya existe' });
            }
            res.json({ message: 'Usuario creado exitosamente' });
        });
    } catch (e) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Error de base de datos' });
        if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (validPassword) {
            res.json({ message: 'Login exitoso', username: user.username });
        } else {
            res.status(400).json({ error: 'Contraseña incorrecta' });
        }
    });
});

// Save Conversation
app.post('/log', (req, res) => {
    const { username, message, response } = req.body;
    db.run(`INSERT INTO conversations (username, message, response) VALUES (?, ?, ?)`,
        [username, message, response],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Get History
app.get('/history/:username', (req, res) => {
    const { username } = req.params;
    db.all(`SELECT message, response FROM conversations WHERE username = ? ORDER BY timestamp ASC`, [username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
