/**
 * Lichess API Integration Module
 * Handles challenge creation, acceptance, and game event streaming
 */

const https = require('https');

const LICHESS_API_URL = 'https://lichess.org/api';

class LichessAPI {
  constructor(apiToken) {
    this.apiToken = apiToken;
  }

  /**
   * Helper to make authenticated HTTPS requests to Lichess API
   */
  _request(method, path, body = null, isFormData = false) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'lichess.org',
        path: `/api${path}`,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json',
          'User-Agent': 'zybercomms/1.0'
        }
      };

      let bodyStr = '';
      if (body) {
        bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        if (isFormData) {
          options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        } else {
          options.headers['Content-Type'] = 'application/json';
        }
        options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ status: res.statusCode, data: data ? JSON.parse(data) : data });
            } catch (e) {
              resolve({ status: res.statusCode, data: data });
            }
          } else {
            reject(new Error(`Lichess API error ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);

      if (bodyStr) {
        req.write(bodyStr);
      }

      req.end();
    });
  }

  /**
   * Get current user's profile
   */
  async getProfile() {
    const result = await this._request('GET', '/account');
    return result.data;
  }

  /**
   * Create an open challenge
   * @param {Object} options - Challenge options
   * @param {boolean} options.rated - true or false
   * @param {number} options.clockLimit - time in seconds (e.g., 300 for 5 min)
   * @param {number} options.clockIncrement - increment in seconds (e.g., 0)
   * @param {string} options.variant - chess variant (default: 'standard')
   * @param {string} options.color - 'white', 'black', or 'random'
   */
  async createOpenChallenge(options = {}) {
    const formBody = new URLSearchParams();
    formBody.append('rated', options.rated === true ? 'true' : 'false');
    formBody.append('clock.limit', options.clockLimit || 300);
    formBody.append('clock.increment', options.clockIncrement || 0);
    formBody.append('variant', options.variant || 'standard');
    formBody.append('color', options.color || 'random');

    const result = await this._request('POST', '/challenge/open', formBody.toString());
    return result.data;
  }

  /**
   * Get list of incoming challenges (challenges sent to the current user)
   */
  async getOpenChallenges() {
    const result = await this._request('GET', '/challenges');
    return result.data || { in: [], out: [] };
  }

  /**
   * Accept a challenge
   * @param {string} challengeId - The challenge ID
   */
  async acceptChallenge(challengeId) {
    const result = await this._request('POST', `/challenge/${challengeId}/accept`);
    return result.data;
  }

  /**
   * Get game state
   * @param {string} gameId - The game ID
   */
  async getGame(gameId) {
    const result = await this._request('GET', `/games/${gameId}`);
    return result.data;
  }

  /**
   * Make a move
   * @param {string} gameId - The game ID
   * @param {string} move - Move in UCI format (e.g., 'e2e4')
   */
  async makeMove(gameId, move) {
    const body = { move: move };
    const result = await this._request('POST', `/games/${gameId}/move/${move}`);
    return result.data;
  }

  /**
   * Resign from game
   * @param {string} gameId - The game ID
   */
  async resignGame(gameId) {
    const result = await this._request('POST', `/games/${gameId}/resign`);
    return result.data;
  }

  /**
   * Get WebSocket URL for streaming game events
   * @param {string} gameId - The game ID
   */
  getGameStreamUrl(gameId) {
    return `wss://lichess.org/api/bot/game/stream/${gameId}`;
  }

  /**
   * Get WebSocket URL for streaming incoming events (challenges, etc)
   */
  getIncomingEventsStreamUrl() {
    return 'wss://lichess.org/api/stream/event';
  }
}

module.exports = LichessAPI;
