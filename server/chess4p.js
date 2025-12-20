class FourPlayerChess {
  constructor() {
    this.board = this.initializeBoard();
    this.players = {
      white: { color: 'white', index: 0 },
      black: { color: 'black', index: 1 },
      red: { color: 'red', index: 2 },
      yellow: { color: 'yellow', index: 3 }
    };
    this.currentPlayerIndex = 0;
    this.moveHistory = [];
    this.gameStatus = 'active'; // 'active', 'checkmate', 'stalemate', 'draw'
    this.capturedPieces = {
      white: [],
      black: [],
      red: [],
      yellow: []
    };
  }

  initializeBoard() {
    const board = Array(14).fill(null).map(() => Array(14).fill(null));
    
    // White pieces (bottom left)
    this.placePieces(board, 'white', 0, 0);
    
    // Black pieces (top right)
    this.placePieces(board, 'black', 13, 13);
    
    // Red pieces (top left)
    this.placePieces(board, 'red', 0, 13);
    
    // Yellow pieces (bottom right)
    this.placePieces(board, 'yellow', 13, 0);
    
    return board;
  }

  placePieces(board, color, startRow, startCol) {
    const isPaired = (color === 'white' || color === 'black');
    
    // Determine direction based on color
    const rowDir = color === 'white' || color === 'yellow' ? 1 : -1;
    const colDir = color === 'white' || color === 'red' ? 1 : -1;
    
    // Back row with major pieces
    const backRowOffset = isPaired ? 2 : 2;
    board[startRow + rowDir * backRowOffset][startCol + colDir * backRowOffset] = { type: 'rook', color };
    board[startRow + rowDir * backRowOffset][startCol + colDir * (backRowOffset + 1)] = { type: 'knight', color };
    board[startRow + rowDir * backRowOffset][startCol + colDir * (backRowOffset + 2)] = { type: 'bishop', color };
    board[startRow + rowDir * backRowOffset][startCol + colDir * (backRowOffset + 3)] = { type: 'queen', color };
    board[startRow + rowDir * backRowOffset][startCol + colDir * (backRowOffset + 4)] = { type: 'king', color };
    board[startRow + rowDir * backRowOffset][startCol + colDir * (backRowOffset + 5)] = { type: 'bishop', color };
    board[startRow + rowDir * backRowOffset][startCol + colDir * (backRowOffset + 6)] = { type: 'knight', color };
    board[startRow + rowDir * backRowOffset][startCol + colDir * (backRowOffset + 7)] = { type: 'rook', color };
    
    // Pawns
    for (let i = 0; i < 8; i++) {
      board[startRow + rowDir * 1][startCol + colDir * (backRowOffset + i)] = { type: 'pawn', color };
    }
  }

  isValidPosition(row, col) {
    return row >= 0 && row < 14 && col >= 0 && col < 14;
  }

  getPieceAt(row, col) {
    if (!this.isValidPosition(row, col)) return null;
    return this.board[row][col];
  }

  getPossibleMoves(row, col) {
    const piece = this.getPieceAt(row, col);
    if (!piece) return [];
    
    const moves = [];
    
    switch (piece.type) {
      case 'pawn':
        moves.push(...this.getPawnMoves(row, col, piece.color));
        break;
      case 'rook':
        moves.push(...this.getRookMoves(row, col, piece.color));
        break;
      case 'knight':
        moves.push(...this.getKnightMoves(row, col, piece.color));
        break;
      case 'bishop':
        moves.push(...this.getBishopMoves(row, col, piece.color));
        break;
      case 'queen':
        moves.push(...this.getQueenMoves(row, col, piece.color));
        break;
      case 'king':
        moves.push(...this.getKingMoves(row, col, piece.color));
        break;
    }
    
    return moves;
  }

  getPawnMoves(row, col, color) {
    const moves = [];
    const directions = this.getPawnDirection(color);
    
    for (const [dRow, dCol] of directions) {
      const newRow = row + dRow;
      const newCol = col + dCol;
      
      if (!this.isValidPosition(newRow, newCol)) continue;
      
      const target = this.getPieceAt(newRow, newCol);
      
      // Forward move
      if (dCol === 0 && !target) {
        moves.push([newRow, newCol]);
      }
      // Capture diagonally
      if (dCol !== 0 && target && target.color !== color) {
        moves.push([newRow, newCol]);
      }
    }
    
    return moves;
  }

  getPawnDirection(color) {
    // Returns forward and diagonal moves based on pawn color/position
    switch (color) {
      case 'white':
        return [[1, 0], [1, -1], [1, 1]];
      case 'black':
        return [[-1, 0], [-1, 1], [-1, -1]];
      case 'red':
        return [[0, 1], [1, 1], [-1, 1]];
      case 'yellow':
        return [[0, -1], [1, -1], [-1, -1]];
      default:
        return [];
    }
  }

  getRookMoves(row, col, color) {
    const moves = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    
    for (const [dRow, dCol] of directions) {
      for (let i = 1; i < 14; i++) {
        const newRow = row + dRow * i;
        const newCol = col + dCol * i;
        
        if (!this.isValidPosition(newRow, newCol)) break;
        
        const target = this.getPieceAt(newRow, newCol);
        if (target && target.color === color) break;
        
        moves.push([newRow, newCol]);
        
        if (target) break;
      }
    }
    
    return moves;
  }

  getKnightMoves(row, col, color) {
    const moves = [];
    const offsets = [
      [2, 1], [2, -1], [-2, 1], [-2, -1],
      [1, 2], [1, -2], [-1, 2], [-1, -2]
    ];
    
    for (const [dRow, dCol] of offsets) {
      const newRow = row + dRow;
      const newCol = col + dCol;
      
      if (!this.isValidPosition(newRow, newCol)) continue;
      
      const target = this.getPieceAt(newRow, newCol);
      if (!target || target.color !== color) {
        moves.push([newRow, newCol]);
      }
    }
    
    return moves;
  }

  getBishopMoves(row, col, color) {
    const moves = [];
    const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    
    for (const [dRow, dCol] of directions) {
      for (let i = 1; i < 14; i++) {
        const newRow = row + dRow * i;
        const newCol = col + dCol * i;
        
        if (!this.isValidPosition(newRow, newCol)) break;
        
        const target = this.getPieceAt(newRow, newCol);
        if (target && target.color === color) break;
        
        moves.push([newRow, newCol]);
        
        if (target) break;
      }
    }
    
    return moves;
  }

  getQueenMoves(row, col, color) {
    return [
      ...this.getRookMoves(row, col, color),
      ...this.getBishopMoves(row, col, color)
    ];
  }

  getKingMoves(row, col, color) {
    const moves = [];
    const directions = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];
    
    for (const [dRow, dCol] of directions) {
      const newRow = row + dRow;
      const newCol = col + dCol;
      
      if (!this.isValidPosition(newRow, newCol)) continue;
      
      const target = this.getPieceAt(newRow, newCol);
      if (!target || target.color !== color) {
        moves.push([newRow, newCol]);
      }
    }
    
    return moves;
  }

  makeMove(fromRow, fromCol, toRow, toCol) {
    const piece = this.getPieceAt(fromRow, fromCol);
    if (!piece) return { success: false, error: 'No piece at source' };
    
    const moves = this.getPossibleMoves(fromRow, fromCol);
    const isValidMove = moves.some(([r, c]) => r === toRow && c === toCol);
    
    if (!isValidMove) {
      return { success: false, error: 'Invalid move' };
    }
    
    // Capture piece if present
    const capturedPiece = this.getPieceAt(toRow, toCol);
    if (capturedPiece) {
      this.capturedPieces[capturedPiece.color].push(capturedPiece);
    }
    
    // Move piece
    this.board[toRow][toCol] = piece;
    this.board[fromRow][fromCol] = null;
    
    // Record move
    this.moveHistory.push({
      from: [fromRow, fromCol],
      to: [toRow, toCol],
      piece,
      captured: capturedPiece,
      player: this.currentPlayerIndex
    });
    
    // Next player
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
    
    return { success: true, board: this.board };
  }

  getCurrentPlayer() {
    const colors = ['white', 'black', 'red', 'yellow'];
    return colors[this.currentPlayerIndex];
  }

  getGameState() {
    return {
      board: this.board,
      currentPlayer: this.getCurrentPlayer(),
      currentPlayerIndex: this.currentPlayerIndex,
      gameStatus: this.gameStatus,
      moveHistory: this.moveHistory,
      capturedPieces: this.capturedPieces
    };
  }

  undoMove() {
    if (this.moveHistory.length === 0) return false;
    
    const lastMove = this.moveHistory.pop();
    const { from, to, piece, captured } = lastMove;
    
    // Restore piece to original position
    this.board[from[0]][from[1]] = piece;
    
    // Restore captured piece if any
    if (captured) {
      this.board[to[0]][to[1]] = captured;
      this.capturedPieces[captured.color] = this.capturedPieces[captured.color].filter(p => p !== captured);
    } else {
      this.board[to[0]][to[1]] = null;
    }
    
    // Revert player
    this.currentPlayerIndex = (this.currentPlayerIndex - 1 + 4) % 4;
    
    return true;
  }
}

module.exports = FourPlayerChess;
