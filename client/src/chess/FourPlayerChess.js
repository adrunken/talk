/**
 * 4-Player Chess Game Engine
 * Supports 4 independent players on a 14x14 board
 *
 * Board Layout:
 * - Files: a-n (0-13)
 * - Ranks: 1-14 (0-13, where 0=rank1, 13=rank14)
 *
 * Player Positions (Free-For-All):
 * - White: ranks 12-13, files 0-13 (bottom, moves UP/dy=-1)
 * - Red: ranks 0-1, files 0-13 (top, moves DOWN/dy=+1)
 * - Black: files 12-13, ranks 0-13 (right, moves LEFT/dx=-1)
 * - Blue: files 0-1, ranks 0-13 (left, moves RIGHT/dx=+1)
 *
 * Turn order: White → Red → Black → Blue
 * Invalid squares: corners (row<2 && col<2), (row<2 && col>11), (row>11 && col<2), (row>11 && col>11)
 */

const PIECE_TYPES = {
  PAWN: 'p',
  KNIGHT: 'n',
  BISHOP: 'b',
  ROOK: 'r',
  QUEEN: 'q',
  KING: 'k',
};

const PLAYERS = {
  WHITE: 0,
  RED: 1,
  BLACK: 2,
  BLUE: 3,
};

const PLAYER_NAMES = {
  [PLAYERS.WHITE]: 'white',
  [PLAYERS.RED]: 'red',
  [PLAYERS.BLACK]: 'black',
  [PLAYERS.BLUE]: 'blue',
};

const PLAYER_COLORS = {
  [PLAYERS.WHITE]: '#f5f5dc',
  [PLAYERS.RED]: '#e74c3c',
  [PLAYERS.BLACK]: '#2c3e50',
  [PLAYERS.BLUE]: '#3498db',
};

export class FourPlayerChess {
  constructor() {
    this.board = this.createEmptyBoard();
    this.turnIndex = 0;
    this.playerOrder = [PLAYERS.WHITE, PLAYERS.RED, PLAYERS.BLACK, PLAYERS.BLUE];
    this.eliminatedPlayers = new Set();
    this.moveHistory = [];
    this.boardSnapshots = [];
    this.scores = {
      [PLAYERS.WHITE]: 0,
      [PLAYERS.RED]: 0,
      [PLAYERS.BLACK]: 0,
      [PLAYERS.BLUE]: 0,
    };
    this.kingPositions = {
      [PLAYERS.WHITE]: null,
      [PLAYERS.RED]: null,
      [PLAYERS.BLACK]: null,
      [PLAYERS.BLUE]: null,
    };
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
    // Standard back row pattern: R N B Q K B N R R N B R Q B (14 pieces, 1 king)
    const standardBackRow = [
      PIECE_TYPES.ROOK, PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP, PIECE_TYPES.QUEEN,
      PIECE_TYPES.KING, PIECE_TYPES.BISHOP, PIECE_TYPES.KNIGHT, PIECE_TYPES.ROOK,
      PIECE_TYPES.ROOK, PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP, PIECE_TYPES.ROOK,
      PIECE_TYPES.QUEEN, PIECE_TYPES.BISHOP,
    ];

    // WHITE (bottom): rank 12=back, rank 11=pawns, moves UP (dy=-1)
    for (let f = 0; f < 14; f++) {
      this.placePiece(11, f, { type: PIECE_TYPES.PAWN, player: PLAYERS.WHITE, hasMoved: false });
    }
    for (let f = 0; f < 14; f++) {
      const piece = { type: standardBackRow[f], player: PLAYERS.WHITE };
      this.placePiece(12, f, piece);
      if (standardBackRow[f] === PIECE_TYPES.KING) {
        this.kingPositions[PLAYERS.WHITE] = [12, f];
      }
    }

    // RED (top): rank 1=back, rank 2=pawns, moves DOWN (dy=+1)
    // Place reversed to face opposite direction
    for (let f = 0; f < 14; f++) {
      this.placePiece(2, f, { type: PIECE_TYPES.PAWN, player: PLAYERS.RED, hasMoved: false });
    }
    for (let f = 0; f < 14; f++) {
      const piece = { type: standardBackRow[13 - f], player: PLAYERS.RED };
      this.placePiece(1, f, piece);
      if (standardBackRow[13 - f] === PIECE_TYPES.KING) {
        this.kingPositions[PLAYERS.RED] = [1, f];
      }
    }

    // BLACK (right): file 12=back, file 11=pawns, moves LEFT (dx=-1)
    // Place vertically from rank 0 to 13
    for (let r = 0; r < 14; r++) {
      if (!this.isInvalidSquare(r, 11)) {
        this.placePiece(r, 11, { type: PIECE_TYPES.PAWN, player: PLAYERS.BLACK, hasMoved: false });
      }
    }
    for (let r = 0; r < 14; r++) {
      if (!this.isInvalidSquare(r, 12)) {
        const piece = { type: standardBackRow[13 - r], player: PLAYERS.BLACK };
        this.placePiece(r, 12, piece);
        if (standardBackRow[13 - r] === PIECE_TYPES.KING) {
          this.kingPositions[PLAYERS.BLACK] = [r, 12];
        }
      }
    }

    // BLUE (left): file 1=back, file 2=pawns, moves RIGHT (dx=+1)
    // Place vertically from rank 0 to 13
    for (let r = 0; r < 14; r++) {
      if (!this.isInvalidSquare(r, 2)) {
        this.placePiece(r, 2, { type: PIECE_TYPES.PAWN, player: PLAYERS.BLUE, hasMoved: false });
      }
    }
    for (let r = 0; r < 14; r++) {
      if (!this.isInvalidSquare(r, 1)) {
        const piece = { type: standardBackRow[r], player: PLAYERS.BLUE };
        this.placePiece(r, 1, piece);
        if (standardBackRow[r] === PIECE_TYPES.KING) {
          this.kingPositions[PLAYERS.BLUE] = [r, 1];
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
      return false; // Can't capture own piece
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
    const piece = this.getPiece(fromRank, fromFile);

    if (player === PLAYERS.WHITE) {
      // White moves UP: rank decreases (11 -> 10 -> ... -> 1)
      // Single forward move
      if (fileAbs === 0 && rankDiff === -1 && !target) return true;
      // Double forward move from starting position
      if (fileAbs === 0 && rankDiff === -2 && fromRank === 11 && !target && !this.getPiece(fromRank - 1, fromFile)) {
        return true;
      }
      // Capture diagonals: (-1,-1), (+1,-1) in (file, rank) space
      if (rankDiff === -1 && fileAbs === 1 && target && target.player !== player) return true;
    } else if (player === PLAYERS.RED) {
      // Red moves DOWN: rank increases (2 -> 3 -> ... -> 13)
      // Single forward move
      if (fileAbs === 0 && rankDiff === 1 && !target) return true;
      // Double forward move from starting position
      if (fileAbs === 0 && rankDiff === 2 && fromRank === 2 && !target && !this.getPiece(fromRank + 1, fromFile)) {
        return true;
      }
      // Capture diagonals: (-1,+1), (+1,+1) in (file, rank) space
      if (rankDiff === 1 && fileAbs === 1 && target && target.player !== player) return true;
    } else if (player === PLAYERS.BLACK) {
      // Black moves LEFT: file decreases (11 -> 10 -> ... -> 1)
      // Single forward move
      if (rankAbs === 0 && fileDiff === -1 && !target) return true;
      // Double forward move from starting position
      if (rankAbs === 0 && fileDiff === -2 && fromFile === 11 && !target && !this.getPiece(fromRank, fromFile - 1)) {
        return true;
      }
      // Capture diagonals: (-1,-1), (-1,+1) in (file, rank) space
      if (fileDiff === -1 && rankAbs === 1 && target && target.player !== player) return true;
    } else if (player === PLAYERS.BLUE) {
      // Blue moves RIGHT: file increases (2 -> 3 -> ... -> 13)
      // Single forward move
      if (rankAbs === 0 && fileDiff === 1 && !target) return true;
      // Double forward move from starting position
      if (rankAbs === 0 && fileDiff === 2 && fromFile === 2 && !target && !this.getPiece(fromRank, fromFile + 1)) {
        return true;
      }
      // Capture diagonals: (+1,-1), (+1,+1) in (file, rank) space
      if (fileDiff === 1 && rankAbs === 1 && target && target.player !== player) return true;
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

    // Check if any opponent piece can attack the king
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

  shouldPromotePawn(rank, player) {
    // Check if pawn reached promotion rank for each player
    if (player === PLAYERS.BLUE && rank === 13) return true;
    if (player === PLAYERS.RED && rank === 0) return true;
    if (player === PLAYERS.YELLOW && rank === 13) return true;
    if (player === PLAYERS.GREEN && rank === 0) return true;
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

    // Check if pawn promotion is needed
    if (piece.type === PIECE_TYPES.PAWN && this.shouldPromotePawn(toRank, player)) {
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

    // Make the move
    this.board[toRank][toFile] = piece;
    this.board[fromRank][fromFile] = null;

    // Update king position
    if (piece.type === PIECE_TYPES.KING) {
      this.kingPositions[player] = [toRank, toFile];
    }

    // Handle pawn promotion
    if (piece.type === PIECE_TYPES.PAWN && promotionType) {
      piece.type = promotionType;
    }

    // Record move
    this.moveHistory.push({
      from: fromNotation,
      to: toNotation,
      piece: piece.type,
      captured: captured ? captured.type : null,
      capturedPlayer: captured ? captured.player : null,
      promotion: promotionType,
      player,
    });

    // Handle scoring
    if (captured) {
      const points = this.getPieceValue(captured.type);
      this.scores[player] += points;

      if (captured.type === PIECE_TYPES.KING) {
        this.eliminatedPlayers.add(captured.player);
      }
    }

    // Advance turn
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
      [PIECE_TYPES.KING]: 20, // Only for checkmate
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
              if (this.canMovePiece(r, f, tr, tf, player)) {
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

  isStalemate(player) {
    if (this.isKingInCheck(player)) {
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
      isStalemate: this.isStalemate(currentPlayer),
      isGameOver: this.isGameOver(),
      winner: this.getWinner(),
      eliminatedPlayers: Array.from(this.eliminatedPlayers),
      scores: { ...this.scores },
    };

    if (this.isCheckmate(currentPlayer)) {
      status.message = `${status.playerName} is checkmated!`;
    } else if (this.isStalemate(currentPlayer)) {
      status.message = `${status.playerName} is stalemated!`;
    } else if (status.isCheck) {
      status.message = `${status.playerName} is in check!`;
    }

    return status;
  }
}

export { PIECE_TYPES, PLAYERS, PLAYER_NAMES, PLAYER_COLORS };
