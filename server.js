const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const WebSocket = require('ws');
const sanitizeHtml = require('sanitize-html');
const ChessCtor = require('chess.js').Chess;
const Stockfish = require('stockfish');
const { createHumanChessAI } = require('./human-like-chess-ai');

// Config (mirrors config.py defaults)
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 12000;
const ADMINNAME = 'admin';
const ADMINHIDDENNAME = 'adminxyz';

// Human-like AI bot cache (game_id -> bot instance)
const aiBotsCache = new Map();

// Create a human-like AI bot for a game
async function createAIBotForGame(board, aiElo) {
  try {
    const bot = await createHumanChessAI({
      mode: 'api',
      apiUrl: 'https://chess-api.com/v1',
      elo: aiElo,
      contempt: 10,
      multipv: 3,
      book: null, // we use our own opening book via the existing system
      maxBookPlies: 0
    });

    // Create game adapter that wraps the Chess board
    const gameAdapter = {
      fen: () => board.fen(),
      move: (move) => {
        if (typeof move === 'string') {
          return board.move(move);
        } else if (move && typeof move === 'object') {
          return board.move({ from: move.from, to: move.to, promotion: move.promotion });
        }
        return null;
      },
      moves: (options) => board.moves(options),
      turn: () => board.turn(),
      in_check: () => board.in_check(),
      history: () => board.history()
    };

    bot.bindGame(gameAdapter);
    return bot;
  } catch (err) {
    console.error('[ai] Failed to create human-like bot:', err.message);
    return null;
  }
}

// Opening book
let openingsBook = { openings: [] };
try {
  const openingsPath = path.join(__dirname, 'openings.json');
  if (fs.existsSync(openingsPath)) {
    openingsBook = JSON.parse(fs.readFileSync(openingsPath, 'utf8'));
    console.log('[openings] Loaded', openingsBook.openings.length, 'opening variations');
  }
} catch (err) {
  console.warn('[openings] Failed to load opening book:', err.message);
}

// Persistence
const DATA_DIR = path.join(__dirname, 'data');
const MSG_FILE = path.join(DATA_DIR, 'messages.jsonl');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'user-settings.json');
const ONLINE_HISTORY_FILE = path.join(DATA_DIR, 'online-history.json');
fs.mkdirSync(DATA_DIR, { recursive: true });


let idx = 0; // next message id
let messages = []; // array of message objects {type:'message', message, username, id, datetime}
let knownUsers = new Set(); // all-time seen users (current canonical usernames)
let userSettings = {}; // username -> {confirmMoves, premoveEnabled, selectedBoard, selectedPieces}

function loadMessages() {
  if (!fs.existsSync(MSG_FILE)) return;
  const lines = fs.readFileSync(MSG_FILE, 'utf8').split('\n').filter(Boolean);
  const seenIds = new Set(); // Track seen message IDs to prevent duplicates
  let duplicateCount = 0;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj.id === 'number') {
        // Skip if we've already seen this message ID (prevents duplicates)
        if (seenIds.has(obj.id)) {
          console.log('[warn] Skipping duplicate message ID:', obj.id);
          duplicateCount++;
          continue;
        }
        seenIds.add(obj.id);
        messages.push(obj);
        idx = Math.max(idx, obj.id + 1);
      }
    } catch (_) {}
  }

  // If duplicates were found, rewrite the file to clean it up
  if (duplicateCount > 0) {
    console.log(`[cleanup] Found and removing ${duplicateCount} duplicate messages from file`);
    const cleanedLines = messages.map(m => JSON.stringify(m)).join('\n');
    fs.writeFile(MSG_FILE, cleanedLines + (cleanedLines.length > 0 ? '\n' : ''), (err) => {
      if (err) console.error('[error] Failed to clean up messages file:', err.message);
      else console.log('[cleanup] Messages file cleaned');
    });
  }
}

function appendMessage(obj) {
  fs.appendFile(MSG_FILE, JSON.stringify(obj) + '\n', () => {});
}

function loadKnownUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(arr)) arr.forEach((u) => { if (typeof u === 'string' && u) knownUsers.add(u); });
    }
  } catch (_) {}
}

function persistKnownUsers() {
  try { fs.writeFile(USERS_FILE, JSON.stringify(Array.from(knownUsers)), () => {}); } catch(_) {}
}

function loadUserSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (typeof data === 'object' && data !== null) {
        userSettings = data;
      }
    }
  } catch (_) {}
}

function persistUserSettings() {
  try { fs.writeFile(SETTINGS_FILE, JSON.stringify(userSettings, null, 2), () => {}); } catch(_) {}
}

function getUserSettings(username) {
  if (!username) return null;
  return userSettings[username] || null;
}

function saveUserSettings(username, settings) {
  if (!username || typeof settings !== 'object') return false;
  userSettings[username] = settings;
  persistUserSettings();
  return true;
}

// Online History
let onlineHistory = {}; // username -> Array<{action: 'online'|'offline', timestamp: number, time: string}>

function loadOnlineHistory() {
  try {
    if (fs.existsSync(ONLINE_HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(ONLINE_HISTORY_FILE, 'utf8'));
      if (typeof data === 'object' && data !== null) {
        onlineHistory = data;
      }
    }
  } catch (_) {}
}

function persistOnlineHistory() {
  try { fs.writeFile(ONLINE_HISTORY_FILE, JSON.stringify(onlineHistory, null, 2), () => {}); } catch(_) {}
}

function recordOnlineEvent(username, action) {
  if (!username || !['online', 'offline'].includes(action)) return;
  if (!onlineHistory[username]) {
    onlineHistory[username] = [];
  }
  const timestamp = Math.floor(now());
  const date = new Date(timestamp * 1000);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const time = `${hours}:${minutes}`;
  onlineHistory[username].push({ action, timestamp, time });
  persistOnlineHistory();
}

// ELO Rating System
const ELO_FILE = path.join(DATA_DIR, 'user-elo.json');
const STARTING_ELO = 1200;
const K_FACTOR = 32; // Standard K-factor for rating adjustments

let userElos = {}; // username -> { elo: number, gamesPlayed: number, winRate: number }

function loadUserElos() {
  try {
    if (fs.existsSync(ELO_FILE)) {
      const data = JSON.parse(fs.readFileSync(ELO_FILE, 'utf8'));
      if (typeof data === 'object' && data !== null) {
        userElos = data;
      }
    }
  } catch (_) {}
}

function persistUserElos() {
  try { fs.writeFile(ELO_FILE, JSON.stringify(userElos, null, 2), () => {}); } catch(_) {}
}

function getUserElo(username) {
  if (!username) return null;
  if (!userElos[username]) {
    userElos[username] = { elo: STARTING_ELO, gamesPlayed: 0, wins: 0 };
    persistUserElos();
  }
  return userElos[username];
}

function calculateExpectedScore(playerElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function updatePlayerElo(username, opponentElo, result) {
  // result: 1 for win, 0.5 for draw, 0 for loss
  const playerData = getUserElo(username);
  const expected = calculateExpectedScore(playerData.elo, opponentElo);
  const eloChange = Math.round(K_FACTOR * (result - expected));

  playerData.elo = Math.max(100, playerData.elo + eloChange);
  playerData.gamesPlayed = (playerData.gamesPlayed || 0) + 1;

  if (result === 1) {
    playerData.wins = (playerData.wins || 0) + 1;
  } else if (result === 0.5) {
    playerData.draws = (playerData.draws || 0) + 1;
  }

  persistUserElos();
  return { newElo: playerData.elo, eloChange, playerData };
}

// IP Ban System
const IP_BANS_FILE = path.join(DATA_DIR, 'ip-bans.json');
let ipBans = {}; // ip -> { reason: string, createdAt: number, createdBy: string, expiresAt?: number }

function loadIpBans() {
  try {
    if (fs.existsSync(IP_BANS_FILE)) {
      const data = JSON.parse(fs.readFileSync(IP_BANS_FILE, 'utf8'));
      if (typeof data === 'object' && data !== null) {
        ipBans = data;
      }
    }
  } catch (_) {}
}

function persistIpBans() {
  try { fs.writeFile(IP_BANS_FILE, JSON.stringify(ipBans, null, 2), () => {}); } catch(_) {}
}

function isIpBanned(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const ban = ipBans[ip];
  if (!ban) return false;
  if (ban.expiresAt && ban.expiresAt < Date.now()) {
    delete ipBans[ip];
    persistIpBans();
    return false;
  }
  return true;
}

function banIp(ip, reason = 'No reason specified', adminName = 'System') {
  if (!ip || typeof ip !== 'string') return false;
  ipBans[ip] = {
    reason: String(reason || '').slice(0, 500),
    createdAt: Date.now(),
    createdBy: String(adminName || 'System').slice(0, 50)
  };
  persistIpBans();
  console.log(`[ban] IP ${ip} banned by ${adminName}: ${reason}`);
  return true;
}

function unbanIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  if (ipBans[ip]) {
    delete ipBans[ip];
    persistIpBans();
    console.log(`[ban] IP ${ip} unbanned`);
    return true;
  }
  return false;
}

function getBannedIps() {
  const now = Date.now();
  const result = {};
  for (const [ip, ban] of Object.entries(ipBans)) {
    if (ban.expiresAt && ban.expiresAt < now) {
      delete ipBans[ip];
    } else {
      result[ip] = ban;
    }
  }
  if (Object.keys(result).length !== Object.keys(ipBans).length) {
    persistIpBans();
  }
  return result;
}

// User Timeout System
let userTimeouts = {}; // username -> { until: timestamp, reason?: string }

function isUserTimedOut(username) {
  if (!username || typeof username !== 'string') return false;
  const timeout = userTimeouts[username];
  if (!timeout) return false;
  if (timeout.until && timeout.until < Date.now()) {
    delete userTimeouts[username];
    return false;
  }
  return true;
}

function getTimeoutRemaining(username) {
  if (!username || typeof username !== 'string') return 0;
  const timeout = userTimeouts[username];
  if (!timeout || !timeout.until) return 0;
  const remaining = timeout.until - Date.now();
  return remaining > 0 ? remaining : 0;
}

function timeoutUser(username, durationMs, reason = 'Timed out by admin') {
  if (!username || typeof username !== 'string') return false;
  userTimeouts[username] = {
    until: Date.now() + durationMs,
    reason: String(reason || 'No reason').slice(0, 200)
  };
  console.log(`[timeout] User ${username} timed out for ${durationMs}ms: ${reason}`);
  return true;
}

function clearUserTimeout(username) {
  if (!username || typeof username !== 'string') return false;
  if (userTimeouts[username]) {
    delete userTimeouts[username];
    console.log(`[timeout] Timeout cleared for user ${username}`);
    return true;
  }
  return false;
}

function getActiveTimeouts() {
  const now = Date.now();
  const result = {};
  for (const [username, timeout] of Object.entries(userTimeouts)) {
    if (timeout.until && timeout.until >= now) {
      result[username] = timeout;
    } else {
      delete userTimeouts[username];
    }
  }
  return result;
}

loadMessages();
loadKnownUsers();
loadUserSettings();
loadUserElos();
loadOnlineHistory();
loadIpBans();

// Server
const app = express();
app.use(express.json());
// Allow CORS for API endpoints so clients opened from file:// or other origins can call /api
app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/blank', (req, res) => {
  try {
    const blankPath = path.join(__dirname, 'blank.html');
    res.sendFile(blankPath);
  } catch (err) {
    console.error('[blank] Error serving file:', err);
    res.status(500).send('Error loading blank page');
  }
});

app.get('/game-wrapper', (req, res) => {
  try {
    const wrapperPath = path.join(__dirname, 'game-wrapper.html');
    res.sendFile(wrapperPath);
  } catch (err) {
    console.error('[game-wrapper] Error serving file:', err);
    res.status(500).send('Error loading game wrapper');
  }
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/games', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/chess', (req, res) => {
  res.sendFile(path.join(__dirname, 'chess.html'));
});

// Serve static files BEFORE the catch-all route
app.use(express.static(path.join(__dirname)));

app.get('/:gameName', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/popsound.mp3', (req, res) => {
  res.sendFile(path.join(__dirname, 'popsound.mp3'));
});

// Serve board images with CDN fallback
app.get('/boards/:boardName/:size.png', (req, res) => {
  const { boardName, size } = req.params;
  const localPath = path.join(__dirname, 'boards', boardName, `${size}.png`);

  if (fs.existsSync(localPath)) {
    res.sendFile(localPath);
  } else {
    const cdnUrl = `https://images.chesscomfiles.com/chess-themes/boards/${boardName}/${size}.png`;
    res.redirect(cdnUrl);
  }
});

// Serve piece images with CDN fallback
app.get('/pieces/:pieceName/:color/:type.png', (req, res) => {
  const { pieceName, color, type } = req.params;
  const localPath = path.join(__dirname, 'pieces', pieceName, color, `${type}.png`);

  if (fs.existsSync(localPath)) {
    res.sendFile(localPath);
  } else {
    const cdnUrl = `https://images.chesscomfiles.com/chess-themes/pieces/${pieceName}/${color}/${type}.png`;
    res.redirect(cdnUrl);
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// User Settings API endpoints
app.get('/api/settings/:username', (req, res) => {
  const username = String(req.params.username || '').trim();
  if (!username) {
    return res.status(400).json({ error: 'username required' });
  }
  const settings = getUserSettings(username);
  if (settings) {
    return res.json(settings);
  } else {
    return res.json(null);
  }
});

app.post('/api/settings/:username', (req, res) => {
  const username = String(req.params.username || '').trim();
  if (!username) {
    return res.status(400).json({ error: 'username required' });
  }
  const settings = req.body;
  if (typeof settings !== 'object' || settings === null) {
    return res.status(400).json({ error: 'settings must be an object' });
  }
  saveUserSettings(username, settings);
  return res.json({ success: true });
});

// ELO Rating API endpoints
app.get('/api/elo/:username', (req, res) => {
  const username = String(req.params.username || '').trim();
  if (!username) {
    return res.status(400).json({ error: 'username required' });
  }
  const eloData = getUserElo(username);
  return res.json(eloData);
});

app.post('/api/elo/:username/update', (req, res) => {
  const username = String(req.params.username || '').trim();
  const opponentElo = Number(req.body && req.body.opponentElo || 0);
  const result = Number(req.body && req.body.result || 0);

  if (!username) {
    return res.status(400).json({ error: 'username required' });
  }
  if (opponentElo <= 0) {
    return res.status(400).json({ error: 'opponentElo required and must be positive' });
  }
  if (![0, 0.5, 1].includes(result)) {
    return res.status(400).json({ error: 'result must be 0 (loss), 0.5 (draw), or 1 (win)' });
  }

  const updateResult = updatePlayerElo(username, opponentElo, result);
  return res.json({
    success: true,
    newElo: updateResult.newElo,
    eloChange: updateResult.eloChange,
    playerData: updateResult.playerData
  });
});

app.post('/api/chess/game/end', (req, res) => {
  const username = String(req.body && req.body.username || '').trim();
  const result = String(req.body && req.body.result || '').trim();
  const opponentElo = Number(req.body && req.body.opponentElo || 1600);

  if (!username) {
    return res.status(400).json({ error: 'username required' });
  }
  if (!['1-0', '0-1', '1/2-1/2'].includes(result)) {
    return res.status(400).json({ error: 'result must be 1-0, 0-1, or 1/2-1/2' });
  }

  let playerResult;
  if (result === '1-0') {
    playerResult = 1;
  } else if (result === '0-1') {
    playerResult = 0;
  } else {
    playerResult = 0.5;
  }

  const updateResult = updatePlayerElo(username, opponentElo, playerResult);
  return res.json({
    success: true,
    newElo: updateResult.newElo,
    eloChange: updateResult.eloChange,
    playerData: updateResult.playerData
  });
});

function eloToDepth(elo) {
  const rating = Number(elo) || 600;

  const eloDepthMap = [
    { elo: 600, depth: 6 },
    { elo: 750, depth: 7 },
    { elo: 900, depth: 8 },
    { elo: 1050, depth: 9 },
    { elo: 1200, depth: 10 },
    { elo: 1350, depth: 11 },
    { elo: 1500, depth: 12 },
    { elo: 1650, depth: 13 },
    { elo: 1800, depth: 14 },
    { elo: 1950, depth: 15 },
    { elo: 2100, depth: 16 },
    { elo: 2250, depth: 17 },
    { elo: 2400, depth: 18 }
  ];

  if (rating <= eloDepthMap[0].elo) return eloDepthMap[0].depth;
  if (rating >= eloDepthMap[eloDepthMap.length - 1].elo) return eloDepthMap[eloDepthMap.length - 1].depth;

  for (let i = 0; i < eloDepthMap.length - 1; i++) {
    if (rating >= eloDepthMap[i].elo && rating <= eloDepthMap[i + 1].elo) {
      const lower = eloDepthMap[i];
      const upper = eloDepthMap[i + 1];
      const ratio = (rating - lower.elo) / (upper.elo - lower.elo);
      return Math.round(lower.depth + (upper.depth - lower.depth) * ratio);
    }
  }

  return 8;
}

let stockfishEngine = null;
let stockfishInitPromise = null;

async function initStockfishEngine() {
  if (stockfishEngine === false) {
    return null; // Already tried and failed
  }

  if (stockfishEngine) {
    console.log('[stockfish] Engine already initialized');
    return stockfishEngine;
  }

  if (stockfishInitPromise) {
    console.log('[stockfish] Waiting for initialization in progress');
    return stockfishInitPromise;
  }

  stockfishInitPromise = (async () => {
    try {
      console.log('[stockfish] Initializing Stockfish WASM engine...');

      const engine = Stockfish();

      if (!engine || typeof engine.postMessage !== 'function') {
        console.warn('[stockfish] Engine does not support postMessage, skipping WASM');
        stockfishEngine = false;
        return null;
      }

      stockfishEngine = new Promise((resolve, reject) => {
        let isReady = false;

        engine.onmessage = (message) => {
          if (message === 'uciok') {
            isReady = true;
            console.log('[stockfish] Engine initialized');
          }
        };

        engine.onerror = (err) => {
          console.error('[stockfish] Engine error:', err);
          reject(err);
        };

        try {
          engine.postMessage('uci');
        } catch (err) {
          console.error('[stockfish] Error sending uci command:', err);
          reject(err);
        }

        setTimeout(() => {
          resolve(engine);
        }, 1000);
      });

      return await stockfishEngine;

    } catch (err) {
      console.error('[stockfish] WASM initialization failed:', err.message);
      stockfishEngine = false; // Mark as failed
      stockfishInitPromise = null;
      return null;
    }
  })();

  return stockfishInitPromise;
}

async function getMoveChessAPI(fen, depth, elo) {
  try {
    console.log('[chess-api] Requesting move from Chess-API.com for depth', depth);

    const url = 'https://chess-api.com/v1';

    // Use AbortController for proper timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ fen })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn('[chess-api] API returned status:', response.status);
        return null;
      }

      const data = await response.json();
      console.log('[chess-api] API response:', JSON.stringify(data).substring(0, 200));

      if (data && data.bestmove && typeof data.bestmove === 'string') {
        const move = data.bestmove;
        if (move.length >= 4) {
          console.log('[chess-api] Best move:', move);
          return move;
        }
      }

      console.warn('[chess-api] No valid moves in response');
      return null;

    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        console.warn('[chess-api] API request timed out');
      } else {
        console.error('[chess-api] API fetch error:', fetchErr.message);
      }
      return null;
    }

  } catch (err) {
    console.error('[chess-api] API error:', err.message);
    return null;
  }
}

function getOpeningMove(fen, elo) {
  const chess = new ChessCtor();
  try { chess.load(fen); } catch (_) { return null; }

  // Calculate moveCount from FEN because chess.history() is empty when loading a FEN
  // FEN format: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  // The fullmove number is the last field (1-indexed)
  const fenParts = fen.split(' ');
  const fullmoveNumber = parseInt(fenParts[5] || '1', 10);
  const isWhiteToMove = fenParts[1] === 'w';
  // Calculate halfmoves: (fullmove - 1) * 2 + (0 if white, 1 if black)
  const moveCount = Math.max(0, (fullmoveNumber - 1) * 2 + (isWhiteToMove ? 0 : 1));

  const MAX_OPENING_MOVES = 40; // 15-20 moves total = 30-40 half-moves

  // Only use opening book for early game
  if (moveCount > MAX_OPENING_MOVES) {
    return null;
  }

  // Get all applicable openings for this ELO
  // Match ELO range: include openings for this ELO level and lower (stronger players know more openings)
  const applicableOpenings = openingsBook.openings.filter(opening => {
    if (!opening.elo || opening.elo.length === 0) return false;
    const minElo = Math.min(...opening.elo);
    return elo >= minElo;
  }).sort((a, b) => {
    // Prefer openings closest to player's ELO
    const aMin = Math.min(...a.elo);
    const bMin = Math.min(...b.elo);
    return Math.abs(elo - aMin) - Math.abs(elo - bMin);
  });

  if (applicableOpenings.length === 0) {
    return null;
  }

  // Find openings that match current position
  for (const opening of applicableOpenings) {
    if (!opening.moves || opening.moves.length === 0) continue;

    // Check if this opening's moves match our current position
    const testChess = new ChessCtor();
    let matches = true;

    for (let i = 0; i < Math.min(moveCount, opening.moves.length); i++) {
      const moveStr = opening.moves[i];
      if (moveStr.length < 4) {
        matches = false;
        break;
      }

      const from = moveStr.substring(0, 2);
      const to = moveStr.substring(2, 4);
      const promotion = moveStr.length > 4 ? moveStr[4] : null;

      const moveSpec = { from, to };
      if (promotion) moveSpec.promotion = promotion;

      try {
        const move = testChess.move(moveSpec);
        if (!move) {
          matches = false;
          break;
        }
      } catch (_) {
        matches = false;
        break;
      }
    }

    if (!matches) continue;

    // This opening matches. Is there a next move?
    if (moveCount < opening.moves.length) {
      const nextMove = opening.moves[moveCount];
      if (nextMove && nextMove.length >= 4) {
        console.log('[openings] Using', opening.name, 'move', (moveCount / 2).toFixed(1), ':', nextMove);
        return nextMove;
      }
    }
  }

  return null;
}

async function bestMoveWithStockfish(fen, depth, elo) {
  // Try opening book first
  console.log('[ai] Checking opening book for move');
  const openingMove = getOpeningMove(fen, elo);
  if (openingMove && openingMove.length >= 4) {
    console.log('[ai] Opening book move found:', openingMove);
    return openingMove;
  }

  // Try Chess-API.com
  console.log('[ai] Attempting Chess-API.com for move generation');
  const chessApiMove = await getMoveChessAPI(fen, depth, elo);
  if (chessApiMove && chessApiMove.length >= 4) {
    return chessApiMove; // Success with Chess-API
  }

  // Chess-API.com failed, use improved fallback algorithm
  console.log('[ai] Chess-API.com failed, using local fallback algorithm');
  return bestMoveFallback(fen, depth, elo);
}

function boardOpennessFromChess(chess) {
  const fen = chess.fen();
  const placement = (fen || '').split(' ')[0] || '';
  const rows = placement.split('/');
  const files = Array.from({ length: 8 }, () => 0);
  for (let r = 0; r < rows.length; r++) {
    let file = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else {
        if (ch.toLowerCase() === 'p') files[file]++;
        file++;
      }
    }
  }
  const openFiles = files.filter(c => c === 0).length;
  return openFiles / 8; // 0..1
}

function evaluateBoardPositional(chess, elo = 1600) {
  // Base piece values; may be adjusted per elo and position openness
  const baseValues = { p: 100, n: 300, b: 360, r: 500, q: 900, k: 0 };
  const board = chess.board();
  const openness = boardOpennessFromChess(chess);

  // If elo > 1200 treat knight and bishop base values equally; their
  // effectiveness will be modulated by openness (closed -> knight, open -> bishop)
  let values = { ...baseValues };
  if (Number(elo) > 1200) {
    const equal = Math.round((baseValues.n + baseValues.b) / 2);
    values.n = equal;
    values.b = equal;
  }

  let score = 0;
  let whiteAttacks = new Set();
  let blackAttacks = new Set();

  // Piece-square tables for better positional evaluation
  const pawnTable = {
    w: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    b: [0,0,0,0,0,0,0,0, 5,10,10,-20,-20,10,10,5, 5,-5,-10,0,0,-10,-5,5, 0,0,0,20,20,0,0,0, 5,5,10,25,25,10,5,5, 10,10,20,30,30,20,10,10, 50,50,50,50,50,50,50,50, 0,0,0,0,0,0,0,0]
  };

  const knightTable = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ];

  const kingEarlyTable = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
  ];

  // Calculate attacks for both sides
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (!piece) continue;

      // Temporarily get piece moves to identify attacked squares
      const tempChess = new ChessCtor();
      tempChess.load(chess.fen());
      const pieceMoves = tempChess.moves({ square: String.fromCharCode(97+j) + (8-i), verbose: true });
      const attackSet = piece.color === 'w' ? whiteAttacks : blackAttacks;
      pieceMoves.forEach(m => attackSet.add(m.to));
    }
  }

  // Material and positional scoring
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (!piece) continue;

      const v = values[piece.type] || 0;
      let posBonus = 0;
      const sqIndex = i * 8 + j;

      if (piece.type === 'p') {
        // Use pawn table
        posBonus = pawnTable[piece.color][piece.color === 'w' ? sqIndex : 63 - sqIndex];
      } else if (piece.type === 'n') {
        // Use knight table
        posBonus = knightTable[piece.color === 'w' ? sqIndex : 63 - sqIndex];
        // Closed positions favor knights for elo > 1200
        if (Number(elo) > 1200) {
          if (openness < 0.4) posBonus += Math.round((1 - openness) * 30);
        }
      } else if (piece.type === 'b') {
        // Bishops prefer long diagonals and center
        const distToCenter = Math.abs(3.5 - j) + Math.abs(3.5 - i);
        posBonus = (7 - distToCenter) * 3;
        // Open positions favor bishops for elo > 1200
        if (Number(elo) > 1200) {
          if (openness > 0.4) posBonus += Math.round(openness * 30);
        }
      } else if (piece.type === 'r') {
        // Rooks on 7th rank are strong
        if ((piece.color === 'w' && i === 1) || (piece.color === 'b' && i === 6)) {
          posBonus = 50;
        }
        // Rooks on open files
        let isOpenFile = true;
        for (let fi = 0; fi < 8; fi++) {
          if (board[fi][j] && board[fi][j].type === 'p') {
            isOpenFile = false;
            break;
          }
        }
        if (isOpenFile) posBonus += 20;
      } else if (piece.type === 'q') {
        // Queen prefers center
        const distToCenter = Math.abs(3.5 - j) + Math.abs(3.5 - i);
        posBonus = (7 - distToCenter) * 2;
      } else if (piece.type === 'k') {
        // Use king safety table
        posBonus = kingEarlyTable[piece.color === 'w' ? sqIndex : 63 - sqIndex];
      }

      const finalValue = v + posBonus;
      score += (piece.color === 'w') ? finalValue : -finalValue;
    }
  }

  // Piece activity bonus (pieces that are attacking something)
  const wMoves = chess.moves({ verbose: true });
  const wAttackCount = wMoves.filter(m => m.captured).length;
  const bAttackCount = wMoves.filter(m => chess.turn() === 'b' && m.captured).length;

  score += wAttackCount * 5 - bAttackCount * 5;

  // Mobility bonus (more moves = more flexibility)
  const mobilityBonus = wMoves.length * 2;
  score += chess.turn() === 'w' ? mobilityBonus : -mobilityBonus;

  return score;
}

function bestMoveFallback(fen, depth, elo) {
  const chess = new ChessCtor();
  try { chess.load(fen); } catch (_) { return null; }

  const requestedDepth = Number(depth) || 5;
  const maxDepth = Math.max(1, Math.min(6, requestedDepth));

  const player = chess.turn();
  const startTime = Date.now();
  const timeLimit = 8000;
  let nodeCount = 0;
  const maxNodes = 1000000;
  const moveHistory = chess.history({ verbose: true });
  const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
  const lastLastMove = moveHistory.length > 1 ? moveHistory[moveHistory.length - 2] : null;

  // Track move repetition to penalize silly back-and-forth
  const recentMovePattern = [];
  for (let i = Math.max(0, moveHistory.length - 4); i < moveHistory.length; i++) {
    const m = moveHistory[i];
    recentMovePattern.push({ from: m.from, to: m.to });
  }

  function styleForElo(eloNum) {
    const e = Number(eloNum) || 1600;
    if (e === 800) return { kind: 'aggressive', intensity: 1.0 };
    if (e === 1200) return { kind: 'aggressive', intensity: 0.9 };
    if (e === 1600) return { kind: 'aggressive', intensity: 0.75 };
    if (e === 2000) return { kind: 'positional', intensity: 0.8 };
    if (e === 2400) return { kind: 'positional', intensity: 0.95 };
    return { kind: 'balanced', intensity: 0.5 };
  }

  function orderMoves(moves, side, eloNum) {
    const style = styleForElo(eloNum);

    const moveScores = moves.map((m) => {
      let score = 0;

      // Promotions first
      if (m.promotion) score += 500;

      // Captures (MVV-LVA: Most Valuable Victim - Least Valuable Attacker)
      if (m.captured) {
        const mvv = Number(eloNum) > 1200 ? { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 } : { p: 1, n: 3, b: 3.5, r: 5, q: 9, k: 100 };
        const victimValue = mvv[m.captured] || 0;
        const attackerValue = mvv[m.piece] || 0;
        score += victimValue * 10 - attackerValue;
      }

      // Penalize repetition (back-and-forth moves) - heavy penalty
      if (lastMove && m.from === lastMove.to && m.to === lastMove.from) {
        score -= 500; // Heavy penalty for immediate reversal
      }
      if (lastLastMove && m.from === lastLastMove.from && m.to === lastLastMove.to) {
        score -= 300; // Penalty for repeating same piece move pattern
      }

      // Slight preference for center moves
      const toFileCenter = Math.abs(m.to.charCodeAt(0) - 100.5);
      const toRankCenter = Math.abs((parseInt(m.to[1]) - 4.5));
      score -= (toFileCenter + toRankCenter) * 2;

      // Style-based biases
      try {
        // Use main board temporarily for check detection
        chess.move(m);
        const givesCheck = chess.in_check();
        chess.undo();

        if (style.kind === 'aggressive') {
          if (m.captured) score += Math.round(40 * style.intensity);
          if (givesCheck) score += Math.round(35 * style.intensity);
          if (m.piece === 'p') {
            const fr = parseInt(m.from[1],10), tr = parseInt(m.to[1],10);
            const advance = side === 'w' ? (tr - fr) : (fr - tr);
            if (advance >= 2) score += Math.round(10 * style.intensity);
            if ((m.to[0] === 'g' || m.to[0] === 'h' || m.to[0] === 'a' || m.to[0] === 'b') && advance >= 1) score += Math.round(8 * style.intensity);
          }
        }
        if (style.kind === 'positional') {
          if (m.flags && (m.flags.indexOf('k') !== -1 || m.flags.indexOf('q') !== -1)) score += Math.round(50 * style.intensity); // castling
          if (m.piece === 'n') {
            const devSquares = ['c3','d2','e2','f3','c6','d7','e7','f6'];
            if (devSquares.includes(m.to)) score += Math.round(25 * style.intensity);
          }
          if (m.piece === 'b') {
            const devSquares = ['c4','d3','e2','f1','c5','d6','e7','f8'];
            if (devSquares.includes(m.to)) score += Math.round(20 * style.intensity);
          }
          if (m.piece === 'p') {
            const singleSteps = ['e3','e6','d3','d6','c3','c6'];
            if (singleSteps.includes(m.to)) score += Math.round(18 * style.intensity);
          }
          if (m.piece === 'q' && (m.to === 'h5' || m.to === 'a4')) score -= Math.round(15 * style.intensity); // discourage early queen sortie
        }
      } catch(_) {}

      return { move: m, score };
    });

    return moveScores.sort((a, b) => b.score - a.score).map(ms => ms.move);
  }

  function negamax(d, alpha, beta, prevMove) {
    nodeCount++;

    if (nodeCount % 1000 === 0) {
      if (Date.now() - startTime > timeLimit) return 0;
      if (nodeCount > maxNodes) return 0;
    }

    if (d === 0 || chess.game_over()) {
      const evalScore = evaluateBoardPositional(chess, elo);
      return player === 'w' ? evalScore : -evalScore;
    }

    let best = -Infinity;
    let moves = chess.moves({ verbose: true });

    // Order moves for better pruning
    moves = orderMoves(moves, player, elo);

    for (const m of moves) {
      chess.move(m);
      const score = -negamax(d - 1, -beta, -alpha, m);
      chess.undo();

      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    return best === -Infinity ? 0 : best;
  }

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  let bestMove = null;
  let bestScore = -Infinity;

  for (let searchDepth = 1; searchDepth <= maxDepth; searchDepth++) {
    if (Date.now() - startTime > timeLimit) break;

    bestMove = null;
    bestScore = -Infinity;
    const moveScores = [];
    let orderedMoves = orderMoves(moves.slice(), player, elo);

    for (const m of orderedMoves) {
      if (Date.now() - startTime > timeLimit) break;

      chess.move(m);
      const score = -negamax(searchDepth - 1, -Infinity, Infinity, m);
      chess.undo();

      moveScores.push({ move: m, score });

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    // At the last depth, prefer moves that don't repeat patterns
    if (searchDepth === maxDepth && moveScores.length > 0) {
      const topScore = Math.max(...moveScores.map(ms => ms.score));
      const topMoves = moveScores.filter(ms => ms.score >= topScore - 20); // Small margin for similar scores

      // Filter out repetitive moves if better options exist
      const nonRepetitiveMoves = topMoves.filter(ms => {
        const m = ms.move;
        if (lastMove && m.from === lastMove.to && m.to === lastMove.from) return false;
        return true;
      });

      if (nonRepetitiveMoves.length > 0) {
        bestMove = nonRepetitiveMoves[0].move;
      } else if (topMoves.length > 0) {
        bestMove = topMoves[0].move;
      }
    }

    if (!bestMove) break;
  }

  if (!bestMove) return null;
  const promo = bestMove.promotion ? bestMove.promotion : '';
  return bestMove.from + bestMove.to + (promo || '');
}

function eloToSkillLevel(elo) {
  // Map ELO ratings to Stockfish skill levels (0-20)
  const rating = Number(elo) || 1200;
  if (rating <= 600) return 0;
  if (rating >= 2400) return 20;

  // Linear interpolation: 600->0, 2400->20
  const skillLevel = Math.round(((rating - 600) / (2400 - 600)) * 20);
  return Math.max(0, Math.min(20, skillLevel));
}

function randomDelay() {
  // Random delay between 2000-5000ms (2-5 seconds)
  const minDelay = 2000;
  const maxDelay = 5000;
  return Math.random() * (maxDelay - minDelay) + minDelay;
}

app.post('/api/stockfish/move', async (req, res) => {
  const fen = String(req.body && req.body.fen || '').trim();
  let depth = Number(req.body && (req.body.depth ?? 0));
  const elo = Number(req.body && (req.body.elo ?? 0));

  if (!fen) return res.status(400).json({ error: 'fen required' });
  if (!depth && elo) depth = eloToDepth(elo);
  if (!depth) depth = 12;

  try {
    console.log('[stockfish] request', {
      time: new Date().toISOString(),
      ip: req.ip,
      fen: fen,
      depth: depth,
      elo: elo
    });
  } catch (_) {}

  try {
    // Wrap with timeout to ensure we respond before browser timeout (10s)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Engine search timeout')), 9000)
    );

    const searchPromise = bestMoveWithStockfish(fen, depth, elo);

    const best = await Promise.race([searchPromise, timeoutPromise]);

    if (!best) {
      console.warn('[stockfish] no_move for fen', fen);
      return res.status(422).json({ error: 'no_move' });
    }
    console.log('[stockfish] bestmove:', best);
    return res.json({ bestmove: best });
  } catch (e) {
    console.error('[stockfish] engine error', e && e.stack ? e.stack : e);
    return res.status(500).json({ error: 'engine_error' });
  }
});

// State
const users = new Map(); // ws -> username
const pings = new Map(); // ws -> timestamp
const usernameToWs = new Map(); // username -> ws
const invites = new Map(); // key `${inviter}\u0000${target}` -> timestamp
const games = new Map(); // gid -> {board: Chess, white, black, over}
const fourPlayerSessions = new Map(); // sessionId -> {initiator, players: [player1, player2, player3], acceptedPlayers: [player1, player3], mode, timeControl, createdAt}
const fourPlayerGames = new Map(); // game_id -> {players: [p0, p1, p2, p3], board: [...], currentTurn: 0, activePlayers: [0,1,2,3], moveCount: 0, playerWs: Map<playerName -> ws>}
const snakeGames = new Map(); // game_id -> {players: [username, ...], gameState: {...}, playerWs: Map}
let snakeLobby = { players: new Set(), playerWs: new Map() }; // Current snake game lobby
let nextGameId = 1;
let nextSessionId = 1;
const userMessageTimes = new Map(); // ws -> Array<number> timestamps

function now() { return Date.now() / 1000; }

function send(ws, payload) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    } catch (err) {
      console.error('[ws] Error sending message:', err.message);
    }
  }
}

function broadcast(payload) {
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) send(ws, payload);
  }
}

function connectedUsernames() {
  return Array.from(users.values());
}

function sendUserList() {
  const connected = connectedUsernames();
  const offline = Array.from(knownUsers).filter((u) => !connected.includes(u));
  const offlineWithTimes = offline.map(username => {
    const history = onlineHistory[username] || [];
    let lastSeen = null;
    // Look for the most recent offline event
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].action === 'offline') {
        lastSeen = { time: history[i].time, timestamp: history[i].timestamp };
        break;
      }
    }
    // If no offline event found, use the last online event
    if (!lastSeen && history.length > 0) {
      lastSeen = { time: history[history.length - 1].time, timestamp: history[history.length - 1].timestamp };
    }
    return { username, lastSeen };
  });
  const payload = { type: 'userlist', connected, offline: offlineWithTimes };
  for (const [ws] of users) send(ws, payload);
}

function getWsByUsername(name) {
  const ws = usernameToWs.get(name);
  if (ws && users.get(ws) === name) return ws;
  for (const [w, n] of users.entries()) if (n === name) return w;
  return null;
}

function sendToUsername(name, payload) {
  const ws = getWsByUsername(name);
  if (ws && ws.readyState === WebSocket.OPEN) { send(ws, payload); return true; }
  return false;
}

function cleanUsername(usr, ws) {
  let username = sanitizeHtml(String(usr || ''), { allowedTags: [], allowedAttributes: {} });
  username = username.replace(/\W+/g, '').slice(0, 16);
  if (username.toLowerCase() === ADMINHIDDENNAME) {
    username = ADMINNAME;
    send(ws, { type: 'displayeduser', username });
  } else if (username.toLowerCase() === ADMINNAME || username === '') {
    username = 'user' + Math.floor(Math.random() * 1001);
    send(ws, { type: 'usernameunavailable', username });
  }
  return username;
}

function messagesRange(startId, endIdExclusive) {
  const out = [];
  // Find messages with IDs in the range [startId, endIdExclusive)
  // Don't assume messages[i].id === i since filtering can create gaps
  for (const msg of messages) {
    if (msg && msg.id >= startId && msg.id < endIdExclusive) {
      out.push(JSON.stringify(msg));
    }
  }
  return out;
}

function renameUserEverywhere(oldName, newName) {
  if (!oldName || oldName === newName) return;
  if (usernameToWs.has(oldName)) {
    const ws = usernameToWs.get(oldName);
    usernameToWs.delete(oldName);
    if (ws) usernameToWs.set(newName, ws);
  }
  if (knownUsers.has(oldName)) {
    knownUsers.delete(oldName);
    knownUsers.add(newName);
    persistKnownUsers();
  }
  // Rename in invites keys
  const entries = Array.from(invites.entries());
  for (const [key, ts] of entries) {
    const parts = key.split('\u0000');
    if (parts.length !== 2) continue;
    const inviter = parts[0];
    const target = parts[1];
    let changed = false;
    let ni = inviter, nt = target;
    if (inviter === oldName) { ni = newName; changed = true; }
    if (target === oldName) { nt = newName; changed = true; }
    if (changed) {
      invites.delete(key);
      invites.set(ni + '\u0000' + nt, ts);
    }
  }
  // Update current games labels (non-critical to functionality but keeps UX sensible)
  for (const g of games.values()) {
    if (g.white === oldName) g.white = newName;
    if (g.black === oldName) g.black = newName;
  }
}

function deliverQueuedInvites(username) {
  for (const key of invites.keys()) {
    const parts = key.split('\u0000');
    if (parts.length !== 2) continue;
    const inviter = parts[0];
    const target = parts[1];
    if (target === username) {
      const inviteData = invites.get(key);
      const payload = { type: 'chess_invite', from: inviter, offline: true };
      // Include mode and timeControl if they exist
      if (inviteData && typeof inviteData === 'object') {
        if (inviteData.mode) payload.mode = inviteData.mode;
        if (inviteData.timeControl) payload.timeControl = inviteData.timeControl;
      }
      sendToUsername(username, payload);
    }
  }
}

function findOngoingGameByUsername(username) {
  // Find the first ongoing game where this username is a player
  for (const [gid, g] of games.entries()) {
    if (!g.over && (g.white === username || g.black === username)) {
      return { gid, game: g };
    }
  }
  return null;
}

function findOngoing4PlayerGameByUsername(username) {
  // Find the first ongoing 4-player game where this username is a player
  for (const [gid, g] of games.entries()) {
    if (!g.over && g.is4player && g.players && Array.isArray(g.players) && g.players.includes(username)) {
      return { gid, game: g };
    }
  }
  return null;
}

// Cleanup stale users
setInterval(() => {
  const t = now();
  let changed = false;
  for (const [ws, lastPing] of pings.entries()) {
    if (t - lastPing > 30) {
      const uname = users.get(ws);
      if (uname) {
        recordOnlineEvent(uname, 'offline');
      }
      users.delete(ws);
      pings.delete(ws);
      userMessageTimes.delete(ws);
      if (usernameToWs.get(uname) === ws) usernameToWs.delete(uname);
      changed = true;
    }
  }
  if (changed) sendUserList();
}, 10000);

// 4-Player Chess: Check and Checkmate Detection
const COLORS_4PLAYER = ['blue', 'yellow', 'green', 'red'];
const BOARD_SIZE = 14;

// Parse time control string (e.g., '1m', '3m', '5m', '10m', '30m', 'unlimited') to seconds
function parseTimeControl(timeControl) {
  if (!timeControl || timeControl === 'unlimited') {
    return 0; // 0 means unlimited
  }

  const match = timeControl.match(/^(\d+)([msh])?$/i);
  if (!match) {
    return 300; // Default to 5 minutes if invalid format
  }

  const value = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();

  if (unit === 'm') return value * 60;
  if (unit === 'h') return value * 3600;
  if (unit === 's') return value;

  return value * 60; // Default to minutes
}

function isValidPos4P(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function isInactive4P(col, row) {
  const corners = [
    { minR: 0, maxR: 2, minC: 0, maxC: 2 },
    { minR: 0, maxR: 2, minC: 11, maxC: 13 },
    { minR: 11, maxR: 13, minC: 0, maxC: 2 },
    { minR: 11, maxR: 13, minC: 11, maxC: 13 }
  ];
  return corners.some(c => row >= c.minR && row <= c.maxR && col >= c.minC && col <= c.maxC);
}

function findKing4P(board, colorIndex) {
  const color = COLORS_4PLAYER[colorIndex];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.type === 'king' && piece.color === color) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function isKingInCheck4P(board, colorIndex) {
  const kingPos = findKing4P(board, colorIndex);
  if (!kingPos) return false;

  const color = COLORS_4PLAYER[colorIndex];

  // Check if any opponent piece can attack the king
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.color !== color) {
        if (canAttackPosition4P(board, r, c, piece, kingPos.row, kingPos.col)) {
          return true;
        }
      }
    }
  }
  return false;
}

function canAttackPosition4P(board, fromRow, fromCol, piece, toRow, toCol) {
  const directions = {
    blue: { forward: { row: -1, col: 0 }, pawnCapture: [{ row: -1, col: -1 }, { row: -1, col: 1 }] },
    yellow: { forward: { row: 0, col: -1 }, pawnCapture: [{ row: -1, col: -1 }, { row: 1, col: -1 }] },
    green: { forward: { row: 1, col: 0 }, pawnCapture: [{ row: 1, col: -1 }, { row: 1, col: 1 }] },
    red: { forward: { row: 0, col: 1 }, pawnCapture: [{ row: -1, col: 1 }, { row: 1, col: 1 }] }
  };

  const playerDir = directions[piece.color];

  switch (piece.type) {
    case 'pawn':
      for (const cap of playerDir.pawnCapture) {
        const cRow = fromRow + cap.row;
        const cCol = fromCol + cap.col;
        if (cRow === toRow && cCol === toCol && isValidPos4P(cRow, cCol)) {
          return true;
        }
      }
      return false;

    case 'rook':
      return canSlidingAttack4P(board, fromRow, fromCol, toRow, toCol, [[0, 1], [0, -1], [1, 0], [-1, 0]]);

    case 'bishop':
      return canSlidingAttack4P(board, fromRow, fromCol, toRow, toCol, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);

    case 'queen':
      return canSlidingAttack4P(board, fromRow, fromCol, toRow, toCol, [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]);

    case 'knight':
      const knightMoves = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
      for (const d of knightMoves) {
        if (fromRow + d[0] === toRow && fromCol + d[1] === toCol) {
          return true;
        }
      }
      return false;

    case 'king':
      const kingMoves = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const d of kingMoves) {
        if (fromRow + d[0] === toRow && fromCol + d[1] === toCol) {
          return true;
        }
      }
      return false;

    default:
      return false;
  }
}

function canSlidingAttack4P(board, fromRow, fromCol, toRow, toCol, directions) {
  for (const d of directions) {
    let nr = fromRow + d[0];
    let nc = fromCol + d[1];
    while (isValidPos4P(nr, nc) && !isInactive4P(nc, nr)) {
      if (nr === toRow && nc === toCol) {
        return true;
      }
      if (board[nr][nc]) {
        break;
      }
      nr += d[0];
      nc += d[1];
    }
  }
  return false;
}

function getPossibleMoves4P(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];

  const moves = [];
  const directions = {
    blue: { forward: { row: -1, col: 0 }, pawnCapture: [{ row: -1, col: -1 }, { row: -1, col: 1 }] },
    yellow: { forward: { row: 0, col: -1 }, pawnCapture: [{ row: -1, col: -1 }, { row: 1, col: -1 }] },
    green: { forward: { row: 1, col: 0 }, pawnCapture: [{ row: 1, col: -1 }, { row: 1, col: 1 }] },
    red: { forward: { row: 0, col: 1 }, pawnCapture: [{ row: -1, col: 1 }, { row: 1, col: 1 }] }
  };

  const playerDir = directions[piece.color];

  switch (piece.type) {
    case 'pawn':
      const fRow = row + playerDir.forward.row;
      const fCol = col + playerDir.forward.col;
      if (isValidPos4P(fRow, fCol) && !isInactive4P(fCol, fRow) && !board[fRow][fCol]) {
        moves.push({ row: fRow, col: fCol });

        if (!piece.hasMoved) {
          const dRow = fRow + playerDir.forward.row;
          const dCol = fCol + playerDir.forward.col;
          if (isValidPos4P(dRow, dCol) && !isInactive4P(dCol, dRow) && !board[dRow][dCol]) {
            moves.push({ row: dRow, col: dCol });
          }
        }
      }
      for (const cap of playerDir.pawnCapture) {
        const cRow = row + cap.row;
        const cCol = col + cap.col;
        if (isValidPos4P(cRow, cCol) && !isInactive4P(cCol, cRow)) {
          const target = board[cRow][cCol];
          if (target && target.color !== piece.color) {
            moves.push({ row: cRow, col: cCol });
          }
        }
      }
      break;

    case 'rook':
      addSlidingMoves4P(board, row, col, piece, [[0, 1], [0, -1], [1, 0], [-1, 0]], moves);
      break;

    case 'bishop':
      addSlidingMoves4P(board, row, col, piece, [[1, 1], [1, -1], [-1, 1], [-1, -1]], moves);
      break;

    case 'queen':
      addSlidingMoves4P(board, row, col, piece, [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]], moves);
      break;

    case 'knight':
      [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]].forEach(function(d) {
        const nr = row + d[0];
        const nc = col + d[1];
        if (isValidPos4P(nr, nc) && !isInactive4P(nc, nr)) {
          const target = board[nr][nc];
          if (!target || target.color !== piece.color) {
            moves.push({ row: nr, col: nc });
          }
        }
      });
      break;

    case 'king':
      [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function(d) {
        const nr = row + d[0];
        const nc = col + d[1];
        if (isValidPos4P(nr, nc) && !isInactive4P(nc, nr)) {
          const target = board[nr][nc];
          if (!target || target.color !== piece.color) {
            moves.push({ row: nr, col: nc });
          }
        }
      });
      break;
  }

  return moves;
}

function addSlidingMoves4P(board, row, col, piece, directions, moves) {
  directions.forEach(function(d) {
    let nr = row + d[0];
    let nc = col + d[1];
    while (isValidPos4P(nr, nc) && !isInactive4P(nc, nr)) {
      const target = board[nr][nc];
      if (target) {
        if (target.color !== piece.color) {
          moves.push({ row: nr, col: nc });
        }
        break;
      }
      moves.push({ row: nr, col: nc });
      nr += d[0];
      nc += d[1];
    }
  });
}

function isLegalMove4P(board, colorIndex, fromRow, fromCol, toRow, toCol) {
  const piece = board[fromRow][fromCol];
  if (!piece || piece.color !== COLORS_4PLAYER[colorIndex]) {
    return false;
  }

  // Make a copy of the board and apply the move
  const boardCopy = board.map(row => [...row]);
  const target = boardCopy[toRow][toCol];
  boardCopy[toRow][toCol] = piece;
  boardCopy[fromRow][fromCol] = null;

  // Check if the king would still be in check after this move
  return !isKingInCheck4P(boardCopy, colorIndex);
}

function hasLegalMoves4P(board, colorIndex) {
  const color = COLORS_4PLAYER[colorIndex];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.color === color) {
        const moves = getPossibleMoves4P(board, r, c);
        for (const move of moves) {
          if (isLegalMove4P(board, colorIndex, r, c, move.row, move.col)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function isCheckmate4P(board, colorIndex) {
  return isKingInCheck4P(board, colorIndex) && !hasLegalMoves4P(board, colorIndex);
}

function updateSnakeGameOnServer(gid) {
  if (!snakeGames.has(gid)) return;

  const gameState = snakeGames.get(gid);
  if (!gameState.gameRunning || gameState.activePlayers.size <= 1) {
    // Game over
    if (snakeLobby.gameLoop) clearInterval(snakeLobby.gameLoop);

    let winner = null;
    if (gameState.activePlayers.size === 1) {
      winner = Array.from(gameState.activePlayers)[0];
    }

    // Notify all players
    const gameOverPayload = {
      type: 'snake_game_over',
      game_id: gid,
      winner: winner
    };

    for (const player of gameState.players) {
      const pws = snakeLobby.playerWs.get(player);
      if (pws && pws.readyState === 1) {
        send(pws, gameOverPayload);
      }
    }

    snakeGames.delete(gid);

    // Keep players in lobby but reset game state for new game
    snakeLobby.gameId = null;

    console.log('[snake] Game ended with winner:', winner, 'Players remaining in lobby:', snakeLobby.players.size);
    return;
  }

  // Update positions based on directions
  const directions = {
    'up': [0, -1],
    'down': [0, 1],
    'left': [-1, 0],
    'right': [1, 0]
  };

  const opposites = {
    'up': 'down',
    'down': 'up',
    'left': 'right',
    'right': 'left'
  };

  const playerList = Array.from(gameState.activePlayers);
  const newHeads = {}; // Track new head positions for collision detection

  // Phase 1: Update directions and calculate new positions
  for (const username of playerList) {
    const player = gameState.playerStates[username];
    if (!player || !player.alive) continue;

    // Apply direction change (prevent 180-degree turns)
    if (player.nextDirection && opposites[player.direction] !== player.nextDirection) {
      player.direction = player.nextDirection;
    }

    // Calculate new head position
    const dir = directions[player.direction] || [1, 0];
    const head = player.positions[player.positions.length - 1];
    const newHead = [head[0] + dir[0], head[1] + dir[1]];

    newHeads[username] = newHead;
  }

  // Phase 2: Check collisions and apply moves
  for (const username of playerList) {
    const player = gameState.playerStates[username];
    if (!player || !player.alive) continue;

    const newHead = newHeads[username];

    // Check boundaries
    if (newHead[0] < 0 || newHead[0] >= 50 || newHead[1] < 0 || newHead[1] >= 50) {
      player.alive = false;
      gameState.activePlayers.delete(username);
      continue;
    }

    // Check collision with trails
    let hitTrail = false;
    for (let i = 0; i < gameState.trails.length; i++) {
      if (gameState.trails[i].x === newHead[0] && gameState.trails[i].y === newHead[1]) {
        hitTrail = true;
        break;
      }
    }

    if (hitTrail) {
      player.alive = false;
      gameState.activePlayers.delete(username);
      continue;
    }

    // Check collision with other player heads
    let hitHead = false;
    for (const otherUsername of playerList) {
      if (otherUsername === username || !gameState.playerStates[otherUsername].alive) continue;
      const otherNewHead = newHeads[otherUsername];
      if (otherNewHead && newHead[0] === otherNewHead[0] && newHead[1] === otherNewHead[1]) {
        hitHead = true;
        break;
      }
    }

    if (hitHead) {
      player.alive = false;
      gameState.activePlayers.delete(username);
      continue;
    }

    // Add current head position to trails
    const head = player.positions[player.positions.length - 1];
    gameState.trails.push({x: head[0], y: head[1], owner: username});
    player.positions.push(newHead);
  }

  // Broadcast game state
  const updatePayload = {
    type: 'snake_game_update',
    game_id: gid,
    playerStates: gameState.playerStates,
    trails: gameState.trails,
    activePlayers: Array.from(gameState.activePlayers)
  };

  for (const player of gameState.players) {
    const pws = snakeLobby.playerWs.get(player);
    if (pws && pws.readyState === 1) {
      send(pws, updatePayload);
    }
  }
}

wss.on('connection', (ws, req) => {
  if (req.url && !req.url.startsWith('/ws')) {
    ws.close();
    return;
  }

  // Check if IP is banned
  const clientIp = req.socket.remoteAddress || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  if (isIpBanned(clientIp)) {
    console.log(`[ban] Connection attempt from banned IP: ${clientIp}`);
    ws.close(4000, 'IP address is banned');
    return;
  }

  userMessageTimes.set(ws, []);

  ws.on('message', async (data) => {
    let msgStr = data.toString();
    if (msgStr.length > 4096) { send(ws, { type: 'flood' }); try { ws.close(); } catch(_){} return; }

    pings.set(ws, now());

    if (msgStr === 'ping') {
      send(ws, 'id' + String(Math.max(0, idx - 1)));
      if (!users.has(ws)) send(ws, { type: 'username' });
      return;
    }

    // Flood control (track non-ping messages)
    const arr = userMessageTimes.get(ws) || [];
    arr.push(Date.now());
    while (arr.length > 10) arr.shift();
    userMessageTimes.set(ws, arr);
    if (arr.length === 10 && (arr[arr.length - 1] - arr[0]) < 5000) {
      send(ws, { type: 'flood' });
      try { ws.close(); } catch(_){ }
      return;
    }

    let msg;
    try { msg = JSON.parse(msgStr); } catch (_) { return; }

    if (msg.type === 'message') {
      let message = String(msg.message || '').trim();
      let username = users.get(ws);
      if (!username) {
        const prev = null;
        username = cleanUsername(msg.username, ws);
        users.set(ws, username);
        usernameToWs.set(username, ws);
        knownUsers.add(username);
        persistKnownUsers();
        sendUserList();
        deliverQueuedInvites(username);
      }
      if (message) {
        if (message.toLowerCase() === '/online history') {
          const uname = String(username || '').toLowerCase();
          if (uname !== 'zahir' && uname !== ADMINNAME) {
            const obj = { type: 'message', message: 'Permission denied. Only admin can view online history.', username: 'System', id: idx, datetime: Math.floor(now()) };
            const s = JSON.stringify(obj);
            send(ws, s);
            idx += 1;
          } else {
            const history = [];
            for (const [user, events] of Object.entries(onlineHistory)) {
              for (const event of events) {
                if (event.action === 'online') {
                  history.push({ user, time: event.time, timestamp: event.timestamp });
                }
              }
            }
            history.sort((a, b) => a.timestamp - b.timestamp);
            const last7 = history.slice(-7);
            const historyText = last7.length === 0
              ? 'No online history recorded.'
              : last7.map(h => `${h.user} ${h.time}`).join('\n');
            const obj = { type: 'message', message: historyText, username: 'System', id: idx, datetime: Math.floor(now()) };
            const s = JSON.stringify(obj);
            send(ws, s);
            idx += 1;
          }
        } else if (message.toLowerCase() === '/delete users') {
          const uname = String(username || '').toLowerCase();
          if (uname !== 'zahir' && uname !== ADMINNAME) {
            const obj = { type: 'message', message: 'Permission denied. Only admin can delete users.', username: 'System', id: idx, datetime: Math.floor(now()) };
            send(ws, JSON.stringify(obj));
            idx += 1;
          } else {
            const userList = Array.from(knownUsers).sort();
            send(ws, JSON.stringify({ type: 'admin_delete_users_modal', users: userList }));
          }
        } else if (message.toLowerCase() === '/ip bans') {
          const uname = String(username || '').toLowerCase();
          if (uname !== 'zahir' && uname !== ADMINNAME) {
            const obj = { type: 'message', message: 'Permission denied. Only admin can manage IP bans.', username: 'System', id: idx, datetime: Math.floor(now()) };
            send(ws, JSON.stringify(obj));
            idx += 1;
          } else {
            const bans = getBannedIps();
            send(ws, JSON.stringify({ type: 'admin_ip_bans_modal', bans: bans }));
          }
        } else if (message.toLowerCase() === '/timeout') {
          console.log('[timeout] /timeout command received from user:', username);
          const uname = String(username || '').toLowerCase();
          if (uname !== 'zahir' && uname !== ADMINNAME) {
            console.log('[timeout] Permission denied for user:', username);
            const obj = { type: 'message', message: 'Permission denied. Only admin can timeout users.', username: 'System', id: idx, datetime: Math.floor(now()) };
            send(ws, JSON.stringify(obj));
            idx += 1;
          } else {
            console.log('[timeout] Sending admin_timeout_modal to user:', username);
            const userList = Array.from(knownUsers).sort();
            send(ws, JSON.stringify({ type: 'admin_timeout_modal', users: userList }));
          }
        } else {
          // Check if user is timed out
          if (isUserTimedOut(username)) {
            const remaining = Math.ceil(getTimeoutRemaining(username) / 1000);
            const obj = { type: 'message', message: `You are timed out. Time remaining: ${remaining}s`, username: 'System', id: idx, datetime: Math.floor(now()) };
            send(ws, JSON.stringify(obj));
            idx += 1;
            return;
          }
          if (message.length > 1000) message = message.slice(0, 1000) + '...';
          const safeMessage = sanitizeHtml(message, { allowedTags: [], allowedAttributes: {} }).trim();
          const obj = { type: 'message', message: safeMessage, username, id: idx, datetime: Math.floor(now()) };
          messages[idx] = obj;
          appendMessage(obj);
          idx += 1;
          const s = JSON.stringify(obj);
          for (const [u] of users) send(u, s);
        }
      }
    }
    else if (msg.type === 'messagesbefore') {
      const idbefore = Number(msg.id) || 0;
      send(ws, { type: 'messages', before: 1, messages: messagesRange(Math.max(0, idbefore - 100), idbefore) });
    }
    else if (msg.type === 'messagesafter') {
      const idafter = Number(msg.id) || 0;
      const result = messagesRange(idafter, idx);
      console.log(`[debug] messagesafter: client requested id>${idafter}, returning ${result.length} messages (idx=${idx})`);
      send(ws, { type: 'messages', before: 0, messages: result });
    }
    else if (msg.type === 'clear_history') {
      const username = users.get(ws);
      const uname = String(username || '').toLowerCase();
      // allow admin constant OR anyone named 'zahir' (case-insensitive)
      if (!username || (uname !== 'zahir' && uname !== ADMINNAME)) {
        send(ws, { type: 'chess_error', message: 'permission_denied' });
      } else {
        // clear in-memory messages and reset index
        messages = [];
        idx = 0;
        try { fs.writeFileSync(MSG_FILE, ''); } catch (_) {}
        // notify all connected clients to clear their UI
        for (const w of wss.clients) {
          if (w.readyState === WebSocket.OPEN) send(w, { type: 'cleared', by: username });
        }
      }
    }
    else if (msg.type === 'username') {
      const oldName = users.get(ws) || null;
      const username = cleanUsername(msg.username, ws);
      const isNew = !users.has(ws);
      users.set(ws, username);
      usernameToWs.set(username, ws);
      if (oldName && oldName !== username) {
        renameUserEverywhere(oldName, username);
      }
      knownUsers.add(username);
      persistKnownUsers();
      if (isNew) {
        recordOnlineEvent(username, 'online');
        send(ws, { type: 'messages', before: 0, messages: messagesRange(Math.max(0, idx - 100), idx) });
      }
      sendUserList();
      deliverQueuedInvites(username);

      // Check for ongoing 2-player games associated with this username
      const ongoingGameInfo = findOngoingGameByUsername(username);
      if (ongoingGameInfo) {
        const { gid, game } = ongoingGameInfo;
        console.log(`[chess] User ${username} reconnected, found ongoing 2-player game ${gid}`);

        // Recalculate remaining times after reconnect by deducting elapsed time
        const now = Date.now();
        let resumeRemainingSeconds = [...(game.remainingSeconds || [game.timeControlSeconds || 0, game.timeControlSeconds || 0])];

        if (game.timeControlSeconds && game.timeControlSeconds > 0) {
          const elapsedMs = now - (game.lastMoveAt || now);
          const elapsedSeconds = Math.ceil(elapsedMs / 1000);

          // Deduct elapsed time from current player (whose turn it is)
          const currentPlayerIndex = game.board.turn() === 'w' ? 0 : 1;
          resumeRemainingSeconds[currentPlayerIndex] = Math.max(0, resumeRemainingSeconds[currentPlayerIndex] - elapsedSeconds);
        }

        const payload = {
          type: 'chess_resume',
          game_id: gid,
          white: game.white,
          black: game.black,
          fen: game.board.fen(),
          turn: game.board.turn() === 'w' ? 'white' : 'black',
          timeControl: game.timeControl,
          remainingSeconds: resumeRemainingSeconds,
          serverTime: now
        };
        send(ws, payload);
      }

      // Check for ongoing 4-player games associated with this username
      const ongoing4PlayerGameInfo = findOngoing4PlayerGameByUsername(username);
      if (ongoing4PlayerGameInfo) {
        const { gid, game } = ongoing4PlayerGameInfo;
        const gameState = fourPlayerGames.get(gid);
        if (gameState) {
          console.log(`[chess] User ${username} reconnected, found ongoing 4-player game ${gid}`);
          // Recalculate remaining times after reconnect by deducting elapsed time
          const now = Date.now();
          const elapsedMs = now - (gameState.lastMoveAt || now);
          const elapsedSeconds = Math.ceil(elapsedMs / 1000);

          // Deduct elapsed time from current player if time control is enabled
          let resumeRemainingSeconds = [...gameState.remainingSeconds];
          if (gameState.timeControlSeconds && gameState.timeControlSeconds > 0 && gameState.activePlayers.length > 0) {
            const currentPlayerIndex = gameState.activePlayers[gameState.currentTurn % gameState.activePlayers.length];
            resumeRemainingSeconds[currentPlayerIndex] = Math.max(0, resumeRemainingSeconds[currentPlayerIndex] - elapsedSeconds);
          }

          const payload = {
            type: '4player_resume',
            game_id: gid,
            players: game.players,
            mode: game.mode,
            timeControl: game.timeControl,
            board: gameState.board,
            currentTurn: gameState.currentTurn,
            activePlayers: gameState.activePlayers,
            moveCount: gameState.moveCount,
            remainingSeconds: resumeRemainingSeconds,
            serverTime: now
          };
          send(ws, payload);
        }
      }
    }
    else if (msg.type === 'forget_me') {
      const uname = users.get(ws);
      if (uname && knownUsers.has(uname)) {
        knownUsers.delete(uname);
        persistKnownUsers();
        sendUserList();
      }
    }
    else if (msg.type === 'chess_invite') {
      const inviter = users.get(ws);
      const targets = Array.isArray(msg.to) ? msg.to : [String(msg.to || '')];
      const mode = msg.mode || '2player';
      const timeControl = msg.timeControl || '5m';

      if (!inviter) {
        send(ws, { type: 'chess_error', message: 'Not authenticated' });
      } else if (mode === '4player') {
        const sessionKey = inviter + '::' + mode + '::' + timeControl;
        let session = null;

        for (const [sid, s] of fourPlayerSessions) {
          if (s.sessionKey === sessionKey) {
            session = s;
            break;
          }
        }

        if (!session) {
          const sessionId = nextSessionId++;
          session = {
            sessionId: sessionId,
            sessionKey: sessionKey,
            initiator: inviter,
            players: new Set([inviter]),
            acceptedPlayers: new Set([inviter]),
            mode: mode,
            timeControl: timeControl,
            createdAt: Date.now()
          };
          fourPlayerSessions.set(sessionId, session);
          console.log('[4p-chess] Session created:', {sessionId, initiator: inviter, sessionKey});
        }

        for (const target of targets) {
          if (!target || inviter === target) continue;
          if (!session.players.has(target)) {
            session.players.add(target);
          }

          const invitePayload = {
            type: 'chess_invite',
            from: inviter,
            mode: mode,
            timeControl: timeControl,
            sessionId: session.sessionId
          };
          console.log('[4p-chess] Sending invite:', {sessionId: session.sessionId, from: inviter, to: target});
          sendToUsername(target, invitePayload);
        }
      } else {
        const target = String(msg.to || '');
        if (!target || inviter === target) {
          send(ws, { type: 'chess_error', message: 'Invalid invite' });
        } else {
          const key = inviter + '\u0000' + target;
          const inviteData = { timestamp: Date.now() };
          if (msg.mode) inviteData.mode = msg.mode;
          if (msg.timeControl) inviteData.timeControl = msg.timeControl;
          invites.set(key, inviteData);
          const invitePayload = { type: 'chess_invite', from: inviter };
          if (msg.mode) invitePayload.mode = msg.mode;
          if (msg.timeControl) invitePayload.timeControl = msg.timeControl;
          sendToUsername(target, invitePayload);
        }
      }
    }
    else if (msg.type === 'chess_invite_accept') {
      const acceptor = users.get(ws);
      const inviter = String(msg.from || '');
      const sessionId = msg.sessionId;

      console.log('[4p-chess] Accept received:', {acceptor, inviter, sessionId, hasSession: fourPlayerSessions.has(sessionId)});

      if (!inviter || !acceptor) {
        send(ws, { type: 'chess_error', message: 'Invalid invite' });
      } else if (fourPlayerSessions.has(sessionId)) {
        const session = fourPlayerSessions.get(sessionId);

        if (!session.acceptedPlayers.has(acceptor)) {
          session.acceptedPlayers.add(acceptor);
        }

        const playersArray = Array.from(session.players);
        const acceptedArray = Array.from(session.acceptedPlayers);

        console.log('[4p-chess] Status:', {sessionId, accepted: acceptedArray.length, total: playersArray.length, acceptedPlayers: acceptedArray, allPlayers: playersArray});

        if (acceptedArray.length === playersArray.length && playersArray.length === 4) {
          const gid = nextGameId++;
          games.set(gid, {
            board: null,
            players: playersArray,
            over: false,
            isAiGame: false,
            is4player: true,
            mode: session.mode,
            timeControl: session.timeControl
          });

          // Initialize 4-player game state
          const emptyBoard = Array(14).fill(null).map(() => Array(14).fill(null));

          // Helper to set up pieces
          const setPiece = (board, type, row, col, color) => {
            board[row][col] = { type, color, hasMoved: false };
          };

          // Setup pieces for each player (matching client-side initialization)
          // Player 0 (blue) - vertical, top side
          for (let c = 3; c < 11; c++) setPiece(emptyBoard, 'pawn', 12, c, 'blue');
          setPiece(emptyBoard, 'rook', 13, 3, 'blue');
          setPiece(emptyBoard, 'knight', 13, 4, 'blue');
          setPiece(emptyBoard, 'bishop', 13, 5, 'blue');
          setPiece(emptyBoard, 'queen', 13, 6, 'blue');
          setPiece(emptyBoard, 'king', 13, 7, 'blue');
          setPiece(emptyBoard, 'bishop', 13, 8, 'blue');
          setPiece(emptyBoard, 'knight', 13, 9, 'blue');
          setPiece(emptyBoard, 'rook', 13, 10, 'blue');

          // Player 1 (yellow) - horizontal, right side
          for (let r = 3; r < 11; r++) setPiece(emptyBoard, 'pawn', r, 12, 'yellow');
          setPiece(emptyBoard, 'rook', 3, 13, 'yellow');
          setPiece(emptyBoard, 'knight', 4, 13, 'yellow');
          setPiece(emptyBoard, 'bishop', 5, 13, 'yellow');
          setPiece(emptyBoard, 'queen', 6, 13, 'yellow');
          setPiece(emptyBoard, 'king', 7, 13, 'yellow');
          setPiece(emptyBoard, 'bishop', 8, 13, 'yellow');
          setPiece(emptyBoard, 'knight', 9, 13, 'yellow');
          setPiece(emptyBoard, 'rook', 10, 13, 'yellow');

          // Player 2 (green) - vertical, bottom side
          for (let c = 3; c < 11; c++) setPiece(emptyBoard, 'pawn', 1, c, 'green');
          setPiece(emptyBoard, 'rook', 0, 3, 'green');
          setPiece(emptyBoard, 'knight', 0, 4, 'green');
          setPiece(emptyBoard, 'bishop', 0, 5, 'green');
          setPiece(emptyBoard, 'queen', 0, 6, 'green');
          setPiece(emptyBoard, 'king', 0, 7, 'green');
          setPiece(emptyBoard, 'bishop', 0, 8, 'green');
          setPiece(emptyBoard, 'knight', 0, 9, 'green');
          setPiece(emptyBoard, 'rook', 0, 10, 'green');

          // Player 3 (red) - horizontal, left side
          for (let r = 3; r < 11; r++) setPiece(emptyBoard, 'pawn', r, 1, 'red');
          setPiece(emptyBoard, 'rook', 3, 0, 'red');
          setPiece(emptyBoard, 'knight', 4, 0, 'red');
          setPiece(emptyBoard, 'bishop', 5, 0, 'red');
          setPiece(emptyBoard, 'queen', 6, 0, 'red');
          setPiece(emptyBoard, 'king', 7, 0, 'red');
          setPiece(emptyBoard, 'bishop', 8, 0, 'red');
          setPiece(emptyBoard, 'knight', 9, 0, 'red');
          setPiece(emptyBoard, 'rook', 10, 0, 'red');

          // Parse time control to seconds
          const timeControlSeconds = parseTimeControl(session.timeControl || '5m');

          // Initialize per-player remaining times
          const remainingSeconds = [timeControlSeconds, timeControlSeconds, timeControlSeconds, timeControlSeconds];

          fourPlayerGames.set(gid, {
            players: playersArray,
            board: emptyBoard,
            currentTurn: 0,
            activePlayers: [0, 3, 2, 1],
            moveCount: 0,
            timeControl: session.timeControl,
            timeControlSeconds: timeControlSeconds,
            remainingSeconds: remainingSeconds,
            lastMoveAt: Date.now(),
            gameStartTime: Date.now()
          });

          const gameObj = fourPlayerGames.get(gid);
          const payload = {
            type: '4player_game_start',
            game_id: gid,
            players: playersArray,
            mode: session.mode,
            timeControl: session.timeControl,
            remainingSeconds: gameObj.remainingSeconds,
            serverTime: Date.now()
          };

          console.log('[4p-chess] Game started:', {gid, players: playersArray});

          for (const player of playersArray) {
            sendToUsername(player, payload);
          }

          fourPlayerSessions.delete(sessionId);
        } else {
          send(ws, {
            type: 'chess_info',
            message: 'Waiting for ' + (playersArray.length - acceptedArray.length) + ' more player(s) to accept...'
          });
        }
      } else {
        console.log('[4p-chess] Session not found, treating as 2-player invite');
        const key = inviter + '\u0000' + acceptor;
        if (!invites.has(key)) {
          send(ws, { type: 'chess_error', message: 'Invite not found' });
        } else {
          const gid = nextGameId++;
          const board = new ChessCtor();
          let white, black;
          if (Math.random() < 0.5) { white = inviter; black = acceptor; } else { white = acceptor; black = inviter; }

          // Parse time control from invite
          const timeControl = msg.timeControl || '5m';
          const timeControlSeconds = parseTimeControl(timeControl);
          const remainingSeconds = [timeControlSeconds, timeControlSeconds]; // [white, black]

          games.set(gid, {
            board,
            white,
            black,
            over: false,
            isAiGame: false,
            timeControl,
            timeControlSeconds,
            remainingSeconds,
            lastMoveAt: Date.now(),
            gameStartTime: Date.now()
          });
          const payload = { type: 'chess_start', game_id: gid, white, black, fen: board.fen(), turn: 'white', timeControl, remainingSeconds, serverTime: Date.now() };
          sendToUsername(white, payload); sendToUsername(black, payload);
          invites.delete(key);
        }
      }
    }
    else if (msg.type === 'chess_move') {
      const gid = msg.game_id;
      const src = String(msg.from || '');
      const dst = String(msg.to || '');
      const promo = (msg.promotion || '').toLowerCase();
      const player = users.get(ws);
      if (!games.has(gid)) { send(ws, { type: 'chess_error', message: 'Game not found' }); return; }
      const g = games.get(gid);
      const board = g.board;
      if (g.over) { send(ws, { type: 'chess_error', message: 'Game over' }); return; }
      const expected = board.turn() === 'w' ? g.white : g.black;
      if (player !== expected) { send(ws, { type: 'chess_error', message: 'Not your turn' }); return; }

      // Handle chess clock: deduct elapsed time from current player
      const now = Date.now();
      const playerColor = board.turn() === 'w' ? 'white' : 'black';
      const playerIndex = playerColor === 'white' ? 0 : 1;

      if (g.timeControlSeconds && g.timeControlSeconds > 0) {
        const elapsedMs = now - (g.lastMoveAt || now);
        const elapsedSeconds = Math.ceil(elapsedMs / 1000);
        g.remainingSeconds[playerIndex] = Math.max(0, g.remainingSeconds[playerIndex] - elapsedSeconds);

        // Check if current player has run out of time
        if (g.remainingSeconds[playerIndex] <= 0) {
          console.log('[chess] Player timeout:', {gid, player, color: playerColor});
          g.over = true;

          // The player who ran out of time loses
          const winner = playerColor === 'white' ? g.black : g.white;
          const result = playerColor === 'white' ? '0-1' : '1-0';
          const timeoutOver = {
            type: 'chess_over',
            game_id: gid,
            result,
            reason: 'timeout',
            fen: board.fen()
          };

          sendToUsername(g.white, timeoutOver);
          sendToUsername(g.black, timeoutOver);
          return;
        }
      }

      g.lastMoveAt = now;
      const moveSpec = { from: src, to: dst };
      if (promo && ['q','r','b','n'].includes(promo)) moveSpec.promotion = promo;
      const move = board.move(moveSpec);
      if (move) {
        const payload = { type: 'chess_move', game_id: gid, from: src, to: dst, promotion: move.promotion || null, san: move.san, fen: board.fen(), turn: board.turn() === 'w' ? 'white' : 'black', check: board.in_check(), remainingSeconds: g.remainingSeconds, serverTime: now };
        sendToUsername(g.white, payload); sendToUsername(g.black, payload);
        if (board.game_over()) {
          g.over = true;
          let result;
          if (board.in_checkmate()) result = board.turn() === 'w' ? '0-1' : '1-0';
          else if (board.in_stalemate() || board.in_draw()) result = '1/2-1/2';
          else result = '1/2-1/2';
          const reason = board.in_checkmate() ? 'checkmate' : (board.in_stalemate() ? 'stalemate' : 'draw');
          const over = { type: 'chess_over', game_id: gid, result, reason, fen: board.fen() };

          // Update Elo for player-vs-player games
          if (!g.isAiGame && g.white && g.black) {
            let whiteResult, blackResult;
            if (result === '1-0') {
              whiteResult = 1; // white wins
              blackResult = 0; // black loses
            } else if (result === '0-1') {
              whiteResult = 0; // white loses
              blackResult = 1; // black wins
            } else {
              whiteResult = 0.5; // draw
              blackResult = 0.5; // draw
            }

            const whiteElo = getUserElo(g.white).elo;
            const blackElo = getUserElo(g.black).elo;

            updatePlayerElo(g.white, blackElo, whiteResult);
            updatePlayerElo(g.black, whiteElo, blackResult);

            console.log('[chess] Player-vs-player game ended:', g.white, 'vs', g.black, 'result:', result);
          }

          sendToUsername(g.white, over); sendToUsername(g.black, over);
        }
      } else {
        send(ws, { type: 'chess_illegal', reason: 'illegal' });
      }
    }
    else if (msg.type === 'chess_resign') {
      const gid = msg.game_id;
      const username = users.get(ws);

      if (games.has(gid)) {
        const g = games.get(gid);
        if (!g.over) {
          g.over = true;
          const winner = username === g.white ? g.black : g.white;
          const result = winner === g.white ? '1-0' : '0-1';
          const over = {
            type: 'chess_over',
            game_id: gid,
            result,
            reason: 'resign',
            fen: g.board.fen()
          };

          // Update Elo for player-vs-player games
          if (!g.isAiGame && g.white && g.black) {
            const whiteResult = winner === g.white ? 1 : 0;
            const blackResult = winner === g.black ? 1 : 0;

            const whiteElo = getUserElo(g.white).elo;
            const blackElo = getUserElo(g.black).elo;

            updatePlayerElo(g.white, blackElo, whiteResult);
            updatePlayerElo(g.black, whiteElo, blackResult);

            console.log('[chess] Player-vs-player game resigned:', g.white, 'vs', g.black, 'winner:', winner);
          }

          // Send to both players if it's a regular game
          if (!g.isAiGame) {
            sendToUsername(g.white, over);
            sendToUsername(g.black, over);
          } else {
            // For AI games, just send to the player
            send(ws, over);
          }

          console.log('[chess] Player resigned -', username, 'vs', g.white === username ? g.black : g.white);
        }
      }
    }
    else if (msg.type === 'chess_ai_start') {
      const username = users.get(ws);
      const playerElo = Number(msg.playerElo || 0);
      const aiElo = Number(msg.aiElo || 1600);

      if (!username) {
        send(ws, { type: 'chess_error', message: 'Username required' });
        return;
      }

      const gid = nextGameId++;
      const board = new ChessCtor();
      const playerColor = Math.random() < 0.5 ? 'w' : 'b';
      const white = playerColor === 'w' ? username : 'zyberAI';
      const black = playerColor === 'b' ? username : 'zyberAI';

      // Try to create human-like AI bot, fall back to opening book if it fails
      let aiBot = null;
      try {
        aiBot = await createAIBotForGame(board, aiElo);
        if (aiBot) {
          aiBotsCache.set(gid, aiBot);
          console.log('[ai] Created human-like bot for game', gid, 'ELO', aiElo);
        }
      } catch (err) {
        console.warn('[ai] Failed to create human-like bot:', err.message);
      }

      games.set(gid, {
        board,
        white,
        black,
        over: false,
        isAiGame: true,
        playerUsername: username,
        playerColor,
        playerElo,
        aiElo,
        aiBot
      });

      const payload = {
        type: 'chess_start',
        game_id: gid,
        white,
        black,
        fen: board.fen(),
        turn: 'white',
        isAiGame: true,
        playerColor,
        aiElo
      };
      send(ws, payload);
    }
    else if (msg.type === 'chess_ai_move') {
      const gid = msg.game_id;
      const src = String(msg.from || '');
      const dst = String(msg.to || '');
      const promo = (msg.promotion || '').toLowerCase();
      const username = users.get(ws);

      console.log('[ai] chess_ai_move received: game_id=', gid, 'from=', src, 'to=', dst, 'username=', username);

      if (!games.has(gid)) {
        console.error('[ai] chess_ai_move: Game not found:', gid);
        send(ws, { type: 'chess_error', message: 'Game not found' });
        return;
      }

      const g = games.get(gid);
      const board = g.board;

      if (!g.isAiGame) {
        console.error('[ai] chess_ai_move: Not an AI game');
        send(ws, { type: 'chess_error', message: 'Not an AI game' });
        return;
      }

      if (g.over) {
        console.error('[ai] chess_ai_move: Game is over');
        send(ws, { type: 'chess_error', message: 'Game over' });
        return;
      }

      if (username !== g.playerUsername) {
        console.error('[ai] chess_ai_move: Not your game - username=', username, 'playerUsername=', g.playerUsername);
        send(ws, { type: 'chess_error', message: 'Not your game' });
        return;
      }

      const moveSpec = { from: src, to: dst };
      if (promo && ['q','r','b','n'].includes(promo)) moveSpec.promotion = promo;
      const playerMove = board.move(moveSpec);

      if (!playerMove) {
        console.error('[ai] chess_ai_move: Illegal move:', src, 'to', dst);
        send(ws, { type: 'chess_illegal', reason: 'illegal' });
        return;
      }

      console.log('[ai] chess_ai_move: Player move accepted:', playerMove.san, 'new turn:', board.turn());

      const playerMovePayload = {
        type: 'chess_move',
        game_id: gid,
        from: src,
        to: dst,
        promotion: playerMove.promotion || null,
        san: playerMove.san,
        fen: board.fen(),
        turn: board.turn() === 'w' ? 'white' : 'black',
        check: board.in_check()
      };
      send(ws, playerMovePayload);

      if (board.game_over()) {
        g.over = true;
        let result, reason;
        if (board.in_checkmate()) {
          result = board.turn() === 'w' ? '0-1' : '1-0';
          reason = 'checkmate';
        } else if (board.in_stalemate() || board.in_draw()) {
          result = '1/2-1/2';
          reason = 'stalemate';
        } else {
          result = '1/2-1/2';
          reason = 'draw';
        }

        const gameOverPayload = {
          type: 'chess_over',
          game_id: gid,
          result,
          reason,
          fen: board.fen()
        };
        send(ws, gameOverPayload);
        return;
      }

      const delayBeforeAiMove = randomDelay();
      console.log('[ai] Waiting', delayBeforeAiMove.toFixed(0), 'ms before AI response');

      setTimeout(async () => {
        try {
          let aiMoveResult = null;

          if (g.aiBot) {
            try {
              console.log('[ai] Using human-like chess AI bot for ELO', g.aiElo);
              aiMoveResult = await g.aiBot.pickMove();
              console.log('[ai] Human-like bot move:', aiMoveResult.san || aiMoveResult);
            } catch (botErr) {
              console.warn('[ai] Human-like bot failed:', botErr.message, '- falling back to opening book');
              g.aiBot = null;
            }
          }

          if (!aiMoveResult) {
            console.log('[ai] Using opening book + fallback algorithm');
            let bestMove = getOpeningMove(board.fen(), g.aiElo);
            if (!bestMove) {
              bestMove = bestMoveFallback(board.fen(), eloToDepth(g.aiElo), g.aiElo);
            }

            if (!bestMove || bestMove.length < 4) {
              console.error('[ai] Failed to get fallback move');
              send(ws, { type: 'chess_error', message: 'AI move generation failed' });
              return;
            }

            const from = bestMove.substring(0, 2).toLowerCase();
            const to = bestMove.substring(2, 4).toLowerCase();
            const promotion = bestMove.length > 4 ? bestMove[4].toLowerCase() : null;

            aiMoveResult = board.move({ from, to, promotion });
          }

          if (!aiMoveResult) {
            console.error('[ai] Failed to apply AI move');
            send(ws, { type: 'chess_error', message: 'AI move is invalid' });
            return;
          }

          console.log('[ai] AI move applied:', aiMoveResult.san);

          const aiMovePayload = {
            type: 'chess_move',
            game_id: gid,
            from: aiMoveResult.from,
            to: aiMoveResult.to,
            promotion: aiMoveResult.promotion || null,
            san: aiMoveResult.san,
            fen: board.fen(),
            turn: board.turn() === 'w' ? 'white' : 'black',
            check: board.in_check(),
            isAiMove: true
          };
          send(ws, aiMovePayload);

          if (board.game_over()) {
            g.over = true;
            let result, reason;
            if (board.in_checkmate()) {
              result = board.turn() === 'w' ? '0-1' : '1-0';
              reason = 'checkmate';
            } else if (board.in_stalemate() || board.in_draw()) {
              result = '1/2-1/2';
              reason = 'stalemate';
            } else {
              result = '1/2-1/2';
              reason = 'draw';
            }

            send(ws, {
              type: 'chess_over',
              game_id: gid,
              result,
              reason,
              fen: board.fen()
            });
          }
        } catch (err) {
          console.error('[ai] AI move error:', err.message);
          send(ws, { type: 'chess_error', message: 'AI move generation failed' });
        }
      }, delayBeforeAiMove)
    }
    else if (msg.type === 'chess_request_ai_move') {
      const gid = msg.game_id;
      const username = users.get(ws);

      if (!games.has(gid)) {
        send(ws, { type: 'chess_error', message: 'Game not found' });
        return;
      }

      const g = games.get(gid);
      const board = g.board;

      if (!g.isAiGame) {
        send(ws, { type: 'chess_error', message: 'Not an AI game' });
        return;
      }

      if (g.over) {
        send(ws, { type: 'chess_error', message: 'Game over' });
        return;
      }

      if (username !== g.playerUsername) {
        send(ws, { type: 'chess_error', message: 'Not your game' });
        return;
      }

      if (board.game_over()) {
        g.over = true;
        let result, reason;
        if (board.in_checkmate()) {
          result = board.turn() === 'w' ? '0-1' : '1-0';
          reason = 'checkmate';
        } else if (board.in_stalemate() || board.in_draw()) {
          result = '1/2-1/2';
          reason = 'stalemate';
        } else {
          result = '1/2-1/2';
          reason = 'draw';
        }

        const gameOverPayload = {
          type: 'chess_over',
          game_id: gid,
          result,
          reason,
          fen: board.fen()
        };
        send(ws, gameOverPayload);
        return;
      }

      const delayBeforeAiMove = randomDelay();
      console.log('[ai] Waiting', delayBeforeAiMove.toFixed(0), 'ms before processing request');

      setTimeout(async () => {
        try {
          let aiMoveResult = null;

          if (g.aiBot) {
            try {
              console.log('[ai] Using human-like chess AI bot for opening move ELO', g.aiElo);
              aiMoveResult = await g.aiBot.pickMove();
              console.log('[ai] Human-like bot opening move:', aiMoveResult.san || aiMoveResult);
            } catch (botErr) {
              console.warn('[ai] Human-like bot failed:', botErr.message, '- falling back to opening book');
              g.aiBot = null;
            }
          }

          if (!aiMoveResult) {
            console.log('[ai] Using opening book + fallback algorithm for first move');
            let bestMove = getOpeningMove(board.fen(), g.aiElo);
            if (!bestMove) {
              bestMove = bestMoveFallback(board.fen(), eloToDepth(g.aiElo), g.aiElo);
            }

            if (!bestMove || bestMove.length < 4) {
              console.error('[ai] Failed to get fallback move');
              send(ws, { type: 'chess_error', message: 'AI move generation failed' });
              return;
            }

            const from = bestMove.substring(0, 2).toLowerCase();
            const to = bestMove.substring(2, 4).toLowerCase();
            const promotion = bestMove.length > 4 ? bestMove[4].toLowerCase() : null;

            aiMoveResult = board.move({ from, to, promotion });
          }

          if (!aiMoveResult) {
            console.error('[ai] Failed to apply AI opening move');
            send(ws, { type: 'chess_error', message: 'AI move is invalid' });
            return;
          }

          console.log('[ai] AI opening move applied:', aiMoveResult.san);

          const aiMovePayload = {
            type: 'chess_move',
            game_id: gid,
            from: aiMoveResult.from,
            to: aiMoveResult.to,
            promotion: aiMoveResult.promotion || null,
            san: aiMoveResult.san,
            fen: board.fen(),
            turn: board.turn() === 'w' ? 'white' : 'black',
            check: board.in_check(),
            isAiMove: true
          };
          send(ws, aiMovePayload);

          if (board.game_over()) {
            g.over = true;
            let result, reason;
            if (board.in_checkmate()) {
              result = board.turn() === 'w' ? '0-1' : '1-0';
              reason = 'checkmate';
            } else if (board.in_stalemate() || board.in_draw()) {
              result = '1/2-1/2';
              reason = 'stalemate';
            } else {
              result = '1/2-1/2';
              reason = 'draw';
            }

            send(ws, {
              type: 'chess_over',
              game_id: gid,
              result,
              reason,
              fen: board.fen()
            });
          }
        } catch (err) {
          console.error('[ai] Opening move error:', err.message);
          send(ws, { type: 'chess_error', message: 'AI move generation failed' });
        }
      }, delayBeforeAiMove);
    }
    else if (msg.type === '4player_move') {
      const gid = msg.game_id;
      const username = users.get(ws);

      console.log('[4p-chess] Received 4player_move:', {gid, username, hasGame: fourPlayerGames.has(gid), from: msg.from, to: msg.to});

      if (!gid || !fourPlayerGames.has(gid)) {
        console.warn('[4p-chess] Game not found for gid:', gid);
        send(ws, { type: 'chess_error', message: 'Game not found' });
        return;
      }

      const game = fourPlayerGames.get(gid);
      const playerIndex = game.players.indexOf(username);

      console.log('[4p-chess] Player validation:', {playerIndex, players: game.players, username});

      if (playerIndex === -1) {
        console.warn('[4p-chess] Player not found in game:', {username, players: game.players});
        send(ws, { type: 'chess_error', message: 'Not a player in this game' });
        return;
      }

      // Check that this player is still active
      if (!game.activePlayers.includes(playerIndex)) {
        send(ws, { type: 'chess_error', message: 'You have been eliminated' });
        return;
      }

      // Check if it's this player's turn
      // currentTurn is a position in activePlayers array, so we need to get the actual player index
      if (game.activePlayers.length > 0) {
        const currentPlayerIndex = game.activePlayers[game.currentTurn % game.activePlayers.length];
        if (currentPlayerIndex !== playerIndex) {
          send(ws, { type: '4playerMoveRejected', reason: 'Not your turn' });
          return;
        }
      } else {
        send(ws, { type: 'chess_error', message: 'No active players' });
        return;
      }

      // Handle chess clock: deduct elapsed time from current player
      const now = Date.now();
      const elapsedMs = now - (game.lastMoveAt || now);
      const elapsedSeconds = Math.ceil(elapsedMs / 1000);

      // Deduct elapsed time from current player's clock (only if time control is enabled)
      if (game.timeControlSeconds && game.timeControlSeconds > 0) {
        game.remainingSeconds[playerIndex] = Math.max(0, game.remainingSeconds[playerIndex] - elapsedSeconds);

        // Check if current player has run out of time
        if (game.remainingSeconds[playerIndex] <= 0) {
          console.log('[4p-chess] Player timeout:', {gid, username, playerIndex, color: COLORS_4PLAYER[playerIndex]});

          // Remove the timeout player from activePlayers
          const timeoutColorIndex = playerIndex;
          const wasAtPos = game.activePlayers.indexOf(timeoutColorIndex);
          game.activePlayers = game.activePlayers.filter(p => p !== timeoutColorIndex);

          // Adjust currentTurn if necessary
          if (wasAtPos < game.currentTurn && game.activePlayers.length > 0) {
            game.currentTurn = game.currentTurn > 0 ? game.currentTurn - 1 : 0;
          } else if (game.currentTurn >= game.activePlayers.length && game.activePlayers.length > 0) {
            game.currentTurn = game.currentTurn % game.activePlayers.length;
          }

          // Broadcast timeout elimination to all players
          const timeoutUpdate = {
            type: '4playerMoveUpdate',
            game_id: gid,
            timeout: true,
            eliminatedColor: timeoutColorIndex,
            nextTurn: game.currentTurn,
            activePlayers: game.activePlayers,
            remainingSeconds: game.remainingSeconds,
            serverTime: now
          };

          for (const player of game.players) {
            const playerWs = getWsByUsername(player);
            if (playerWs && playerWs.readyState === 1) {
              send(playerWs, timeoutUpdate);
            }
          }
          return;
        }
      }

      game.lastMoveAt = now;

      const { from, to, piece } = msg;

      if (!from || !to || !piece) {
        send(ws, { type: 'chess_error', message: 'Invalid move data' });
        return;
      }

      const fromRow = from.row;
      const fromCol = from.col;
      const toRow = to.row;
      const toCol = to.col;

      // Validate position bounds
      if (fromRow < 0 || fromRow >= 14 || fromCol < 0 || fromCol >= 14 ||
          toRow < 0 || toRow >= 14 || toCol < 0 || toCol >= 14) {
        send(ws, { type: 'chess_error', message: 'Move out of bounds' });
        return;
      }

      // Check if source has the piece
      console.log('[4p-chess] Checking source piece:', {fromRow, fromCol, sourcePiece: game.board[fromRow][fromCol]});

      if (game.board[fromRow][fromCol] === null) {
        console.warn('[4p-chess] No piece at source:', {fromRow, fromCol});
        send(ws, { type: 'chess_error', message: 'No piece at source' });
        return;
      }

      const sourcePiece = game.board[fromRow][fromCol];
      if (sourcePiece.color !== piece.color || sourcePiece.type !== piece.type) {
        console.warn('[4p-chess] Piece mismatch:', {sourcePiece, clientPiece: piece});
        send(ws, { type: 'chess_error', message: 'Invalid piece at source' });
        return;
      }

      // Validate that the move is legal (doesn't leave the king in check)
      if (!isLegalMove4P(game.board, playerIndex, fromRow, fromCol, toRow, toCol)) {
        console.warn('[4p-chess] Illegal move (leaves king in check):', {from: {row: fromRow, col: fromCol}, to: {row: toRow, col: toCol}});
        send(ws, { type: '4playerMoveRejected', reason: 'Illegal move - would leave king in check' });
        return;
      }

      // Check for captured piece before applying move
      let eliminatedColor = null;
      const capturedPiece = game.board[toRow][toCol];
      if (capturedPiece && capturedPiece.type === 'king') {
        const colorIndex = COLORS_4PLAYER.indexOf(capturedPiece.color);
        if (colorIndex !== -1 && game.activePlayers.includes(colorIndex)) {
          eliminatedColor = colorIndex;
          // Remove the eliminated player from activePlayers
          const wasAtPos = game.activePlayers.indexOf(colorIndex);
          game.activePlayers = game.activePlayers.filter(p => p !== colorIndex);
          // Adjust currentTurn if necessary (if we eliminated someone before current position)
          if (wasAtPos < game.currentTurn && game.activePlayers.length > 0) {
            game.currentTurn = game.currentTurn > 0 ? game.currentTurn - 1 : 0;
          } else if (game.currentTurn >= game.activePlayers.length && game.activePlayers.length > 0) {
            game.currentTurn = game.currentTurn % game.activePlayers.length;
          }
        }
      }

      // Apply move on server
      console.log('[4p-chess] Applying move on server:', {from: {row: fromRow, col: fromCol}, to: {row: toRow, col: toCol}});
      game.board[toRow][toCol] = piece;
      game.board[fromRow][fromCol] = null;
      game.moveCount++;

      // Advance turn to next position in activePlayers and check for checkmate
      const checkmatedPlayers = [];
      if (game.activePlayers.length > 1) {
        let nextTurnPos = (game.currentTurn + 1) % game.activePlayers.length;

        // Check if next player(s) are checkmated
        let checkPos = nextTurnPos;
        let checksRemaining = game.activePlayers.length;
        while (checksRemaining > 0) {
          const nextPlayerIndex = game.activePlayers[checkPos];
          if (isCheckmate4P(game.board, nextPlayerIndex)) {
            console.log('[4p-chess] Checkmate detected for player:', COLORS_4PLAYER[nextPlayerIndex]);
            checkmatedPlayers.push(nextPlayerIndex);
            eliminatedColor = nextPlayerIndex;
            // Remove this player from activePlayers
            game.activePlayers = game.activePlayers.filter(p => p !== nextPlayerIndex);
            // Don't advance checkPos since we removed a player
            if (game.activePlayers.length === 0) break;
            checkPos = checkPos % game.activePlayers.length;
          } else {
            // This player is not checkmated, they're next
            game.currentTurn = checkPos;
            break;
          }
          checksRemaining--;
        }

        if (game.activePlayers.length === 0) {
          game.currentTurn = 0;
        }
      } else if (game.activePlayers.length === 1) {
        game.currentTurn = 0;
      } else {
        game.currentTurn = 0;
      }

      // Broadcast move to all players in the game
      const moveUpdate = {
        type: '4playerMoveUpdate',
        game_id: gid,
        from,
        to,
        piece,
        eliminatedColor,
        nextTurn: game.currentTurn,
        activePlayers: game.activePlayers,
        moveCount: game.moveCount,
        checkmatedPlayers: checkmatedPlayers.length > 0 ? checkmatedPlayers : undefined,
        remainingSeconds: game.remainingSeconds,
        serverTime: now
      };

      let broadcastCount = 0;
      for (const player of game.players) {
        const playerWs = getWsByUsername(player);
        if (playerWs && playerWs.readyState === 1) {
          send(playerWs, moveUpdate);
          broadcastCount++;
        } else {
          console.warn('[4p-chess] Failed to send move to player:', player, 'ws:', playerWs ? 'found' : 'not found', 'ready:', playerWs ? playerWs.readyState : 'N/A');
        }
      }

      console.log('[4p-chess] Move recorded and broadcast:', {gid, player: username, from, to, moveCount: game.moveCount, broadcastCount, totalPlayers: game.players.length, checkmatedPlayers});
    }
    else if (msg.type === 'snake_join') {
      const username = users.get(ws);
      if (!username) {
        send(ws, { type: 'snake_error', message: 'Not authenticated' });
        return;
      }

      // Add player to lobby or create a game if 2+ players
      snakeLobby.players.add(username);
      snakeLobby.playerWs.set(username, ws);

      console.log('[snake] Player joined:', {username, lobbySize: snakeLobby.players.length});

      // Send game state to joining player
      if (snakeLobby.gameId) {
        // Game is already running
        const gameState = snakeGames.get(snakeLobby.gameId);
        if (gameState) {
          send(ws, {
            type: 'snake_game_state',
            game_id: snakeLobby.gameId,
            players: Array.from(snakeLobby.players),
            board: gameState.board,
            playerStates: gameState.playerStates,
            trails: gameState.trails
          });
        }
      } else if (snakeLobby.players.size >= 2) {
        // Start new game
        const gid = nextGameId++;
        const playersArray = Array.from(snakeLobby.players);
        const colors = ['green', 'blue', 'yellow', 'red'];
        const directions = ['right', 'down', 'left', 'up'];
        const startPositions = [
          [[5, 10]],
          [[45, 40]],
          [[10, 45]],
          [[40, 5]]
        ];

        const gameState = {
          gameId: gid,
          players: playersArray,
          playerStates: {},
          trails: [],
          gameStartTime: Date.now(),
          activePlayers: new Set(playersArray),
          gameRunning: true
        };

        for (let i = 0; i < playersArray.length; i++) {
          gameState.playerStates[playersArray[i]] = {
            color: colors[i % colors.length],
            direction: directions[i % directions.length],
            nextDirection: directions[i % directions.length],
            positions: startPositions[i % startPositions.length].slice(),
            alive: true
          };
        }

        snakeGames.set(gid, gameState);
        snakeLobby.gameId = gid;

        // Notify all players game started
        const startPayload = {
          type: 'snake_game_start',
          game_id: gid,
          players: playersArray,
          playerStates: gameState.playerStates
        };

        for (const player of playersArray) {
          const pws = snakeLobby.playerWs.get(player);
          if (pws && pws.readyState === 1) {
            send(pws, startPayload);
          }
        }

        console.log('[snake] Game started:', {gid, players: playersArray});

        // Start game loop
        if (snakeLobby.gameLoop) clearInterval(snakeLobby.gameLoop);
        snakeLobby.gameLoop = setInterval(() => {
          updateSnakeGameOnServer(gid);
        }, 100); // 10 ticks per second
      } else {
        // Broadcast lobby update
        const lobbyPayload = {
          type: 'snake_lobby_update',
          players: Array.from(snakeLobby.players),
          playersNeeded: Math.max(0, 2 - snakeLobby.players.size)
        };

        for (const pws of snakeLobby.playerWs.values()) {
          if (pws.readyState === 1) send(pws, lobbyPayload);
        }
      }
    }
    else if (msg.type === 'snake_move') {
      const gid = msg.game_id;
      const username = users.get(ws);
      const direction = msg.direction;

      if (!snakeGames.has(gid) || !username) return;

      const gameState = snakeGames.get(gid);
      const player = gameState.playerStates[username];
      if (player) {
        player.nextDirection = direction;
      }
    }
    else if (msg.type === 'snake_leave') {
      const gid = msg.game_id;
      const username = users.get(ws);

      if (snakeLobby.players.has(username)) {
        snakeLobby.players.delete(username);
        snakeLobby.playerWs.delete(username);
        console.log('[snake] Player left lobby:', {username, lobbySize: snakeLobby.players.size});
      }

      if (snakeGames.has(gid)) {
        const gameState = snakeGames.get(gid);
        if (username && gameState.playerStates[username]) {
          gameState.playerStates[username].alive = false;
          gameState.activePlayers.delete(username);
        }
      }
    }
    else if (msg.type === 'admin_delete_user') {
      const uname = users.get(ws);
      const targetUser = String(msg.user || '').trim();
      const unameStr = String(uname || '').toLowerCase();
      if (unameStr !== 'zahir' && unameStr !== ADMINNAME) {
        send(ws, { type: 'message', message: 'Permission denied. Only admin can delete users.', username: 'System' });
        return;
      }
      if (!targetUser || !knownUsers.has(targetUser)) {
        send(ws, { type: 'message', message: 'User not found: ' + targetUser, username: 'System' });
        return;
      }

      // Delete the user
      knownUsers.delete(targetUser);
      delete userSettings[targetUser];

      // Remove all messages from this user to prevent duplication
      const originalMessageCount = messages.length;
      messages = messages.filter(m => m.username !== targetUser);

      // Recalculate idx to be the next ID after the highest existing message
      // This is critical because filtering breaks the assumption that messages[i].id === i
      if (messages.length > 0) {
        idx = Math.max(...messages.map(m => m.id || 0)) + 1;
      } else {
        idx = 0;
      }

      console.log(`[admin] Deleted user ${targetUser} and ${originalMessageCount - messages.length} messages, idx reset to ${idx}`);

      // Rewrite the messages file without deleted user's messages
      const messageLines = messages.map(m => JSON.stringify(m)).join('\n');
      fs.writeFile(MSG_FILE, messageLines + (messageLines.length > 0 ? '\n' : ''), () => {});

      persistKnownUsers();
      const settingsStr = JSON.stringify(userSettings, null, 2);
      fs.writeFile(SETTINGS_FILE, settingsStr, () => {});

      // Send system message with proper id and timestamp so client doesn't get confused
      const systemMsg = { type: 'message', message: 'User deleted: ' + targetUser, username: 'System', id: idx, datetime: Math.floor(now()) };
      messages.push(systemMsg);
      appendMessage(systemMsg);
      idx += 1;
      const msgStr = JSON.stringify(systemMsg);
      for (const [u] of users) send(u, msgStr);

      sendUserList();
    }
    else if (msg.type === 'admin_ban_ip') {
      const uname = users.get(ws);
      const ip = String(msg.ip || '').trim();
      const reason = String(msg.reason || 'No reason specified').trim();
      const unameStr = String(uname || '').toLowerCase();

      if (unameStr !== 'zahir' && unameStr !== ADMINNAME) {
        send(ws, { type: 'message', message: 'Permission denied. Only admin can ban IPs.', username: 'System' });
        return;
      }

      if (!ip || ip.length === 0) {
        send(ws, { type: 'message', message: 'Invalid IP address.', username: 'System' });
        return;
      }

      const banned = banIp(ip, reason, uname);
      if (banned) {
        const systemMsg = { type: 'message', message: `IP ${ip} banned: ${reason}`, username: 'System', id: idx, datetime: Math.floor(now()) };
        messages.push(systemMsg);
        appendMessage(systemMsg);
        idx += 1;
        const msgStr = JSON.stringify(systemMsg);
        for (const [u] of users) send(u, msgStr);
      } else {
        send(ws, { type: 'message', message: 'Failed to ban IP.', username: 'System' });
      }
    }
    else if (msg.type === 'admin_unban_ip') {
      const uname = users.get(ws);
      const ip = String(msg.ip || '').trim();
      const unameStr = String(uname || '').toLowerCase();

      if (unameStr !== 'zahir' && unameStr !== ADMINNAME) {
        send(ws, { type: 'message', message: 'Permission denied. Only admin can unban IPs.', username: 'System' });
        return;
      }

      if (!ip || ip.length === 0) {
        send(ws, { type: 'message', message: 'Invalid IP address.', username: 'System' });
        return;
      }

      const unbanned = unbanIp(ip);
      if (unbanned) {
        const systemMsg = { type: 'message', message: `IP ${ip} unbanned`, username: 'System', id: idx, datetime: Math.floor(now()) };
        messages.push(systemMsg);
        appendMessage(systemMsg);
        idx += 1;
        const msgStr = JSON.stringify(systemMsg);
        for (const [u] of users) send(u, msgStr);
      } else {
        send(ws, { type: 'message', message: 'IP not found in ban list.', username: 'System' });
      }
    }
    else if (msg.type === 'admin_timeout_user') {
      const adminName = users.get(ws);
      const targetUser = String(msg.user || '').trim();
      const duration = Number(msg.duration || 0); // duration in milliseconds
      const unameStr = String(adminName || '').toLowerCase();

      if (unameStr !== 'zahir' && unameStr !== ADMINNAME) {
        send(ws, { type: 'message', message: 'Permission denied. Only admin can timeout users.', username: 'System' });
        return;
      }

      if (!targetUser || !knownUsers.has(targetUser)) {
        send(ws, { type: 'message', message: 'User not found: ' + targetUser, username: 'System' });
        return;
      }

      if (duration <= 0) {
        send(ws, { type: 'message', message: 'Invalid timeout duration.', username: 'System' });
        return;
      }

      const reason = `Timed out by ${adminName}`;
      timeoutUser(targetUser, duration, reason);

      const durationSeconds = Math.floor(duration / 1000);
      const systemMsg = { type: 'message', message: `User ${targetUser} timed out for ${durationSeconds}s`, username: 'System', id: idx, datetime: Math.floor(now()) };
      messages.push(systemMsg);
      appendMessage(systemMsg);
      idx += 1;
      const msgStr = JSON.stringify(systemMsg);
      for (const [u] of users) send(u, msgStr);
    }
  });

  ws.on('close', () => {
    const uname = users.get(ws);
    users.delete(ws);
    pings.delete(ws);
    userMessageTimes.delete(ws);
    if (usernameToWs.get(uname) === ws) usernameToWs.delete(uname);

    // Clean up snake game lobby
    if (uname && snakeLobby.players.has(uname)) {
      snakeLobby.players.delete(uname);
      snakeLobby.playerWs.delete(uname);
    }

    // Clean up snake games
    for (const [gid, gameState] of snakeGames.entries()) {
      if (uname && gameState.playerStates[uname]) {
        gameState.playerStates[uname].alive = false;
        gameState.activePlayers.delete(uname);
      }
    }

    sendUserList();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`Chat available at http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
