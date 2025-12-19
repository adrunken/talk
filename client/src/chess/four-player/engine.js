/*
  4-Player Free-For-All Chess Engine
  Includes: check, checkmate, castling, en passant, promotion, elimination
*/

export const COLORS = ['red','blue','yellow','green'];

export const PAWN_DIR = {
  red:    { x: -1, y: 0 },
  blue:   { x: 0,  y: -1 },
  yellow: { x: 1,  y: 0 },
  green:  { x: 0,  y: 1 }
};

export const engine = {
  board: Array.from({ length: 14 }, () => Array(14).fill(null)),
  turnOrder: COLORS,
  currentTurnIndex: 0,
  activePlayers: [...COLORS],
  lastMove: null
};

const INVALID = "invalid";

function inBounds(x, y) {
  return x >= 0 && x < 14 && y >= 0 && y < 14;
}

function getSquare(board, x, y) {
  if (!inBounds(x, y)) return INVALID;
  return board[y][x];
}

export function isPromotionSquare(x, y, color) {
  return (
    (color === 'red'    && x === 0)  ||
    (color === 'yellow' && x === 13) ||
    (color === 'blue'   && y === 0)  ||
    (color === 'green'  && y === 13)
  );
}

export function findKing(color, board = engine.board) {
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 14; x++) {
      const p = board[y][x];
      if (p && p.type === 'king' && p.color === color) {
        return { x, y };
      }
    }
  }
  return null;
}

export function isKingInCheck(color, board = engine.board) {
  const king = findKing(color, board);
  if (!king) return false;

  for (const enemy of engine.activePlayers) {
    if (enemy === color) continue;

    for (let y = 0; y < 14; y++) {
      for (let x = 0; x < 14; x++) {
        const p = board[y][x];
        if (p && p.color === enemy) {
          const moves = getPseudoMoves(p, x, y, board, true);
          if (moves.some(m => m.x === king.x && m.y === king.y)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function leavesKingInCheck(color, fx, fy, tx, ty) {
  const copy = structuredClone(engine.board);
  copy[ty][tx] = copy[fy][fx];
  copy[fy][fx] = null;
  return isKingInCheck(color, copy);
}

export function getLegalMoves(x, y) {
  const piece = engine.board[y][x];
  if (!piece) return [];
  if (piece.color !== engine.turnOrder[engine.currentTurnIndex]) return [];

  return getPseudoMoves(piece, x, y)
    .filter(m => !leavesKingInCheck(piece.color, x, y, m.x, m.y));
}

/* ---------------- EN PASSANT ---------------- */

export function canEnPassant(pawn, fx, fy, tx, ty) {
  const lm = engine.lastMove;
  if (!lm) return false;
  if (lm.piece.type !== 'pawn') return false;
  if (!lm.twoSquare) return false;
  if (lm.piece.color === pawn.color) return false;

  if (
    Math.abs(lm.to.x - fx) + Math.abs(lm.to.y - fy) !== 1
  ) return false;

  const dir = PAWN_DIR[pawn.color];
  return (
    tx === lm.to.x + dir.x &&
    ty === lm.to.y + dir.y
  );
}

/* ---------------- CASTLING ---------------- */

const CASTLING = {
  red: {
    king: { x: 10, y: 7 },
    rookK: { x: 13, y: 7 },
    rookQ: { x: 7, y: 7 },
    pathK: [{ x: 11, y: 7 }, { x: 12, y: 7 }],
    pathQ: [{ x: 9, y: 7 }, { x: 8, y: 7 }]
  },
  yellow: {
    king: { x: 3, y: 7 },
    rookK: { x: 0, y: 7 },
    rookQ: { x: 6, y: 7 },
    pathK: [{ x: 2, y: 7 }, { x: 1, y: 7 }],
    pathQ: [{ x: 4, y: 7 }, { x: 5, y: 7 }]
  },
  blue: {
    king: { x: 7, y: 10 },
    rookK: { x: 7, y: 13 },
    rookQ: { x: 7, y: 7 },
    pathK: [{ x: 7, y: 11 }, { x: 7, y: 12 }],
    pathQ: [{ x: 7, y: 9 }, { x: 7, y: 8 }]
  },
  green: {
    king: { x: 7, y: 3 },
    rookK: { x: 7, y: 0 },
    rookQ: { x: 7, y: 6 },
    pathK: [{ x: 7, y: 2 }, { x: 7, y: 1 }],
    pathQ: [{ x: 7, y: 4 }, { x: 7, y: 5 }]
  }
};

export function canCastle(color, side, board = engine.board) {
  const cfg = CASTLING[color];
  const king = board[cfg.king.y][cfg.king.x];
  const rookPos = side === 'king' ? cfg.rookK : cfg.rookQ;
  const rook = board[rookPos.y][rookPos.x];

  if (!king || !rook) return false;
  if (king.hasMoved || rook.hasMoved) return false;

  const path = side === 'king' ? cfg.pathK : cfg.pathQ;

  for (const sq of path) {
    if (board[sq.y][sq.x]) return false;
  }

  if (isKingInCheck(color, board)) return false;

  for (const sq of path) {
    const copy = structuredClone(board);
    copy[sq.y][sq.x] = copy[cfg.king.y][cfg.king.x];
    copy[cfg.king.y][cfg.king.x] = null;
    if (isKingInCheck(color, copy)) return false;
  }

  return true;
}

export function isCheckmated(color) {
  if (!isKingInCheck(color)) return false;

  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 14; x++) {
      const p = engine.board[y][x];
      if (p && p.color === color && getLegalMoves(x, y).length > 0) {
        return false;
      }
    }
  }
  return true;
}

export function eliminatePlayer(color) {
  engine.activePlayers = engine.activePlayers.filter(c => c !== color);
}

/* Helper: Get pseudo-legal moves for a piece (doesn't check king safety) */
function getPseudoMoves(piece, x, y, board = engine.board, ignoreCheck = false) {
  const moves = [];

  if (piece.type === 'pawn') {
    const dir = PAWN_DIR[piece.color];
    const fwd = { x: x + dir.x, y: y + dir.y };
    const fwdFwd = { x: x + 2 * dir.x, y: y + 2 * dir.y };

    if (inBounds(fwd.x, fwd.y) && !getSquare(board, fwd.x, fwd.y)) {
      moves.push(fwd);
      if (!piece.hasMoved && inBounds(fwdFwd.x, fwdFwd.y) && !getSquare(board, fwdFwd.x, fwdFwd.y)) {
        moves.push({ ...fwdFwd, twoSquare: true });
      }
    }

    for (const dx of [-1, 1]) {
      const cap = { x: x + dx + dir.x, y: y + dir.y };
      if (inBounds(cap.x, cap.y)) {
        const target = getSquare(board, cap.x, cap.y);
        if (target && target.color !== piece.color) {
          moves.push(cap);
        } else if (canEnPassant(piece, x, y, cap.x, cap.y)) {
          moves.push(cap);
        }
      }
    }
  } else if (piece.type === 'knight') {
    const jumps = [
      { x: x + 2, y: y + 1 }, { x: x + 2, y: y - 1 },
      { x: x - 2, y: y + 1 }, { x: x - 2, y: y - 1 },
      { x: x + 1, y: y + 2 }, { x: x + 1, y: y - 2 },
      { x: x - 1, y: y + 2 }, { x: x - 1, y: y - 2 }
    ];
    for (const jump of jumps) {
      if (inBounds(jump.x, jump.y)) {
        const target = getSquare(board, jump.x, jump.y);
        if (!target || target.color !== piece.color) {
          moves.push(jump);
        }
      }
    }
  } else if (piece.type === 'bishop' || piece.type === 'queen') {
    const diags = [{ dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }];
    for (const { dx, dy } of diags) {
      for (let d = 1; d < 14; d++) {
        const nx = x + d * dx, ny = y + d * dy;
        if (!inBounds(nx, ny)) break;
        const target = getSquare(board, nx, ny);
        if (target && target.color === piece.color) break;
        moves.push({ x: nx, y: ny });
        if (target) break;
      }
    }
  }
  if (piece.type === 'rook' || piece.type === 'queen') {
    const straights = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    for (const { dx, dy } of straights) {
      for (let d = 1; d < 14; d++) {
        const nx = x + d * dx, ny = y + d * dy;
        if (!inBounds(nx, ny)) break;
        const target = getSquare(board, nx, ny);
        if (target && target.color === piece.color) break;
        moves.push({ x: nx, y: ny });
        if (target) break;
      }
    }
  }
  if (piece.type === 'king') {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (inBounds(nx, ny)) {
          const target = getSquare(board, nx, ny);
          if (!target || target.color !== piece.color) {
            moves.push({ x: nx, y: ny });
          }
        }
      }
    }
    if (canCastle(piece.color, 'king', board)) {
      const cfg = CASTLING[piece.color];
      moves.push({ x: cfg.king.x + 2, y: cfg.king.y });
    }
    if (canCastle(piece.color, 'queen', board)) {
      const cfg = CASTLING[piece.color];
      moves.push({ x: cfg.king.x - 2, y: cfg.king.y });
    }
  }

  return moves;
}
