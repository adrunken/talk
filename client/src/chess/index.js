/**
 * Chess Module Exports
 * Exports for both 2-player and 4-player chess systems
 * 
 * 2-Player: Uses chess.js library (server-side WebSocket handlers)
 * 4-Player: Uses FourPlayerChess class with index-based players (0,1,2,3)
 */

// 4-Player Chess Exports (separate system)
export { FourPlayerChess, PIECE_TYPES as FOUR_PLAYER_PIECE_TYPES, PLAYERS, PLAYER_NAMES, PLAYER_COLORS } from './four-player/index';
export { BoardRenderer as FourPlayerBoardRenderer } from './four-player/index';
export { MoveHandler as FourPlayerMoveHandler } from './four-player/index';

// Note: 2-Player Chess uses chess.js library (handled via server WebSocket messages)
// Server-side message types:
// - chess_invite: initiate 2-player game
// - chess_move: make move in 2-player game
// - chess_resign: resign from 2-player game
//
// 4-Player Chess WebSocket message types:
// - chess_4p_invite: initiate 4-player game
// - chess_4p_move: make move in 4-player game
// - chess_4p_resign: resign from 4-player game
