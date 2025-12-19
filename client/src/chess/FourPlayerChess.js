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
    // BLUE (bottom): ranks 0-1, files 0-13
    // Rank 1: Blue's pawns
    for (let f = 0; f < 14; f++) {
      this.placePiece(1, f, { type: PIECE_TYPES.PAWN, player: PLAYERS.BLUE });
    }

    // Rank 0: Blue's back row
    const blueBack = [
      PIECE_TYPES.ROOK, PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP, PIECE_TYPES.QUEEN,
      PIECE_TYPES.KING, PIECE_TYPES.BISHOP, PIECE_TYPES.KNIGHT, PIECE_TYPES.ROOK,
      PIECE_TYPES.ROOK, PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP, PIECE_TYPES.QUEEN,
      PIECE_TYPES.KING, PIECE_TYPES.BISHOP,
    ];
    for (let f = 0; f < 14; f++) {
      const piece = { type: blueBack[f], player: PLAYERS.BLUE };
      this.placePiece(0, f, piece);
      if (blueBack[f] === PIECE_TYPES.KING) {
        this.kingPositions[PLAYERS.BLUE] = [0, f];
      }
    }

    // YELLOW (left): files 0-1, ranks 0-13
    // File 0: Yellow's pawns (ranks 2-11)
    for (let r = 2; r < 12; r++) {
      this.placePiece(r, 0, { type: PIECE_TYPES.PAWN, player: PLAYERS.YELLOW });
    }

    // File 1: Yellow's back row
    const yellowBack = [
      [0, PIECE_TYPES.ROOK], [1, PIECE_TYPES.KNIGHT], [13, PIECE_TYPES.BISHOP],
      [12, PIECE_TYPES.QUEEN], [11, PIECE_TYPES.KING], [10, PIECE_TYPES.BISHOP],
      [9, PIECE_TYPES.KNIGHT], [8, PIECE_TYPES.ROOK], [7, PIECE_TYPES.ROOK],
      [6, PIECE_TYPES.KNIGHT], [5, PIECE_TYPES.BISHOP], [4, PIECE_TYPES.QUEEN],
      [3, PIECE_TYPES.KING], [2, PIECE_TYPES.BISHOP],
    ];
    for (const [r, type] of yellowBack) {
      const piece = { type, player: PLAYERS.YELLOW };
      this.placePiece(r, 1, piece);
      if (type === PIECE_TYPES.KING) {
        this.kingPositions[PLAYERS.YELLOW] = [r, 1];
      }
    }

    // RED (top): ranks 12-13, files 0-13
    // Rank 12: Red's pawns (opposite of Blue)
    for (let f = 0; f < 14; f++) {
      this.placePiece(12, f, { type: PIECE_TYPES.PAWN, player: PLAYERS.RED });
    }

    // Rank 13: Red's back row (reversed, facing down)
    const redBack = [
      PIECE_TYPES.ROOK, PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP, PIECE_TYPES.QUEEN,
      PIECE_TYPES.KING, PIECE_TYPES.BISHOP, PIECE_TYPES.KNIGHT, PIECE_TYPES.ROOK,
      PIECE_TYPES.ROOK, PIECE_TYPES.KNIGHT, PIECE_TYPES.BISHOP, PIECE_TYPES.QUEEN,
      PIECE_TYPES.KING, PIECE_TYPES.BISHOP,
    ];
    for (let f = 0; f < 14; f++) {
      const piece = { type: redBack[13 - f], player: PLAYERS.RED };
      this.placePiece(13, f, piece);
      if (piece.type === PIECE_TYPES.KING) {
        this.kingPositions[PLAYERS.RED] = [13, f];
      }
    }

    // GREEN (right): files 12-13, ranks 0-13
    // File 13: Green's pawns (ranks 2-11)
    for (let r = 2; r < 12; r++) {
      this.placePiece(r, 13, { type: PIECE_TYPES.PAWN, player: PLAYERS.GREEN });
    }

    // File 12: Green's back row (facing left)
    const greenBack = [
      [0, PIECE_TYPES.ROOK], [1, PIECE_TYPES.KNIGHT], [13, PIECE_TYPES.BISHOP],
      [12, PIECE_TYPES.QUEEN], [11, PIECE_TYPES.KING], [10, PIECE_TYPES.BISHOP],
      [9, PIECE_TYPES.KNIGHT], [8, PIECE_TYPES.ROOK], [7, PIECE_TYPES.ROOK],
      [6, PIECE_TYPES.KNIGHT], [5, PIECE_TYPES.BISHOP], [4, PIECE_TYPES.QUEEN],
      [3, PIECE_TYPES.KING], [2, PIECE_TYPES.BISHOP],
    ];
    for (const [r, type] of greenBack) {
      const piece = { type, player: PLAYERS.GREEN };
      this.placePiece(r, 12, piece);
      if (type === PIECE_TYPES.KING) {
        this.kingPositions[PLAYERS.GREEN] = [r, 12];
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
    return rank >= 0 && rank < 14 && file >= 0 && file < 14;
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
    const fileAbs = Math.abs(fileDiff);
    const target = this.getPiece(toRank, toFile);

    if (player === PLAYERS.BLUE) {
      // Blue moves up (rank increases)
      if (fileAbs === 0 && rankDiff === 1 && !target) return true;
      if (fileAbs === 1 && rankDiff === 1 && target && target.player !== player) return true;
    } else if (player === PLAYERS.RED) {
      // Red moves down (rank decreases)
      if (fileAbs === 0 && rankDiff === -1 && !target) return true;
      if (fileAbs === 1 && rankDiff === -1 && target && target.player !== player) return true;
    } else if (player === PLAYERS.YELLOW) {
      // Yellow moves right (file increases)
      const fileDiffForward = toFile - fromFile;
      const rankAbs = Math.abs(toRank - fromRank);
      if (rankAbs === 0 && fileDiffForward === 1 && !target) return true;
      if (rankAbs === 1 && fileDiffForward === 1 && target && target.player !== player) return true;
    } else if (player === PLAYERS.GREEN) {
      // Green moves left (file decreases)
      const fileDiffForward = fromFile - toFile;
      const rankAbs = Math.abs(toRank - fromRank);
      if (rankAbs === 0 && fileDiffForward === 1 && !target) return true;
      if (rankAbs === 1 && fileDiffForward === 1 && target && target.player !== player) return true;
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
