const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const sanitizeHtml = require('sanitize-html');
const ChessCtor = require('chess.js').Chess;
const Stockfish = require('stockfish');

// Config (mirrors config.py defaults)
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 12000;
const ADMINNAME = 'admin';
const ADMINHIDDENNAME = 'adminxyz';

// Persistence
const DATA_DIR = path.join(__dirname, 'data');
const MSG_FILE = path.join(DATA_DIR, 'messages.jsonl');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'user-settings.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

let idx = 0; // next message id
let messages = []; // array of message objects {type:'message', message, username, id, datetime}
let knownUsers = new Set(); // all-time seen users (current canonical usernames)
let userSettings = {}; // username -> {confirmMoves, premoveEnabled, selectedBoard, selectedPieces}

function loadMessages() {
  if (!fs.existsSync(MSG_FILE)) return;
  const lines = fs.readFileSync(MSG_FILE, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj.id === 'number') {
        messages.push(obj);
        idx = Math.max(idx, obj.id + 1);
      }
    } catch (_) {}
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

loadMessages();
loadKnownUsers();
loadUserSettings();
loadUserElos();

// Server
const app = express();
app.use(express.static(path.join(__dirname)));
app.use(express.json());
// Allow CORS for API endpoints so clients opened from file:// or other origins can call /api
app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
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

class StockfishEngineWASM {
  constructor(engine) {
    this.engine = engine;
    this.ready = true;
  }

  async position(fen) {
    return new Promise((resolve) => {
      this.engine.onmessage = () => resolve();
      this.engine.postMessage(`position fen ${fen}`);
    });
  }

  async go(options) {
    return new Promise((resolve) => {
      let bestMove = null;

      this.engine.onmessage = (message) => {
        if (message.includes('bestmove')) {
          const parts = message.split(' ');
          bestMove = parts[1];
          resolve(bestMove);
        }
      };

      let goCommand = 'go';
      if (options.depth) {
        goCommand += ' depth ' + options.depth;
      } else if (options.movetime) {
        goCommand += ' movetime ' + options.movetime;
      } else {
        goCommand += ' depth 15';
      }

      this.engine.postMessage(goCommand);

      // Timeout fallback
      setTimeout(() => {
        if (!bestMove) resolve(bestMove);
      }, 30000);
    });
  }

  async setoption(name, value) {
    return new Promise((resolve) => {
      this.engine.onmessage = () => resolve();
      this.engine.postMessage(`setoption name ${name} value ${value}`);
    });
  }

  async newgame() {
    return new Promise((resolve) => {
      this.engine.onmessage = () => resolve();
      this.engine.postMessage('ucinewgame');
    });
  }

  quit() {
    try {
      this.engine.postMessage('quit');
    } catch (e) {
      // Engine already quit
    }
  }
}

async function initStockfishEngine() {
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

      const engine = await initStockfish();
      stockfishEngine = new StockfishEngineWASM(engine);

      console.log('[stockfish] Stockfish WASM engine ready');
      return stockfishEngine;
    } catch (err) {
      console.error('[stockfish] WASM initialization failed:', err);
      console.log('[stockfish] Falling back to simple algorithm');
      stockfishInitPromise = null;
      return null;
    }
  })();

  return stockfishInitPromise;
}

async function bestMoveWithStockfish(fen, depth, elo) {
  try {
    const engine = await initStockfishEngine();

    if (!engine) {
      console.log('[stockfish] No engine available, using fallback algorithm');
      return bestMoveFallback(fen, depth, elo);
    }

    await engine.position(fen);
    const bestMove = await engine.go({ depth: Math.max(1, Math.min(30, Number(depth) || 15)) });

    if (bestMove && bestMove !== '0000') {
      console.log('[stockfish] Best move:', bestMove);
      return bestMove;
    }

    console.warn('[stockfish] No valid move returned, using fallback');
    return bestMoveFallback(fen, depth, elo);

  } catch (err) {
    console.error('[stockfish] Error:', err);
    console.log('[stockfish] Using fallback algorithm');
    return bestMoveFallback(fen, depth, elo);
  }
}

function evaluateBoardPositional(chess) {
  const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const board = chess.board();
  let score = 0;

  // Material score
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (!piece) continue;
      const v = values[piece.type] || 0;
      let posBonus = 0;

      // Positional bonuses
      if (piece.type === 'p') {
        // Pawns advance towards promotion
        posBonus = piece.color === 'w' ? (6 - i) * 10 : (i - 1) * 10;
      } else if (piece.type === 'n') {
        // Knights prefer central squares
        const dist = Math.abs(3.5 - j) + Math.abs(3.5 - i);
        posBonus = (7 - dist) * 5;
      } else if (piece.type === 'r') {
        // Rooks on 7th rank
        posBonus = (piece.color === 'w' && i === 1) ? 30 : (piece.color === 'b' && i === 6) ? 30 : 0;
      }

      const finalValue = v + posBonus;
      score += (piece.color === 'w') ? finalValue : -finalValue;
    }
  }

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
  const lastMove = chess.history({ verbose: true })[chess.history().length - 1];

  function negamax(d, alpha, beta, prevMove) {
    nodeCount++;

    if (nodeCount % 1000 === 0) {
      if (Date.now() - startTime > timeLimit) return 0;
      if (nodeCount > maxNodes) return 0;
    }

    if (d === 0 || chess.game_over()) {
      const evalScore = evaluateBoardPositional(chess);
      return player === 'w' ? evalScore : -evalScore;
    }

    let best = -Infinity;
    const moves = chess.moves({ verbose: true });

    // Sort moves: captures first, then other moves
    moves.sort((a, b) => {
      const aIsCapture = !!a.captured ? 1 : 0;
      const bIsCapture = !!b.captured ? 1 : 0;
      return bIsCapture - aIsCapture;
    });

    for (const m of moves) {
      // Avoid obvious bad moves: don't immediately undo the last move
      if (prevMove && m.from === prevMove.to && m.to === prevMove.from) {
        continue;
      }

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

    for (const m of moves) {
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

    // At the last depth, if there are multiple moves with same top score, prefer captures
    if (searchDepth === maxDepth && moveScores.length > 0) {
      const topScore = Math.max(...moveScores.map(ms => ms.score));
      const topMoves = moveScores.filter(ms => ms.score === topScore);

      // Prefer captures among equally good moves
      const capturesInTop = topMoves.filter(ms => ms.move.captured);
      if (capturesInTop.length > 0) {
        bestMove = capturesInTop[0].move;
      } else if (topMoves.length > 0) {
        // Among non-captures, add slight randomness to avoid repetition
        bestMove = topMoves[Math.floor(Math.random() * Math.min(3, topMoves.length))].move;
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
let nextGameId = 1;
const userMessageTimes = new Map(); // ws -> Array<number> timestamps

function now() { return Date.now() / 1000; }

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
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
  const payload = { type: 'userlist', connected, offline };
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
  for (let i = Math.max(0, startId); i < Math.min(idx, endIdExclusive); i++) {
    const msg = messages[i];
    if (msg) out.push(JSON.stringify(msg));
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
      sendToUsername(username, { type: 'chess_invite', from: inviter, offline: true });
    }
  }
}

// Cleanup stale users
setInterval(() => {
  const t = now();
  let changed = false;
  for (const [ws, lastPing] of pings.entries()) {
    if (t - lastPing > 30) {
      const uname = users.get(ws);
      users.delete(ws);
      pings.delete(ws);
      userMessageTimes.delete(ws);
      if (usernameToWs.get(uname) === ws) usernameToWs.delete(uname);
      changed = true;
    }
  }
  if (changed) sendUserList();
}, 10000);

wss.on('connection', (ws, req) => {
  if (req.url && !req.url.startsWith('/ws')) {
    ws.close();
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
    else if (msg.type === 'messagesbefore') {
      const idbefore = Number(msg.id) || 0;
      send(ws, { type: 'messages', before: 1, messages: messagesRange(Math.max(0, idbefore - 100), idbefore) });
    }
    else if (msg.type === 'messagesafter') {
      const idafter = Number(msg.id) || 0;
      send(ws, { type: 'messages', before: 0, messages: messagesRange(idafter, idx) });
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
        send(ws, { type: 'messages', before: 0, messages: messagesRange(Math.max(0, idx - 100), idx) });
      }
      sendUserList();
      deliverQueuedInvites(username);
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
      const target = String(msg.to || '');
      if (!inviter || !target || inviter === target) {
        send(ws, { type: 'chess_error', message: 'Invalid invite' });
      } else {
        const key = inviter + '\u0000' + target;
        invites.set(key, Date.now());
        const ok = sendToUsername(target, { type: 'chess_invite', from: inviter });
        if (!ok) {
          // queued for offline delivery; optional ack
          // send(ws, { type: 'chess_info', message: 'Invite queued for delivery when user is online' });
        }
      }
    }
    else if (msg.type === 'chess_invite_accept') {
      const target = users.get(ws); // acceptor
      const inviter = String(msg.from || '');
      const key = inviter + '\u0000' + target;
      if (!inviter || !target || !invites.has(key)) {
        send(ws, { type: 'chess_error', message: 'Invite not found' });
      } else {
        const gid = nextGameId++;
        const board = new ChessCtor();
        let white, black;
        if (Math.random() < 0.5) { white = inviter; black = target; } else { white = target; black = inviter; }
        games.set(gid, { board, white, black, over: false });
        const payload = { type: 'chess_start', game_id: gid, white, black, fen: board.fen(), turn: 'white' };
        sendToUsername(white, payload); sendToUsername(black, payload);
        invites.delete(key);
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
      const moveSpec = { from: src, to: dst };
      if (promo && ['q','r','b','n'].includes(promo)) moveSpec.promotion = promo;
      const move = board.move(moveSpec);
      if (move) {
        const payload = { type: 'chess_move', game_id: gid, from: src, to: dst, promotion: move.promotion || null, san: move.san, fen: board.fen(), turn: board.turn() === 'w' ? 'white' : 'black', check: board.in_check() };
        sendToUsername(g.white, payload); sendToUsername(g.black, payload);
        if (board.game_over()) {
          g.over = true;
          let result;
          if (board.in_checkmate()) result = board.turn() === 'w' ? '0-1' : '1-0';
          else if (board.in_stalemate() || board.in_draw()) result = '1/2-1/2';
          else result = '1/2-1/2';
          const reason = board.in_checkmate() ? 'checkmate' : (board.in_stalemate() ? 'stalemate' : 'draw');
          const over = { type: 'chess_over', game_id: gid, result, reason, fen: board.fen() };
          sendToUsername(g.white, over); sendToUsername(g.black, over);
        }
      } else {
        send(ws, { type: 'chess_illegal', reason: 'illegal' });
      }
    }
    else if (msg.type === 'chess_resign') {
      const gid = msg.game_id;
      const player = users.get(ws);
      if (games.has(gid)) {
        const g = games.get(gid);
        if (!g.over) {
          g.over = true;
          const winner = player === g.white ? g.black : g.white;
          const result = winner === g.white ? '1-0' : '0-1';
          const over = { type: 'chess_over', game_id: gid, result, reason: 'resign', fen: g.board.fen() };
          sendToUsername(g.white, over); sendToUsername(g.black, over);
        }
      }
    }
    else if (msg.type === 'chess_ai_start') {
      const username = users.get(ws);
      const playerElo = Number(msg.playerElo || 0);

      if (!username) {
        send(ws, { type: 'chess_error', message: 'Username required' });
        return;
      }

      const gid = nextGameId++;
      const board = new ChessCtor();
      const aiElo = 1600;
      const playerColor = Math.random() < 0.5 ? 'w' : 'b';
      const white = playerColor === 'w' ? username : 'zyberAI';
      const black = playerColor === 'b' ? username : 'zyberAI';

      games.set(gid, {
        board,
        white,
        black,
        over: false,
        isAiGame: true,
        playerUsername: username,
        playerColor,
        playerElo,
        aiElo
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

      const moveSpec = { from: src, to: dst };
      if (promo && ['q','r','b','n'].includes(promo)) moveSpec.promotion = promo;
      const playerMove = board.move(moveSpec);

      if (!playerMove) {
        send(ws, { type: 'chess_illegal', reason: 'illegal' });
        return;
      }

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

      try {
        const bestMove = await bestMoveWithStockfish(board.fen(), eloToDepth(g.aiElo), g.aiElo);

        if (!bestMove) {
          send(ws, { type: 'chess_error', message: 'AI move generation failed' });
          return;
        }

        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        const promotion = bestMove.length > 4 ? bestMove[4] : null;

        const aiMoveSpec = { from, to };
        if (promotion) aiMoveSpec.promotion = promotion;
        const aiMove = board.move(aiMoveSpec);

        if (aiMove) {
          const aiMovePayload = {
            type: 'chess_move',
            game_id: gid,
            from,
            to,
            promotion: aiMove.promotion || null,
            san: aiMove.san,
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

            const gameOverPayload = {
              type: 'chess_over',
              game_id: gid,
              result,
              reason,
              fen: board.fen()
            };
            send(ws, gameOverPayload);
          }
        } else {
          send(ws, { type: 'chess_error', message: 'AI move is invalid' });
        }
      } catch (err) {
        console.error('AI move error:', err);
        send(ws, { type: 'chess_error', message: 'AI move generation failed' });
      }
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

      try {
        const bestMove = await bestMoveWithStockfish(board.fen(), eloToDepth(g.aiElo), g.aiElo);

        if (!bestMove) {
          send(ws, { type: 'chess_error', message: 'AI move generation failed' });
          return;
        }

        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        const promotion = bestMove.length > 4 ? bestMove[4] : null;

        const aiMoveSpec = { from, to };
        if (promotion) aiMoveSpec.promotion = promotion;
        const aiMove = board.move(aiMoveSpec);

        if (aiMove) {
          const aiMovePayload = {
            type: 'chess_move',
            game_id: gid,
            from,
            to,
            promotion: aiMove.promotion || null,
            san: aiMove.san,
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

            const gameOverPayload = {
              type: 'chess_over',
              game_id: gid,
              result,
              reason,
              fen: board.fen()
            };
            send(ws, gameOverPayload);
          }
        } else {
          send(ws, { type: 'chess_error', message: 'AI move is invalid' });
        }
      } catch (err) {
        console.error('AI move error:', err);
        send(ws, { type: 'chess_error', message: 'AI move generation failed' });
      }
    }
  });

  ws.on('close', () => {
    const uname = users.get(ws);
    users.delete(ws);
    pings.delete(ws);
    userMessageTimes.delete(ws);
    if (usernameToWs.get(uname) === ws) usernameToWs.delete(uname);
    sendUserList();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
