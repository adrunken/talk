/**
 * Chess Board Renderer
 * Handles rendering and visual updates for the 14x14 4-player chess board
 */

import { PIECE_TYPES, PLAYERS, PLAYER_COLORS } from './FourPlayerChess';

export class BoardRenderer {
  constructor(boardElement, game) {
    this.boardElement = boardElement;
    this.game = game;
    this.pieces = new Map(); // Maps position string to piece element
    this.squares = new Map(); // Maps position string to square element
    this.selectedSquare = null;
    this.lastMoveSquares = new Set();
    this.legalMoveSquares = new Set();
  }

  initialize() {
    this.boardElement.innerHTML = '';
    this.pieces.clear();
    this.squares.clear();

    // Use CSS Grid with specific positioning for cross-shaped board
    this.boardElement.style.display = 'inline-grid';
    this.boardElement.style.gridTemplateColumns = 'repeat(14, 40px)';
    this.boardElement.style.gridTemplateRows = 'repeat(14, 40px)';
    this.boardElement.style.gap = '0';

    // Create only valid squares for cross-shaped board
    for (let rank = 0; rank < 14; rank++) {
      for (let file = 0; file < 14; file++) {
        if (!this.game.isInvalidSquare(rank, file)) {
          const squareElement = this.createSquare(rank, file);
          // Position in grid: column = file + 1 (1-indexed), row = rank + 1
          squareElement.style.gridColumn = (file + 1).toString();
          squareElement.style.gridRow = (rank + 1).toString();
          this.boardElement.appendChild(squareElement);
          this.squares.set(`${rank},${file}`, squareElement);
        }
      }
    }

    this.renderBoard();
  }

  createSquare(rank, file) {
    const square = document.createElement('div');
    square.className = 'chess-square';
    square.dataset.rank = rank;
    square.dataset.file = file;
    square.style.width = '40px';
    square.style.height = '40px';
    square.style.boxSizing = 'border-box';
    square.style.position = 'relative';

    // Determine square color based on position
    const isLightSquare = (rank + file) % 2 === 0;
    square.classList.add(isLightSquare ? 'light' : 'dark');

    // Add board zone indicators
    if (rank > 11) {
      square.dataset.zone = 'white';
    } else if (rank < 2) {
      square.dataset.zone = 'red';
    }

    if (file < 2) {
      const zoneAttr = square.dataset.zone || '';
      square.dataset.zone = zoneAttr ? `${zoneAttr}-blue` : 'blue';
    } else if (file > 11) {
      const zoneAttr = square.dataset.zone || '';
      square.dataset.zone = zoneAttr ? `${zoneAttr}-black` : 'black';
    }

    return square;
  }

  renderBoard() {
    // Clear all pieces
    this.pieces.forEach(piece => piece.remove());
    this.pieces.clear();

    // Render all pieces
    const board = this.game.board;
    for (let rank = 0; rank < 14; rank++) {
      for (let file = 0; file < 14; file++) {
        const piece = board[rank][file];
        if (piece) {
          this.renderPiece(rank, file, piece);
        }
      }
    }
  }

  renderPiece(rank, file, piece) {
    const square = this.squares.get(`${rank},${file}`);
    if (!square) return;

    // Check if piece already exists
    let pieceElement = square.querySelector('.chess-piece');
    if (pieceElement) {
      pieceElement.remove();
    }

    pieceElement = document.createElement('div');
    pieceElement.className = `chess-piece piece-${this.getPieceClass(piece)}`;
    pieceElement.dataset.rank = rank;
    pieceElement.dataset.file = file;
    pieceElement.dataset.player = piece.player;
    pieceElement.dataset.type = piece.type;
    pieceElement.textContent = this.getPieceSymbol(piece.type);
    pieceElement.title = `${this.getPlayerName(piece.player)} ${this.getPieceName(piece.type)}`;
    pieceElement.draggable = true;

    square.appendChild(pieceElement);
    this.pieces.set(`${rank},${file}`, pieceElement);
  }

  getPieceSymbol(type) {
    const symbols = {
      [PIECE_TYPES.PAWN]: '♟',
      [PIECE_TYPES.KNIGHT]: '♞',
      [PIECE_TYPES.BISHOP]: '♝',
      [PIECE_TYPES.ROOK]: '♜',
      [PIECE_TYPES.QUEEN]: '♛',
      [PIECE_TYPES.KING]: '♚',
    };
    return symbols[type] || '?';
  }

  getPieceClass(piece) {
    const playerInitial = this.getPlayerInitial(piece.player);
    const typeChar = piece.type;
    return `${playerInitial}${typeChar}`;
  }

  getPlayerInitial(player) {
    const initials = {
      [PLAYERS.WHITE]: 'w',
      [PLAYERS.RED]: 'r',
      [PLAYERS.BLACK]: 'b',
      [PLAYERS.BLUE]: 'u',
    };
    return initials[player];
  }

  getPlayerName(player) {
    const names = {
      [PLAYERS.WHITE]: 'White',
      [PLAYERS.RED]: 'Red',
      [PLAYERS.BLACK]: 'Black',
      [PLAYERS.BLUE]: 'Blue',
    };
    return names[player];
  }

  getPieceName(type) {
    const names = {
      [PIECE_TYPES.PAWN]: 'Pawn',
      [PIECE_TYPES.KNIGHT]: 'Knight',
      [PIECE_TYPES.BISHOP]: 'Bishop',
      [PIECE_TYPES.ROOK]: 'Rook',
      [PIECE_TYPES.QUEEN]: 'Queen',
      [PIECE_TYPES.KING]: 'King',
    };
    return names[type];
  }

  selectSquare(rank, file) {
    // Clear previous selection
    if (this.selectedSquare) {
      const [prevRank, prevFile] = this.selectedSquare;
      const prevSquare = this.squares.get(`${prevRank},${prevFile}`);
      if (prevSquare) {
        prevSquare.classList.remove('selected');
      }
    }

    // Select new square
    const square = this.squares.get(`${rank},${file}`);
    if (square) {
      square.classList.add('selected');
      this.selectedSquare = [rank, file];
      return true;
    }

    this.selectedSquare = null;
    return false;
  }

  deselectSquare() {
    if (this.selectedSquare) {
      const [rank, file] = this.selectedSquare;
      const square = this.squares.get(`${rank},${file}`);
      if (square) {
        square.classList.remove('selected');
      }
    }
    this.selectedSquare = null;
  }

  showLegalMoves(moves) {
    this.clearLegalMoves();
    moves.forEach(move => {
      const [rank, file] = this.game.notationToCoords(move.to);
      const square = this.squares.get(`${rank},${file}`);
      if (square) {
        square.classList.add('legal-move');
        this.legalMoveSquares.add(`${rank},${file}`);
      }
    });
  }

  clearLegalMoves() {
    this.legalMoveSquares.forEach(posStr => {
      const square = this.squares.get(posStr);
      if (square) {
        square.classList.remove('legal-move');
      }
    });
    this.legalMoveSquares.clear();
  }

  highlightLastMove(fromNotation, toNotation) {
    // Clear previous highlight
    this.lastMoveSquares.forEach(posStr => {
      const square = this.squares.get(posStr);
      if (square) {
        square.classList.remove('lastmove');
      }
    });
    this.lastMoveSquares.clear();

    // Highlight new move
    const fromCoords = this.game.notationToCoords(fromNotation);
    const toCoords = this.game.notationToCoords(toNotation);

    if (fromCoords) {
      const fromSquare = this.squares.get(`${fromCoords[0]},${fromCoords[1]}`);
      if (fromSquare) {
        fromSquare.classList.add('lastmove');
        this.lastMoveSquares.add(`${fromCoords[0]},${fromCoords[1]}`);
      }
    }

    if (toCoords) {
      const toSquare = this.squares.get(`${toCoords[0]},${toCoords[1]}`);
      if (toSquare) {
        toSquare.classList.add('lastmove');
        this.lastMoveSquares.add(`${toCoords[0]},${toCoords[1]}`);
      }
    }
  }

  highlightCheck(player) {
    const kingPos = this.game.getPlayerKingPosition(player);
    if (kingPos) {
      const [rank, file] = kingPos;
      const square = this.squares.get(`${rank},${file}`);
      if (square) {
        square.classList.add('in-check');
      }
    }
  }

  clearCheckHighlight(player) {
    const kingPos = this.game.getPlayerKingPosition(player);
    if (kingPos) {
      const [rank, file] = kingPos;
      const square = this.squares.get(`${rank},${file}`);
      if (square) {
        square.classList.remove('in-check');
      }
    }
  }

  getSquareElement(rank, file) {
    return this.squares.get(`${rank},${file}`);
  }

  getSquareAtEvent(event) {
    const element = event.target.closest('.chess-square');
    if (element) {
      return [parseInt(element.dataset.rank), parseInt(element.dataset.file)];
    }
    return null;
  }

  update() {
    this.renderBoard();
  }
}
