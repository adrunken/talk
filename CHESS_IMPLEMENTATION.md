# 4-Player Chess Implementation

## Overview

This is a complete implementation of 4-Player Chess for a 14x14 board supporting 4 independent players (Blue, Yellow, Red, and Green).

### Key Features

- **14x14 Board**: Extended board with additional ranks and files
- **4 Independent Players**: Blue (bottom), Yellow (left), Red (top), Green (right)
- **Full Chess Rules**: Pawns, knights, bishops, rooks, queens, and kings with proper movement rules
- **Scoring System**: 
  - +20 points for checkmate
  - +10 points for stalemate (per remaining active player)
  - +1-9 points for capturing pieces (based on piece type)
- **Pawn Promotion**: Automatic to queen or user-selected piece
- **Special Rules**: Check, checkmate, stalemate detection
- **Player Elimination**: Automatic elimination on checkmate, stalemate, or resignation
- **Interactive UI**: Click-to-select or drag-and-drop piece movement

## Architecture

### Core Modules

#### `FourPlayerChess.js`
Main game logic engine handling:
- Board representation and state management
- Piece placement and movement validation
- Turn management and player elimination
- Scoring and game status tracking

**Key Classes:**
- `FourPlayerChess`: Main game engine

**Key Methods:**
- `makeMove(fromNotation, toNotation, promotionType)`: Execute a move
- `canMovePiece(fromRank, fromFile, toRank, toFile, player)`: Validate move legality
- `isKingInCheck(player)`: Check detection
- `isCheckmate(player)`: Checkmate detection
- `isStalemate(player)`: Stalemate detection
- `getAvailableMoves(player)`: Get all legal moves for a player

#### `BoardRenderer.js`
Visual board rendering and UI updates:
- 14x14 grid rendering with proper square coloring
- Piece display with color differentiation
- Legal move highlighting
- Check/checkmate indicators
- Last move highlighting

**Key Classes:**
- `BoardRenderer`: Handles all visual board updates

**Key Methods:**
- `renderBoard()`: Render all pieces on board
- `selectSquare(rank, file)`: Highlight selected square
- `showLegalMoves(moves)`: Highlight legal move destinations
- `highlightLastMove(fromNotation, toNotation)`: Show last move squares
- `highlightCheck(player)`: Show king in check

#### `MoveHandler.js`
Piece movement and interaction logic:
- Square selection (click or drag)
- Move validation and execution
- Pawn promotion handling
- Resignation and game state updates

**Key Classes:**
- `MoveHandler`: Handles piece movement and user interactions

**Key Methods:**
- `selectSquare(rank, file)`: Handle square click
- `attemptMove(fromRank, fromFile, toRank, toFile)`: Execute move attempt
- `startDrag(rank, file, event)`: Begin piece drag
- `endDrag()`: End piece drag
- `resign()`: Player resignation

#### `GameController.js`
Main integration and UI coordination:
- Event listener setup and management
- UI element updates
- Game state display
- Promotion dialog handling
- Game initialization and reset

**Key Classes:**
- `GameController`: Main integration point

**Key Methods:**
- `handleBoardClick(event)`: Click event handler
- `updateUI()`: Refresh all UI elements
- `showPromotionPrompt()`: Show pawn promotion dialog
- `completePromotion(type)`: Execute pawn promotion
- `handleGameOver()`: End game handling
- `resetGame()`: Start new game

### Coordinate System

- **Files (Columns)**: a-n (0-13, left to right)
- **Ranks (Rows)**: 1-14 (0-13, bottom to top)
- **Notation**: `a1` to `n14` (file + rank)

### Player Positions

| Player | Starting Position | Movement Direction |
|--------|------------------|-------------------|
| Blue   | Ranks 0-1, Files 0-13 | Up (rank increases) |
| Yellow | Files 0-1, Ranks 0-13 | Right (file increases) |
| Red    | Ranks 12-13, Files 0-13 | Down (rank decreases) |
| Green  | Files 12-13, Ranks 0-13 | Left (file decreases) |

### Turn Order
Clockwise: Blue → Yellow → Red → Green → Blue...

## Piece Values (Scoring)

- Pawn: 1 point
- Knight: 3 points
- Bishop: 5 points
- Rook: 5 points
- Queen: 9 points
- King: 20 points (only on checkmate)

## CSS Classes

### Board Squares
- `.chess-square` - Base square element
- `.light` / `.dark` - Square colors
- `.selected` - Currently selected square
- `.legal-move` - Available destination square
- `.lastmove` - Last move source/destination
- `.in-check` - King in check
- `.premove` - Premove indicator

### Pieces
4-player pieces use color-based naming:
- `piece-bX` - Blue piece (X = piece type: k, q, r, b, n, p)
- `piece-yX` - Yellow piece
- `piece-rX` - Red piece
- `piece-gX` - Green piece

Examples: `.piece-bk` (Blue King), `.piece-yq` (Yellow Queen), `.piece-rp` (Red Pawn)

## Usage

### HTML Integration

```html
<div id="chess-board"></div>
```

### JavaScript Usage

```javascript
import { initializeChessGame } from './chess/init.js';

// Initialize the game
const gameController = initializeChessGame();

// Make a move
const result = gameController.game.makeMove('e2', 'e4');

// Get game status
const status = gameController.game.getGameStatus();

// Get available moves
const moves = gameController.game.getAvailableMoves(PLAYERS.BLUE);

// Reset game
gameController.resetGame();
```

### Coordinate Conversion

```javascript
// Notation to coordinates
const coords = game.notationToCoords('e4'); // [3, 4]

// Coordinates to notation
const notation = game.coordsToNotation(3, 4); // 'e4'
```

## Game Flow

1. **Initialize**: `GameController` creates new game and renders board
2. **Player Turn**: Current player selects a piece
3. **Show Moves**: Legal moves are highlighted
4. **Execute Move**: Player clicks destination or drops piece
5. **Validation**: Move is validated against chess rules
6. **Promotion**: If pawn reaches promotion rank, player selects piece
7. **Update**: Board and UI are updated
8. **Turn Advance**: Next non-eliminated player gets turn
9. **Check Detection**: If in check, status is updated
10. **Game End**: On checkmate of 3rd player, game ends

## Piece Movement Rules

### Pawns
- Move forward 1 square (direction varies by player)
- Capture diagonally forward
- Promote on reaching final rank
- No en passant in 4-player variant

### Knights
- Move in L-shape (2 squares one direction, 1 perpendicular)
- Can jump over other pieces

### Bishops
- Move diagonally any distance
- Cannot jump over pieces

### Rooks
- Move horizontally or vertically any distance
- Cannot jump over pieces

### Queens
- Combine rook and bishop movement
- Move horizontally, vertically, or diagonally any distance
- Cannot jump over pieces

### Kings
- Move 1 square in any direction
- Cannot move into check
- No castling in 4-player variant

## Game Termination

The game ends when 3 players are eliminated through:
- **Checkmate**: King is under attack and has no legal moves
- **Stalemate**: Player is not in check but has no legal moves (eliminated, others gain points)
- **Resignation**: Player voluntarily quits
- **Time Expiration**: (Can be implemented in timer system)

## States and Status

### Player States
- **Active**: Playing, can make moves
- **In Check**: King is under direct attack
- **In Checkmate**: King under attack with no legal moves (eliminated)
- **Stalemated**: No legal moves but not in check (eliminated)
- **Eliminated**: Out of game, pieces inactive

### Game States
- **In Progress**: Game is ongoing
- **Over**: Only one player remains active

## Event Callbacks

The `GameController` calls `onMove(result)` with:
```javascript
{
  success: boolean,
  move: string, // e.g. "e2e4"
  requiresPromotion: boolean, // true if pawn needs promotion
  capturedPiece: object | null,
  newTurn: number, // Next player
  type: string, // 'move' or 'resign'
}
```

## Storage

Games can be saved/loaded:
```javascript
const controller = getGameController();
controller.saveGame(); // Saves to localStorage
const state = controller.loadGame(); // Loads from localStorage
```

## Customization

### Player Names
Modify player display in `GameController.updatePlayerDisplay()` or through UI.

### Timing
Add timers by extending `GameController` with timer methods.

### Rules Variants
Extend `FourPlayerChess` to add:
- En passant
- Castling (if needed)
- Custom scoring
- House rules

## Performance Considerations

- **Legal Move Generation**: O(14×14×14×14) = O(n⁴) where n=14
- **Board Rendering**: Updates only changed squares
- **Move Validation**: Incremental checking, early exit on illegal move

## Browser Compatibility

Requires ES6+ JavaScript (classes, arrow functions, template literals):
- Chrome 49+
- Firefox 45+
- Safari 10+
- Edge 12+

## Testing

Key test cases:
1. Piece movement validation
2. Check/checkmate/stalemate detection
3. Pawn promotion
4. Turn advancement
5. Piece elimination
6. Scoring calculations
7. Board rendering accuracy
8. UI responsiveness

## Future Enhancements

- [ ] Timer/clock system
- [ ] Move history and navigation
- [ ] Network multiplayer support
- [ ] AI opponents
- [ ] Game replay/analysis
- [ ] Variants (3-player, 2x2 teams, etc.)
- [ ] Board themes and piece sets
- [ ] Opening book suggestions
- [ ] Position evaluation display
