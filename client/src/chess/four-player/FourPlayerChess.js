/**
 * 4-Player Chess Game Engine
 * Supports 4 independent players on a 14x14 board using index-based player system
 * Player indices: 0=Red, 1=Blue, 2=Yellow, 3=Green
 * 
 * Board Layout:
 * - Files: a-n (0-13)
 * - Ranks: 1-14 (0-13, where 0=rank1, 13=rank14)
 *
 * Player Positions (Free-For-All):
 * - Player 0 (Red): ranks 0-1, moves DOWN (dy=+1)
 * - Player 1 (Blue): files 0-1, moves RIGHT (dx=+1)
 * - Player 2 (Yellow): ranks 12-13, moves UP (dy=-1)
 * - Player 3 (Green): files 12-13, moves LEFT (dx=-1)
 */

export const PIECE_TYPES = {
  PAWN: 'p',
  KNIGHT: 'n',
  BISHOP: 'b',
  ROOK: 'r',
  QUEEN: 'q',
  KING: 'k',
};

export const PLAYERS = {
  RED: 0,
  BLUE: 1,
  YELLOW: 2,
  GREEN: 3,
};

export const PLAYER_NAMES = {
  [PLAYERS.RED]: 'Red',
  [PLAYERS.BLUE]: 'Blue',
  [PLAYERS.YELLOW]: 'Yellow',
  [PLAYERS.GREEN]: 'Green',
};

export const PLAYER_COLORS = {
  [PLAYERS.RED]: '#e74c3c',
  [PLAYERS.BLUE]: '#3498db',
  [PLAYERS.YELLOW]: '#f1c40f',
  [PLAYERS.GREEN]: '#2ecc71',
};

// Pawn movement directions per player
const PAWN_DIR = {
  [PLAYERS.RED]: { x: 0, y: 1 },      // moves down
  [PLAYERS.BLUE]: { x: 1, y: 0 },     // moves right
  [PLAYERS.YELLOW]: { x: 0, y: -1 },  // moves up
  [PLAYERS.GREEN]: { x: -1, y: 0 }    // moves left
};

export class FourPlayerChess {
  constructor() {
    this.board = this.createEmptyBoard();
    this.turnIndex = 0;
    this.playerOrder = [PLAYERS.RED, PLAYERS.BLUE, PLAYERS.YELLOW, PLAYERS.GREEN];
    this.eliminatedPlayers = new Set();
    this.moveHistory = [];
    this.scores = {
      [PLAYERS.RED]: 0,
      [PLAYERS.BLUE]: 0,
      [PLAYERS.YELLOW]: 0,
      [PLAYERS.GREEN]: 0,
    };
    this.kingPositions = {
      [PLAYERS.RED]: null,
      [PLAYERS.BLUE]: null,
      [PLAYERS.YELLOW]: null,
      [PLAYERS.GREEN]: null,
    };
    this.lastMove = null;
    this.setupInitialPosition();
  }

  createEmptyBoard() {
    return Array(14).fill(null).map(() => Array(14).fill(null));
  }

  isInvalidSquare(rank, file) {
    if (rank < 2 && file < 2) return true;
    if (rank < 2 && file > 11) return true;
    if (rank > 11 && file < 2) return true;
    if (rank > 11 && file > 11) return true;
    return false;
  }

  setupInitialPosition() {
    const standardBackRow = [
      PIECE_TYPES.ROOK, PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP, PIECE_TYPES.QUEEN,
      PIECE_TYPES.KING, PIECE_TYPES.BISHOP, PIECE_TYPES.KNIGHT, PIECE_TYPES.ROOK,
      PIECE_TYPES.ROOK, PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP, PIECE_TYPES.ROOK,
      PIECE_TYPES.QUEEN, PIECE_TYPES.BISHOP,
    ];

    // Red (top, rank 0-1): moves down
    for (let f = 0; f < 14; f++) {
      this.placePiece(1, f, { type: PIECE_TYPES.PAWN, player: PLAYERS.RED, hasMoved: false });
    }
    for (let f = 0; f < 14; f++) {
      const piece = { type: standardBackRow[f], player: PLAYERS.RED };
      this.placePiece(0, f, piece);
      if (standardBackRow[f] === PIECE_TYPES.KING) {
        this.kingPositions[PLAYERS.RED] = [0, f];
      }
    }

    // Blue (left, file 0-1): moves right
    for (let r = 0; r < 14; r++) {
      if (!this.isInvalidSquare(r, 1)) {
        this.placePiece(r, 1, { type: PIECE_TYPES.PAWN, player: PLAYERS.BLUE, hasMoved: false });
      }
    }
    for (let r = 0; r < 14; r++) {
      if (!this.isInvalidSquare(r, 0)) {
        const piece = { type: standardBackRow[r], player: PLAYERS.BLUE };
        this.placePiece(r, 0, piece);
        if (standardBackRow[r] === PIECE_TYPES.KING) {
          this.kingPositions[PLAYERS.BLUE] = [r, 0];
        }
      }
    }

    // Yellow (bottom, rank 12-13): moves up
    for (let f = 0; f < 14; f++) {
      this.placePiece(12, f, { type: PIECE_TYPES.PAWN, player: PLAYERS.YELLOW, hasMoved: false });
    }
    for (let f = 0; f < 14; f++) {
      const piece = { type: standardBackRow[13 - f], player: PLAYERS.YELLOW };
      this.placePiece(13, f, piece);
      if (standardBackRow[13 - f] === PIECE_TYPES.KING) {
        this.kingPositions[PLAYERS.YELLOW] = [13, f];
      }
    }

    // Green (right, file 12-13): moves left
    for (let r = 0; r < 14; r++) {
      if (!this.isInvalidSquare(r, 12)) {
        this.placePiece(r, 12, { type: PIECE_TYPES.PAWN, player: PLAYERS.GREEN, hasMoved: false });
      }
    }
    for (let r = 0; r < 14; r++) {
      if (!this.isInvalidSquare(r, 13)) {
        const piece = { type: standardBackRow[13 - r], player: PLAYERS.GREEN };
        this.placePiece(r, 13, piece);
        if (standardBackRow[13 - r] === PIECE_TYPES.KING) {
          this.kingPositions[PLAYERS.GREEN] = [r, 13];
        }
      }
    }
  }

  placePiece(rank, file, piece) {
    if (this.isValidPosition(rank, file)) {
      this.board[rank][file] = piece;
    }
  }

  getPiece(rank, file) {
    if (this.isValidPosition(rank, file)) {
      return this.board[rank][file];
    }
    return null;
  }

  isValidPosition(rank, file) {
    if (rank < 0 || rank >= 14 || file < 0 || file >= 14) {
      return false;
    }
    if (this.isInvalidSquare(rank, file)) {
      return false;
    }
    return true;
  }

  getCurrentPlayer() {
    return this.playerOrder[this.turnIndex % 4];
  }

  getPlayerName(player) {
    return PLAYER_NAMES[player];
  }

  getPlayerColor(player) {
    return PLAYER_COLORS[player];
  }

  coordsToNotation(rank, file) {
    return String.fromCharCode(97 + file) + (rank + 1);
  }

  notationToCoords(notation) {
    if (notation.length < 2) return null;
    const file = notation.charCodeAt(0) - 97;
    const rank = parseInt(notation.slice(1)) - 1;
    if (this.isValidPosition(rank, file)) {
      return [rank, file];
    }
    return null;
  }

  canMovePiece(fromRank, fromFile, toRank, toFile, player) {
    const piece = this.getPiece(fromRank, fromFile);

    if (!piece || piece.player !== player) {
      return false;
    }

    const target = this.getPiece(toRank, toFile);
    if (target && target.player === player) {
      return false;
    }

    const rankDiff = toRank - fromRank;
    const fileDiff = toFile - fromFile;
    const rankAbs = Math.abs(rankDiff);
    const fileAbs = Math.abs(fileDiff);

    switch (piece.type) {
      case PIECE_TYPES.PAWN:
        return this.canPawnMove(fromRank, fromFile, toRank, toFile, player);
      case PIECE_TYPES.KNIGHT:
        return (rankAbs === 2 && fileAbs === 1) || (rankAbs === 1 && fileAbs === 2);
      case PIECE_TYPES.BISHOP:
        return rankAbs === fileAbs && this.isPathClear(fromRank, fromFile, toRank, toFile);
      case PIECE_TYPES.ROOK:
        return (rankDiff === 0 || fileDiff === 0) && this.isPathClear(fromRank, fromFile, toRank, toFile);
      case PIECE_TYPES.QUEEN:
        const isDiagonal = rankAbs === fileAbs;
        const isStraight = rankDiff === 0 || fileDiff === 0;
        return (isDiagonal || isStraight) && this.isPathClear(fromRank, fromFile, toRank, toFile);
      case PIECE_TYPES.KING:
        return rankAbs <= 1 && fileAbs <= 1 && (rankAbs + fileAbs > 0);
      default:
        return false;
    }
  }

  canPawnMove(fromRank, fromFile, toRank, toFile, player) {
    const rankDiff = toRank - fromRank;
    const fileDiff = toFile - fromFile;
    const rankAbs = Math.abs(rankDiff);
    const fileAbs = Math.abs(fileDiff);
    const target = this.getPiece(toRank, toFile);
    const dir = PAWN_DIR[player];

    if (player === PLAYERS.RED) {
      // Red moves down: rank increases (0 -> 1 -> ... -> 13)
      if (fileAbs === 0 && rankDiff === 1 && !target) return true;
      if (fileAbs === 0 && rankDiff === 2 && fromRank === 1 && !target && !this.getPiece(fromRank + 1, fromFile)) {
        return true;
      }
      if (rankDiff === 1 && fileAbs === 1 && target && target.player !== player) return true;
    } else if (player === PLAYERS.BLUE) {
      // Blue moves right: file increases (0 -> 1 -> ... -> 13)
      if (rankAbs === 0 && fileDiff === 1 && !target) return true;
      if (rankAbs === 0 && fileDiff === 2 && fromFile === 1 && !target && !this.getPiece(fromRank, fromFile + 1)) {
        return true;
      }
      if (fileDiff === 1 && rankAbs === 1 && target && target.player !== player) return true;
    } else if (player === PLAYERS.YELLOW) {
      // Yellow moves up: rank decreases (13 -> 12 -> ... -> 0)
      if (fileAbs === 0 && rankDiff === -1 && !target) return true;
      if (fileAbs === 0 && rankDiff === -2 && fromRank === 12 && !target && !this.getPiece(fromRank - 1, fromFile)) {
        return true;
      }
      if (rankDiff === -1 && fileAbs === 1 && target && target.player !== player) return true;
    } else if (player === PLAYERS.GREEN) {
      // Green moves left: file decreases (13 -> 12 -> ... -> 0)
      if (rankAbs === 0 && fileDiff === -1 && !target) return true;
      if (rankAbs === 0 && fileDiff === -2 && fromFile === 12 && !target && !this.getPiece(fromRank, fromFile - 1)) {
        return true;
      }
      if (fileDiff === -1 && rankAbs === 1 && target && target.player !== player) return true;
    }

    return false;
  }

  isPathClear(fromRank, fromFile, toRank, toFile) {
    const rankStep = fromRank === toRank ? 0 : (toRank > fromRank ? 1 : -1);
    const fileStep = fromFile === toFile ? 0 : (toFile > fromFile ? 1 : -1);

    let r = fromRank + rankStep;
    let f = fromFile + fileStep;

    while (r !== toRank || f !== toFile) {
      if (this.getPiece(r, f) !== null) {
        return false;
      }
      r += rankStep;
      f += fileStep;
    }

    return true;
  }

  getPlayerKingPosition(player) {
    return this.kingPositions[player];
  }

  isKingInCheck(player) {
    const kingPos = this.getPlayerKingPosition(player);
    if (!kingPos) return false;

    const [kingRank, kingFile] = kingPos;

    for (let r = 0; r < 14; r++) {
      for (let f = 0; f < 14; f++) {
        const piece = this.getPiece(r, f);
        if (piece && piece.player !== player && this.canMovePiece(r, f, kingRank, kingFile, piece.player)) {
          return true;
        }
      }
    }

    return false;
  }

  shouldPromotePawn(rank, file, player) {
    if (player === PLAYERS.RED && rank === 13) return true;
    if (player === PLAYERS.BLUE && file === 13) return true;
    if (player === PLAYERS.YELLOW && rank === 0) return true;
    if (player === PLAYERS.GREEN && file === 0) return true;
    return false;
  }

  makeMove(fromNotation, toNotation, promotionType = null) {
    const fromCoords = this.notationToCoords(fromNotation);
    const toCoords = this.notationToCoords(toNotation);

    if (!fromCoords || !toCoords) {
      return { success: false, error: 'Invalid coordinates' };
    }

    const [fromRank, fromFile] = fromCoords;
    const [toRank, toFile] = toCoords;
    const player = this.getCurrentPlayer();

    if (!this.canMovePiece(fromRank, fromFile, toRank, toFile, player)) {
      return { success: false, error: 'Illegal move' };
    }

    const piece = this.getPiece(fromRank, fromFile);
    const captured = this.getPiece(toRank, toFile);

    if (piece.type === PIECE_TYPES.PAWN && this.shouldPromotePawn(toRank, toFile, player)) {
      if (!promotionType) {
        return {
          success: false,
          error: 'Promotion required',
          requiresPromotion: true,
          from: fromNotation,
          to: toNotation,
        };
      }
    }

    this.board[toRank][toFile] = piece;
    this.board[fromRank][fromFile] = null;

    if (piece.type === PIECE_TYPES.KING) {
      this.kingPositions[player] = [toRank, toFile];
    }

    if (piece.type === PIECE_TYPES.PAWN) {
      piece.hasMoved = true;
    }

    if (piece.type === PIECE_TYPES.PAWN && promotionType) {
      piece.type = promotionType;
    }

    this.moveHistory.push({
      from: fromNotation,
      to: toNotation,
      piece: piece.type,
      captured: captured ? captured.type : null,
      capturedPlayer: captured ? captured.player : null,
      promotion: promotionType,
      player,
    });

    this.lastMove = {
      from: fromNotation,
      to: toNotation,
      fromRank,
      fromFile,
      toRank,
      toFile,
      piece: piece.type,
      player
    };

    if (captured) {
      const points = this.getPieceValue(captured.type);
      this.scores[player] += points;

      if (captured.type === PIECE_TYPES.KING) {
        this.eliminatedPlayers.add(captured.player);
      }
    }

    this.advanceTurn();

    return {
      success: true,
      move: `${fromNotation}${toNotation}`,
      capturedPiece: captured,
      newTurn: this.getCurrentPlayer(),
    };
  }

  getPieceValue(pieceType) {
    const values = {
      [PIECE_TYPES.PAWN]: 1,
      [PIECE_TYPES.KNIGHT]: 3,
      [PIECE_TYPES.BISHOP]: 5,
      [PIECE_TYPES.ROOK]: 5,
      [PIECE_TYPES.QUEEN]: 9,
      [PIECE_TYPES.KING]: 20,
    };
    return values[pieceType] || 0;
  }

  advanceTurn() {
    do {
      this.turnIndex = (this.turnIndex + 1) % 4;
    } while (this.eliminatedPlayers.has(this.getCurrentPlayer()));
  }

  isGameOver() {
    return this.eliminatedPlayers.size >= 3;
  }

  getWinner() {
    if (!this.isGameOver()) return null;
    for (const player of this.playerOrder) {
      if (!this.eliminatedPlayers.has(player)) {
        return player;
      }
    }
    return null;
  }

  getGameState() {
    return {
      board: this.board.map(row => [...row]),
      turn: this.getCurrentPlayer(),
      turnIndex: this.turnIndex,
      eliminated: Array.from(this.eliminatedPlayers),
      isOver: this.isGameOver(),
      winner: this.getWinner(),
      scores: { ...this.scores },
      moveHistory: [...this.moveHistory],
    };
  }

  getAvailableMoves(player) {
    const moves = [];
    for (let r = 0; r < 14; r++) {
      for (let f = 0; f < 14; f++) {
        const piece = this.getPiece(r, f);
        if (piece && piece.player === player) {
          for (let tr = 0; tr < 14; tr++) {
            for (let tf = 0; tf < 14; tf++) {
              if (this.isValidPosition(tr, tf) && this.canMovePiece(r, f, tr, tf, player)) {
                const fromNotation = this.coordsToNotation(r, f);
                const toNotation = this.coordsToNotation(tr, tf);
                moves.push({ from: fromNotation, to: toNotation, piece: piece.type });
              }
            }
          }
        }
      }
    }
    return moves;
  }

  isCheckmate(player) {
    if (!this.isKingInCheck(player)) {
      return false;
    }
    return this.getAvailableMoves(player).length === 0;
  }

  getGameStatus() {
    const currentPlayer = this.getCurrentPlayer();
    const status = {
      currentPlayer,
      playerName: this.getPlayerName(currentPlayer),
      isCheck: this.isKingInCheck(currentPlayer),
      isCheckmate: this.isCheckmate(currentPlayer),
      isGameOver: this.isGameOver(),
      winner: this.getWinner(),
      eliminatedPlayers: Array.from(this.eliminatedPlayers),
      scores: { ...this.scores },
    };

    if (this.isCheckmate(currentPlayer)) {
      status.message = `${status.playerName} is checkmated!`;
    } else if (status.isCheck) {
      status.message = `${status.playerName} is in check!`;
    }

    return status;
  }
}

export default FourPlayerChess;
