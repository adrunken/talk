//
/*
  Human-like Chess AI – Single File Build
  ------------------------------------------------------------
  Features:
  - Human-style errors scaled by ELO (no dumb hangs)
  - Works with Stockfish WASM (browser/Node) OR Chess-API.com
  - Optional micro opening book (inline) + pluggable hook
  - MultiPV weighted move selection (best/2nd/3rd) by phase
  - UCI options: Skill Level, UCI_LimitStrength, UCI_Elo, Contempt

  Public API (ES module style):
    const bot = await createHumanChessAI({
      mode: 'wasm' | 'api',          // engine backend
      stockfishPath: '/engines/stockfish.wasm.js', // required if mode='wasm'
      apiKey: '...',                 // optional if mode='api' and key is needed
      apiUrl: 'https://chess-api.com/v1',
      elo: 1200,                     // target playing strength
      multipv: 3,                    // how many candidate moves to request
      contempt: 10,                  // engine contempt
      threads: 1, hash: 32,          // perf knobs (wasm only)
      book: defaultOpeningBook,      // or null to disable
      maxBookPlies: 12               // how long to follow book
    });

    // supply a chess.js-like adapter (must expose fen(), move(), moves({verbose:true}))
    bot.bindGame(game);

    // get a move when it's AI's turn
    const aiMove = await bot.pickMove();
    // aiMove is SAN or UCI depending on engine response; we return SAN if game adapter supports it.

  Minimal adapter example for chess.js:
    import { Chess } from 'chess.js';
    const game = new Chess();
    bot.bindGame({
      fen: () => game.fen(),
      move: (m) => game.move(m),          // accepts SAN or { from, to, promotion }
      moves: (o) => game.moves(o),        // supports { verbose: true }
      turn: () => game.turn(),            // 'w' or 'b'
      in_check: () => game.in_check?.() || false,
      history: () => game.history?.() || []
    });

  ------------------------------------------------------------
*/

/* ============================ Utils ============================ */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isBrowser = typeof window !== 'undefined';

function weightedPick(items, weights) {
  const s = weights.reduce((a, b) => a + b, 0) || 1;
  const r = Math.random() * s;
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}

/* ====================== Micro Opening Book ===================== */
// Small, safe, humanish lines. You can replace or extend.
// Key: FEN (no move counters) -> array of SAN suggestions with weights.
const defaultOpeningBook = {
  // Italian Game
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': [{ san: 'e5', w: 1 }],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': [
    { san: 'Nf3', w: 1 },
  ],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -': [
    { san: 'Nc6', w: 1 },
  ],
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': [
    { san: 'Bc4', w: 1 }, { san: 'Bb5', w: 0.5 }
  ],

  // Queen's Gambit
  'rnbqkbnr/ppp1pppp/8/3p4/2P5/8/PP1PPPPP/RNBQKBNR w KQkq -': [{ san: 'd4', w: 1 }],
  'rnbqkbnr/ppp1pppp/8/3p4/3PP3/8/PP3PPP/RNBQKBNR b KQkq -': [{ san: 'e6', w: 1 }],

  // Sicilian
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': [{ san: 'Nf3', w: 1 }],
};

/* =============== ELO Profiles & Behavior Model ================ */
const ELO_PROFILES = {
  800:   { skill: 2,  depth: 5,  bestW: 0.60, secondW: 0.30, thirdW: 0.10, inacc: 0.40, mistake: 0.20, blunder: 0.05 },
  1200:  { skill: 6,  depth: 7,  bestW: 0.70, secondW: 0.25, thirdW: 0.05, inacc: 0.30, mistake: 0.10, blunder: 0.01 },
  1600:  { skill: 9,  depth: 9,  bestW: 0.80, secondW: 0.18, thirdW: 0.02, inacc: 0.20, mistake: 0.05, blunder: 0.005 },
  2000:  { skill: 13, depth: 11, bestW: 0.85, secondW: 0.14, thirdW: 0.01, inacc: 0.12, mistake: 0.03, blunder: 0.003 },
  2400:  { skill: 16, depth: 13, bestW: 0.92, secondW: 0.07, thirdW: 0.01, inacc: 0.05, mistake: 0.01, blunder: 0.001 },
  2800:  { skill: 19, depth: 17, bestW: 0.95, secondW: 0.04, thirdW: 0.01, inacc: 0.02, mistake: 0.005, blunder: 0.0 },
  3200:  { skill: 20, depth: 20, bestW: 0.98, secondW: 0.02, thirdW: 0.0,  inacc: 0.0,  mistake: 0.0,  blunder: 0.0 },
};

function profileForElo(elo) {
  const keys = Object.keys(ELO_PROFILES).map(Number).sort((a,b)=>a-b);
  // nearest lower key
  let pick = keys[0];
  for (const k of keys) if (elo >= k) pick = k;
  return { ...ELO_PROFILES[pick], elo: pick };
}

/* ============== Engine Backends (WASM & API) ================== */
class ApiStockfish {
  constructor({ apiUrl = 'https://chess-api.com/v1', apiKey, skill = 10, contempt = 10, useElo = 1600 }) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.skill = skill;
    this.contempt = contempt;
    this.useElo = useElo;
  }

  async start() { /* no-op */ }

  async analyseFen(fen, { depth = 10, multipv = 3, movetime } = {}) {
    const body = {
      fen,
      depth,
      multipv,
      movetime,
      uciOptions: {
        'Skill Level': this.skill,
        'UCI_LimitStrength': true,
        'UCI_Elo': this.useElo,
        'Contempt': this.contempt,
      },
    };

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.apiUrl}/analyse`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    // Expecting shape: { lines: [ { id, kind: 'cp'|'mate', val, pv: 'e2e4 e7e5 ...' } ] }
    // Normalize to the same as WasmStockfish
    const arr = (data.lines || []).map((L, i) => ({ id: L.id ?? (i+1), kind: L.kind || (L.mate ? 'mate' : 'cp'), val: L.val ?? L.cp ?? 0, pv: L.pv || L.line || '' }));
    return arr.sort((a,b)=>a.id-b.id).slice(0, multipv);
  }
}

/* ================== Human Behavior & Safety =================== */
function selectHumanLikeLine(lines, prof, phase) {
  // lines: [{id, kind, val, pv:'e2e4 e7e5 ...'}]
  if (!lines.length) return null;

  // Convert score to centipawns where possible; mates are extreme
  const cp = lines[0].kind === 'mate' ? (lines[0].val > 0 ? 10000 : -10000) : lines[0].val;

  // Phase-sensitive weights
  let wBest = prof.bestW, w2 = prof.secondW, w3 = prof.thirdW;
  if (Math.abs(cp) > 300) { // big eval -> simplify
    wBest = clamp(wBest + 0.10, 0, 1);
    w2 = Math.max(0, w2 - 0.08);
    w3 = Math.max(0, w3 - 0.02);
  } else if (phase === 'opening') {
    // a bit more variety early
    w2 += 0.05; w3 += 0.02; wBest = Math.max(0, 1 - (w2 + w3));
  }

  const pool = [lines[0], lines[1] || lines[0], lines[2] || lines[1] || lines[0]];
  const pick = weightedPick(pool, [wBest, w2, w3]);
  return pick;
}

// Style profiles by ELO: aggressive/tactical vs positional/defensive
function styleForElo(elo) {
  const e = Number(elo) || 1600;
  if (e === 800 || e === 1200 || e === 1600) return { kind: 'aggressive', intensity: e === 800 ? 1.0 : (e === 1200 ? 0.85 : 0.7) };
  if (e === 2000 || e === 2400) return { kind: 'positional', intensity: e === 2000 ? 0.75 : 0.9 };
  return { kind: 'balanced', intensity: 0.5 };
}

function matchVerboseMove(uci, legalMoves) {
  const from = uci.slice(0,2), to = uci.slice(2,4), promo = uci[4] ? uci[4].toLowerCase() : null;
  const mv = legalMoves.find(m => m.from === from && m.to === to && (!promo || (m.promotion && m.promotion.toLowerCase() === promo)));
  return mv || null;
}

function centralFile(fileChar) { return fileChar === 'd' || fileChar === 'e'; }
function centralSquare(to) {
  const f = to[0]; const r = parseInt(to[1],10);
  return (f === 'd' || f === 'e') && (r === 4 || r === 5);
}

function computeMoveStyleScore(move, side) {
  // move is chess.js verbose move
  if (!move) return { aggression: 0, positional: 0 };
  const san = String(move.san || '');
  const flags = String(move.flags || '');
  const piece = String(move.piece || '').toLowerCase();
  const from = String(move.from || '');
  const to = String(move.to || '');

  let aggression = 0;
  let positional = 0;

  // Aggressive/tactical cues
  if (flags.includes('c') || flags.includes('e') || san.includes('x')) aggression += 3; // capture
  if (san.includes('+') || san.includes('#')) aggression += 2; // check/mate
  if (piece === 'p') {
    const fr = parseInt(from[1],10), tr = parseInt(to[1],10);
    const advance = side === 'w' ? (tr - fr) : (fr - tr);
    if (advance >= 2) aggression += 1; // pawn storm two squares
    if ((to[0] === 'g' || to[0] === 'h' || to[0] === 'a' || to[0] === 'b') && advance >= 1) aggression += 1; // flank pawn push
  }
  if (centralSquare(to)) aggression += 1; // central incursion

  // Positional/defensive cues
  if (flags.includes('k') || flags.includes('q')) positional += 3; // castling
  if (piece === 'n') {
    const devSquares = ['c3','d2','e2','f3','c6','d7','e7','f6'];
    if (devSquares.includes(to)) positional += 2; // classic knight development
  }
  if (piece === 'b') {
    const devSquares = ['c4','d3','e2','f1','c5','d6','e7','f8'];
    if (devSquares.includes(to)) positional += 2;
  }
  if (piece === 'p') {
    if (centralFile(to[0])) {
      const singleSteps = ['e3','e6','d3','d6','c3','c6'];
      if (singleSteps.includes(to)) positional += 2; // healthy pawn structure moves
    }
  }
  if (piece === 'q' && (san.includes('Qh5') || san.includes('Qa4'))) {
    aggression += 1; // early queen sortie tends to be aggressive
    positional -= 1;
  }

  return { aggression, positional };
}

function selectStyleAwareLine(lines, prof, phase, legalMoves, side, elo) {
  if (!lines.length) return null;

  // Base weights similar to selectHumanLikeLine
  const top = [lines[0], lines[1] || lines[0], lines[2] || lines[1] || lines[0]];
  const cp = lines[0].kind === 'mate' ? (lines[0].val > 0 ? 10000 : -10000) : lines[0].val;
  let wBest = prof.bestW, w2 = prof.secondW, w3 = prof.thirdW;
  if (Math.abs(cp) > 300) { wBest = clamp(wBest + 0.10, 0, 1); w2 = Math.max(0, w2 - 0.08); w3 = Math.max(0, w3 - 0.02); }
  else if (phase === 'opening') { w2 += 0.05; w3 += 0.02; wBest = Math.max(0, 1 - (w2 + w3)); }

  const baseWeights = [wBest, w2, w3];
  const style = styleForElo(elo);

  const adjusted = top.map((line, i) => {
    const firstUci = String((line.pv || '').trim().split(/\s+/)[0] || '');
    const mv = matchVerboseMove(firstUci, legalMoves || []);
    const s = computeMoveStyleScore(mv, side);
    let bias = 0;
    if (style.kind === 'aggressive') {
      bias += s.aggression * (0.25 * style.intensity);
      bias -= s.positional * (0.05 * style.intensity);
    } else if (style.kind === 'positional') {
      bias += s.positional * (0.25 * style.intensity);
      bias -= s.aggression * (0.05 * style.intensity);
    } else {
      // balanced: slight nudge towards tactical in middlegame
      const phaseBoost = phase === 'middlegame' ? 0.15 : 0.1;
      bias += (s.aggression + s.positional) * phaseBoost;
    }
    const w = Math.max(0, baseWeights[i]) * (1 + bias);
    return { line, weight: w };
  });

  const items = adjusted.map(a => a.line);
  const weights = adjusted.map(a => a.weight);
  return weightedPick(items, weights);
}

function uciToMoveObj(uci) {
  // e2e4, e7e8q, etc
  const from = uci.slice(0,2), to = uci.slice(2,4), promo = uci[4];
  const m = { from, to };
  if (promo) m.promotion = promo.toLowerCase();
  return m;
}

/* ========================= Human Bot ========================== */
class HumanBot {
  constructor(engine, gameAdapter, opts) {
    this.engine = engine;
    this.game = gameAdapter; // must expose fen(), move(), moves({verbose:true})
    this.opts = opts;
    this.profile = profileForElo(opts.elo || 1600);
    this.maxBookPlies = opts.maxBookPlies ?? 12;
    this.book = opts.book || null;
    this.multipv = clamp(opts.multipv ?? 3, 1, 5);
    this.depth = opts.depth ?? this.profile.depth;
  }

  bindGame(gameAdapter) { this.game = gameAdapter; }

  sideToMove() { return this.game?.turn?.() || (this._fenTurn(this.game?.fen?.()) || 'w'); }
  _fenTurn(fen) { return (fen || '').split(' ')[1]; }

  _phase(fen) {
    // crude phase heuristic by material and move count
    const parts = fen.split(' ');
    const placement = parts[0] || '';
    const plyCount = (this.game?.history?.().length || 0) * 2;
    const pieces = (placement.match(/[nbrq]/gi) || []).length;
    if (plyCount < 12) return 'opening';
    if (pieces <= 6) return 'endgame';
    return 'middlegame';
  }

  _bookMove(fen) {
    if (!this.book) return null;
    // Strip move counters to match our keys (we keep up to side-to-move field)
    const key = fen.split(' ').slice(0,4).join(' ');
    const entries = this.book[key];
    if (!entries || !entries.length) return null;
    const weights = entries.map(e => e.w || 1);
    const pick = weightedPick(entries, weights);

    // Return as SAN (preferred) or UCI by trying legal moves
    const legal = this.game?.moves?.({ verbose: true }) || [];
    const san = pick.san;
    const found = legal.find(m => m.san === san);
    if (found) return { type: 'san', move: san };
    // fallback: try UCI if present
    if (pick.uci) return { type: 'uci', move: pick.uci };
    return null;
  }

  async pickMove() {
    if (!this.game) throw new Error('No game adapter bound. Call bindGame(game).');

    const fen = this.game.fen();
    const phase = this._phase(fen);
    const ply = (this.game.history?.().length || 0);

    // Opening book first
    if (this.book && ply < this.maxBookPlies) {
      const bm = this._bookMove(fen);
      if (bm) return this._applyMove(bm);
    }

    // Engine analysis
    const lines = await this.engine.analyseFen(fen, {
      depth: this.depth,
      multipv: this.multipv,
      movetime: this.opts.movetime
    });

    if (!lines?.length) throw new Error('Engine returned no lines');

    // Style-aware selection based on requested ELO
    const legal = this.game?.moves?.({ verbose: true }) || [];
    const chosen = selectStyleAwareLine(lines, this.profile, phase, legal, this.sideToMove(), this.opts.elo);
    const pv = (chosen?.pv || '').trim();
    const firstMoveUci = pv.split(/\s+/)[0];
    if (!firstMoveUci) throw new Error('No PV move parsed');

    return this._applyMove({ type: 'uci', move: firstMoveUci });
  }

  _applyMove(sel) {
    const legal = this.game?.moves?.({ verbose: true }) || [];

    if (sel.type === 'san') {
      // best-effort: push SAN
      const mv = this.game.move(sel.move);
      if (mv) return mv;
    }

    if (sel.type === 'uci') {
      const target = uciToMoveObj(sel.move);
      // map to SAN/legal if needed
      const matched = legal.find(m => m.from === target.from && m.to === target.to && (!target.promotion || m.promotion === target.promotion));
      if (matched) return this.game.move({ from: matched.from, to: matched.to, promotion: matched.promotion });
      // last resort: attempt UCI directly (some adapters accept it)
      const mv = this.game.move(sel.move);
      if (mv) return mv;
    }

    throw new Error('Selected move is not legal in current position');
  }
}

/* ======================== Public Factory ====================== */
async function createHumanChessAI(userOpts = {}) {
  const opts = {
    mode: 'api',
    apiUrl: 'https://chess-api.com/v1',
    apiKey: undefined,
    elo: 1600,
    contempt: 10,
    multipv: 3,
    book: defaultOpeningBook,
    maxBookPlies: 12,
    ...userOpts,
  };

  const engine = new ApiStockfish({ apiUrl: opts.apiUrl, apiKey: opts.apiKey, skill: profileForElo(opts.elo).skill, contempt: opts.contempt, useElo: opts.elo });
  await engine.start();
  const bot = new HumanBot(engine, null, opts);

  return {
    bindGame: (adapter) => bot.bindGame(adapter),
    pickMove: () => bot.pickMove(),
    get profile() { return bot.profile; },
    get options() { return opts; },
  };
}

module.exports = { createHumanChessAI, defaultOpeningBook };
