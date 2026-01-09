var uiVisible = false;
var uiDiv = document.getElementById("uiDiv");
var canvas = document.getElementById("ctx");
var ctx = canvas.getContext("2d");
ctx.font = "30px Arial";
ctx.clearRect(0, 0, 800, 400);
ctx.fillStyle = "#FFFFE0";
ctx.fillRect(0, 0, 800, 400);
ctx.textAlign = "center";
ctx.fillStyle = "#DDDDDD";

for (var bgLineX = 0; bgLineX < 800; bgLineX += 20) {
  ctx.fillRect(bgLineX, 0, 1, 400);
}
for (var bgLineY = 0; bgLineY < 400; bgLineY += 20) {
  ctx.fillRect(0, bgLineY, 800, 1);
}

ctx.fillStyle = "#000000";
ctx.fillText("Connecting Server, Wait.. ", 200, 200);
uiDiv.style.height = "0px";

// Initialize username display
initializeUsernameDisplay();

document.getElementById("ctx").focus();

// Create a WebSocket-to-SocketIO adapter for the snake game client
var wsScheme = (window.location.protocol === 'https:') ? 'wss' : 'ws';
var wsUrl = wsScheme + '://' + window.location.host + '/ws';

console.log('[snake] Connecting to WebSocket:', wsUrl);

var rawSocket = new WebSocket(wsUrl);
var eventHandlers = {};

// Create a Socket.IO-like interface that uses WebSocket underneath
var socket = {
  emit: function(event, data) {
    var msg = { type: event };
    Object.assign(msg, data);
    console.log('[snake] emit:', event, data);
    if (rawSocket.readyState === 1) {
      rawSocket.send(JSON.stringify(msg));
    }
  },
  on: function(event, callback) {
    if (!eventHandlers[event]) {
      eventHandlers[event] = [];
    }
    eventHandlers[event].push(callback);
  },
  off: function(event, callback) {
    if (eventHandlers[event]) {
      eventHandlers[event] = eventHandlers[event].filter(function(cb) {
        return cb !== callback;
      });
    }
  }
};

// Handle incoming WebSocket messages
rawSocket.onmessage = function(event) {
  var msgStr = event.data;
  var data = null;
  var eventType = null;

  // Try to parse as JSON first
  try {
    data = JSON.parse(msgStr);
    eventType = data.type;
    console.log('[snake] received JSON:', eventType, data);
  } catch (e) {
    // Handle plain string messages from server (e.g., "id123", "message text")
    if (msgStr.startsWith('id')) {
      // Parse "id123" format
      data = { id: parseInt(msgStr.substring(2)) };
      eventType = 'id';
      console.log('[snake] received id message:', data);
    } else {
      console.error('[snake] Failed to parse message:', msgStr);
      return;
    }
  }

  if (eventType && eventHandlers[eventType]) {
    eventHandlers[eventType].forEach(function(callback) {
      callback(data);
    });
  }
};

// Connection event handlers
// Rendering optimization: cache grid background
var gridBackgroundCache = null;

function createGridBackground() {
  if (!gridBackgroundCache) {
    gridBackgroundCache = document.createElement('canvas');
    gridBackgroundCache.width = 800;
    gridBackgroundCache.height = 400;
    var gridCtx = gridBackgroundCache.getContext('2d');

    gridCtx.fillStyle = "#FFFFE0";
    gridCtx.fillRect(0, 0, 800, 400);
    gridCtx.fillStyle = "#DDDDDD";

    for (var bgLineX = 0; bgLineX < 800; bgLineX += 20) {
      gridCtx.fillRect(bgLineX, 0, 1, 400);
    }
    for (var bgLineY = 0; bgLineY < 400; bgLineY += 20) {
      gridCtx.fillRect(0, bgLineY, 800, 1);
    }
  }
  return gridBackgroundCache;
}

function drawBackground() {
  var gridBg = createGridBackground();
  ctx.drawImage(gridBg, 0, 0);
}

// Initialize game loop state
var gameLoopRunning = false;
var lastInputFlushTime = 0;

function gameLoop() {
  // Flush buffered inputs ~60 times per second
  var now = performance.now();
  if (now - lastInputFlushTime > 16) { // ~60 FPS
    inputBuffer.flushAndSend();
    lastInputFlushTime = now;
  }

  // Continue loop
  if (gameLoopRunning) {
    requestAnimationFrame(gameLoop);
  }
}

rawSocket.onopen = function() {
  console.log('[snake] WebSocket connected');
  ctx.fillStyle = "#000000";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#FFFFE0";
  ctx.fillRect(0, 0, 800, 400);
  ctx.fillStyle = "#000000";
  ctx.fillText("Connected! Setting up game...", 200, 200);

  // Only send username if we can retrieve it from localStorage
  var username = getLoggedInUsername();
  if (username) {
    console.log('[snake] Sending username to server:', username);
    rawSocket.send(JSON.stringify({
      type: 'username',
      username: username
    }));
    // Send ping after username message
    setTimeout(function() {
      console.log('[snake] Sending ping to initialize game');
      rawSocket.send('ping');
    }, 50);
  } else {
    // If no username found, just send ping and let server request username
    console.log('[snake] No username in localStorage, sending ping to let server request it');
    rawSocket.send('ping');
  }

  // Start game loop for smooth rendering and input buffering
  if (!gameLoopRunning) {
    gameLoopRunning = true;
    requestAnimationFrame(gameLoop);
  }

  if (eventHandlers['connect']) {
    eventHandlers['connect'].forEach(function(cb) { cb(); });
  }
};

rawSocket.onerror = function(error) {
  console.error('[snake] WebSocket error:', error);
  ctx.fillStyle = "#000000";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#FFFFE0";
  ctx.fillRect(0, 0, 800, 400);
  ctx.fillStyle = "#FF0000";
  ctx.fillText("Connection Error", 200, 200);
  if (eventHandlers['connect_error']) {
    eventHandlers['connect_error'].forEach(function(cb) { cb(error); });
  }
};

rawSocket.onclose = function() {
  console.log('[snake] WebSocket disconnected');
  if (eventHandlers['disconnect']) {
    eventHandlers['disconnect'].forEach(function(cb) { cb(); });
  }
};

var id = -1;

var start = new Date();
var lines = 16,
  cW = ctx.canvas.width / 2,
  cH = ctx.canvas.height / 2;
var uiVisible = false;

// Game over state tracking
var snakeGameOverState = {
  isGameOver: false,
  winner: null,
  countdownSeconds: 7,
  countdownInterval: null,
  nextGameStartPositions: null,
  nextGamePlayerColors: null,
  nextGamePlayerNames: null,
  lastGameState: null,  // Store final game state for rendering on game-over screen
  frozenGameState: null,  // Frozen state of new game (captured at 1 second mark)
  gameOverStartTime: null,  // When game ended
  showWinnerText: false  // Whether to show winner text overlay
};

function getLoggedInUsername() {
  try {
    // Try to get username from localStorage (set by main app)
    const storedUsername = localStorage.getItem("username");
    if (storedUsername && storedUsername.trim()) {
      return storedUsername.trim();
    }
  } catch (e) {
    console.log("[snake] localStorage not available (iframe sandbox):", e);
  }

  // If in an iframe, try to get username from parent window
  try {
    if (window.parent !== window && window.parent) {
      const parentUsername = window.parent.localStorage?.getItem("username");
      if (parentUsername && parentUsername.trim()) {
        console.log("[snake] Got username from parent window localStorage:", parentUsername);
        return parentUsername.trim();
      }
    }
  } catch (e) {
    console.log("[snake] Cannot access parent localStorage (cross-origin):", e);
  }

  // Return null if we can't find the username - let the server use authenticated username
  return null;
}

function initializeUsernameDisplay() {
  const username = getLoggedInUsername();
  const usernameDisplay = document.getElementById("username-display");
  if (usernameDisplay) {
    usernameDisplay.textContent = "Playing as: " + username;
  }
}

function mouseClick(e) {
  var element = document.getElementById("body");
  var offsetX = 0,
    offsetY = 0;
  if (element.offsetParent) {
    do {
      offsetX += element.offsetLeft;
      offsetY += element.offsetTop;
    } while ((element = element.offsetParent));
  }

  x = e.pageX - offsetX - window.innerWidth / 2;
  y = e.pageY - offsetY - window.innerHeight / 2;
  if (x > y && x > 200) {
    socket.emit("keyPress", {
      inputId: "right",
      state: true,
    });
    setTimeout(function () {
      socket.emit("keyPress", {
        inputId: "right",
        state: false,
      });
    }, 50);
  } else if (x < y && x < -200) {
    socket.emit("keyPress", {
      inputId: "left",
      state: true,
    });
    setTimeout(function () {
      socket.emit("keyPress", {
        inputId: "left",
        state: false,
      });
    }, 50);
  }
  if (y > x && y > 100) {
    socket.emit("keyPress", {
      inputId: "down",
      state: true,
    });
    setTimeout(function () {
      socket.emit("keyPress", {
        inputId: "down",
        state: false,
      });
    }, 50);
  } else if (y < x && y < -100) {
    socket.emit("keyPress", {
      inputId: "up",
      state: true,
    });
    setTimeout(function () {
      socket.emit("keyPress", {
        inputId: "up",
        state: false,
      });
    }, 50);
  }
}

socket.on("winners", function (data) {
  var newText = "<tr><th>Winners</th></tr>";
  var h = 100;
  while (data.list.length > 0) {
    newText +=
      '<tr><td id="winnerTD" style="color: hsl(' +
      h +
      ', 100%, 30%)">' +
      data.list.pop() +
      "</td></tr>";
    h -= 10;
  }
  document.getElementById("winners").innerHTML = newText;
});

socket.on("data", function (data) {
  console.log('[snake] Received data event:', {
    playersCount: data.players ? data.players.length : 0,
    trailsCount: data.trails ? data.trails.length : 0,
    gameStarted: data.gameStarted,
    gameOverState: snakeGameOverState.isGameOver,
    firstPlayerHead: data.players && data.players.length > 0 ? {x: data.players[0].x, y: data.players[0].y, name: data.players[0].name, isDead: data.players[0].isDead} : null
  });

  // Always update the game state so new games can render while winner text is displayed
  snakeGameOverState.lastGameState = {
    players: data.players,
    trails: data.trails,
    gameStarted: data.gameStarted
  };

  // Handle game over state - render with winner text overlay while new game plays
  if (snakeGameOverState.isGameOver) {
    const elapsedTime = Date.now() - snakeGameOverState.gameOverStartTime;
    const showFrozenPreviousGame = elapsedTime < 1000;  // First 1 second: show frozen previous game
    const showWinnerText = elapsedTime < 4000;  // Show winner text for 4 seconds
    const frozenStateInitiated = elapsedTime >= 1000 && elapsedTime < 4000;  // 1-4 seconds: frozen snakes

    // Capture the new game state when transitioning from frozen previous to frozen new game
    if (frozenStateInitiated && !snakeGameOverState.frozenGameState && data && data.players) {
      snakeGameOverState.frozenGameState = {
        players: JSON.parse(JSON.stringify(data.players)),
        trails: JSON.parse(JSON.stringify(data.trails)),
        gameStarted: data.gameStarted
      };
    }

    ctx.clearRect(0, 0, 800, 400);
    drawBackground();
    ctx.textAlign = "center";
    ctx.font = "10px Arial";

    // Choose which game state to render based on elapsed time
    let gameDataToRender = null;

    if (showFrozenPreviousGame && snakeGameOverState.lastGameState) {
      // First 1 second: render the frozen previous game state
      gameDataToRender = snakeGameOverState.lastGameState;
    } else if (frozenStateInitiated && snakeGameOverState.frozenGameState) {
      // 1-4 seconds: render the frozen new game state (snakes stay in place)
      gameDataToRender = snakeGameOverState.frozenGameState;
    }

    if (gameDataToRender) {
      // Draw trails
      for (var i = 0; i < gameDataToRender.trails.length; i++) {
        ctx.strokeStyle = "hsl(" + gameDataToRender.trails[i].color + ", 100%, 20%)";
        ctx.beginPath();
        ctx.lineWidth = "3";
        ctx.moveTo(gameDataToRender.trails[i].x, gameDataToRender.trails[i].y);
        ctx.lineTo(gameDataToRender.trails[i].endX, gameDataToRender.trails[i].endY);
        ctx.stroke();
      }

      // Draw player heads (stationary during game-over period)
      for (var i = 0; i < gameDataToRender.players.length; i++) {
        const player = gameDataToRender.players[i];

        if (!player.isDead) {
          ctx.fillStyle = "hsl(" + player.color + ", 100%, 10%)";
          ctx.fillRect(player.x - 2, player.y - 2, 4, 4);

          // Draw player name
          ctx.fillStyle = "#000000";
          ctx.font = "15px Arial";
          ctx.textAlign = "center";
          ctx.fillText(player.name, player.x, player.y - 10);
        }
      }
    }

    // Draw winner text overlay only during the first 4 seconds
    if (showWinnerText) {
      ctx.textAlign = "center";

      // Draw "Winner: [name]" in cyan
      ctx.font = "48px Arial";
      ctx.fillStyle = "#00FFFF";
      if (snakeGameOverState.winner) {
        ctx.fillText("Winner: " + snakeGameOverState.winner, 400, 180);
      } else {
        ctx.fillText("Game Over!", 400, 180);
      }

      // Draw "You are Winner!" in blue
      ctx.font = "42px Arial";
      ctx.fillStyle = "#0000FF";
      ctx.fillText("You are Winner!", 400, 250);
    }

    return;
  }

  ctx.clearRect(0, 0, 800, 400);
  drawBackground();
  ctx.textAlign = "center";
  ctx.font = "10px Arial";

  for (var i = 0; i < data.trails.length; i++) {
    ctx.strokeStyle = "hsl(" + data.trails[i].color + ", 100%, 20%)";
    ctx.beginPath();
    ctx.lineWidth = "3";
    ctx.moveTo(data.trails[i].x, data.trails[i].y);
    ctx.lineTo(data.trails[i].endX, data.trails[i].endY);
    ctx.stroke();
  }

  for (var i = 0; i < data.players.length; i++) {
    if (data.players[i].id == id && data.players[i].isDead) {
      ctx.font = "30px Arial";
      if (data.players[i].hasJoined) {
        ctx.fillStyle = "#AA0000";
        ctx.fillText("Game Over - you lost!", 400, 230);
      } else {
        ctx.fillStyle = "#000000";

        var dummyEl = document.getElementById("ctx");
        var isFocused = document.activeElement === dummyEl;
        if (!isFocused) {
          ctx.fillText("...Please Click Here and Wait...", 250, 150);
        } else {
          ctx.fillText("...Please wait a minute...", 250, 150);
        }

        ctx.fillText("Next Game Starts Very Soon!", 250, 250);
      }
    }

    if (!data.players[i].isDead) {
      ctx.fillStyle = "hsl(" + data.players[i].color + ", 100%, 10%)";
      if (data.players[i].id == id) {
        if (!data.gameStarted) {
          ctx.strokeStyle = "lime";
          ctx.beginPath();
          ctx.arc(
            data.players[i].x,
            data.players[i].y,
            10 + Math.sin(new Date().getTime() / 500) * 5,
            0,
            2 * Math.PI
          );
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(
            data.players[i].x,
            data.players[i].y,
            10 + Math.cos(new Date().getTime() / 500) * 5,
            0,
            2 * Math.PI
          );
          ctx.stroke();
        } else {
          ctx.strokeStyle = "green";
          ctx.beginPath();
          ctx.arc(
            data.players[i].x,
            data.players[i].y,
            10 + Math.sin(new Date().getTime() / 500) * 5,
            0,
            2 * Math.PI
          );
          ctx.stroke();
        }
        ctx.fillStyle = "#00FF00";
      }
      ctx.font = "15px Arial";

      ctx.fillRect(data.players[i].x - 2, data.players[i].y - 2, 4, 4);
      ctx.fillStyle = "#000000";
      ctx.fillText(
        data.players[i].name,
        data.players[i].x,
        data.players[i].y - 10
      );
    }
  }
});

socket.on("snake_game_over", function (data) {
  console.log("[snake] Game over:", data);
  snakeGameOverState.isGameOver = true;
  snakeGameOverState.winner = data.winner;
  snakeGameOverState.gameOverStartTime = Date.now();
  snakeGameOverState.showWinnerText = true;
  snakeGameOverState.frozenGameState = null;  // Reset frozen state for new cycle

  // Store next game's starting positions from the server
  if (data.nextGameStartPositions) {
    snakeGameOverState.nextGameStartPositions = data.nextGameStartPositions;
    snakeGameOverState.nextGamePlayerColors = data.nextGamePlayerColors;
    snakeGameOverState.nextGamePlayerNames = data.nextGamePlayerNames;
    console.log("[snake] Stored next game starting positions from server:", {
      positions: snakeGameOverState.nextGameStartPositions,
      colors: snakeGameOverState.nextGamePlayerColors,
      names: snakeGameOverState.nextGamePlayerNames
    });
  }

  // Clear any existing countdown
  if (snakeGameOverState.countdownInterval) {
    clearInterval(snakeGameOverState.countdownInterval);
  }

  // Auto-end game over screen after 4 seconds (1s frozen + 3s with snakes frozen but new game rendering)
  setTimeout(function() {
    console.log("[snake] Game over screen timeout, ending game over state");
    snakeGameOverState.isGameOver = false;
    snakeGameOverState.winner = null;
    snakeGameOverState.gameOverStartTime = null;
    snakeGameOverState.showWinnerText = false;
    snakeGameOverState.frozenGameState = null;

    // Rejoin lobby to start new game
    var rejoginUsername = getLoggedInUsername();
    var rejoinPayload = {};
    if (rejoginUsername) {
      rejoinPayload.username = rejoginUsername;
    }
    socket.emit("snake_join", rejoinPayload);
  }, 4000);
});

socket.on("id", function (data) {
  console.log("Your id is " + data.id);
  id = data.id;
  setTimeout(function () {
    socket.emit("kthx");
    // Join the snake game lobby
    // The username will be taken from server's authenticated users map or from this message
    var username = getLoggedInUsername();
    console.log("[snake] Joining game as:", username);
    var joinPayload = {};
    if (username) {
      joinPayload.username = username;
    }
    socket.emit("snake_join", joinPayload);
  }, 100);
});

socket.on("afk?", function (data) {
  socket.emit("not afk");
});

socket.on("username", function (data) {
  console.log("[snake] Server requesting username");
  var username = getLoggedInUsername();
  console.log("[snake] Responding with username:", username);

  // Always respond to username request, even if we don't have one
  // This ensures we get properly authenticated
  if (username) {
    console.log('[snake] Sending authenticated username:', username);
    socket.emit("username", {
      username: username
    });
  } else {
    // If we still don't have a username, generate a temporary one for this session
    // This should only happen if parent window localStorage is also inaccessible
    var tempUsername = 'user_' + Math.floor(Math.random() * 10000);
    console.log('[snake] No username found, using temporary:', tempUsername);
    socket.emit("username", {
      username: tempUsername
    });
  }
});

// Snake game events
socket.on("snake_lobby_update", function (data) {
  console.log("[snake] Lobby update:", data);

  // Skip rendering lobby screen if game is over (restart screen takes priority)
  if (snakeGameOverState.isGameOver) {
    console.log("[snake] Skipping lobby update while game over screen is active");
    return;
  }

  ctx.fillStyle = "#000000";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#FFFFE0";
  ctx.fillRect(0, 0, 800, 400);
  ctx.textAlign = "center";

  // Only show "Waiting for players" screen if less than 2 players
  if (data.players.length < 2) {
    ctx.fillStyle = "#000000";
    ctx.font = "30px Arial";
    ctx.fillText("Waiting for players...", 400, 150);
    ctx.font = "20px Arial";
    ctx.fillText("Players: " + data.players.length + "/2", 400, 220);
    ctx.fillText("Need " + data.playersNeeded + " more", 400, 280);
  }
});

var gameId = null;

socket.on("snake_game_start", function (data) {
  console.log("[snake] Game started:", data);
  gameId = data.game_id; // Store game ID for moves

  // Store starting positions and player info for the game-over screen
  if (data.playerStates) {
    const playerNames = data.players || [];
    const startPositions = {};
    const playerColors = {};

    for (let i = 0; i < playerNames.length; i++) {
      const playerKey = Object.keys(data.playerStates)[i];
      if (playerKey && data.playerStates[playerKey]) {
        const playerState = data.playerStates[playerKey];
        startPositions[playerNames[i]] = playerState.positions && playerState.positions.length > 0
          ? playerState.positions[0]
          : [400, 200];
        playerColors[playerNames[i]] = playerState.color;
      }
    }

    snakeGameOverState.nextGameStartPositions = startPositions;
    snakeGameOverState.nextGamePlayerColors = playerColors;
    snakeGameOverState.nextGamePlayerNames = playerNames;

    console.log("[snake] Stored starting positions for game-over screen:", {
      positions: startPositions,
      colors: playerColors,
      names: playerNames
    });
  }

  // Clear status and start rendering game
  ctx.fillStyle = "#000000";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#FFFFE0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Update winners with game players
  if (data.players && data.players.length > 0) {
    socket.emit("winners", { list: data.players });
  }
});


// Input buffering for reduced lag and network overhead
var inputBuffer = {
  pressed: {},
  released: {},
  hasInput: false,

  addKeyEvent: function(direction, isDown) {
    if (isDown) {
      this.pressed[direction] = true;
      delete this.released[direction];
    } else {
      this.released[direction] = true;
      delete this.pressed[direction];
    }
    this.hasInput = true;
  },

  flushAndSend: function() {
    if (!this.hasInput) return;

    // Send all buffered inputs in a batch
    if (Object.keys(this.pressed).length > 0) {
      for (const direction in this.pressed) {
        socket.emit("keyPress", {
          inputId: direction,
          state: true
        });
      }
    }

    if (Object.keys(this.released).length > 0) {
      for (const direction in this.released) {
        socket.emit("keyPress", {
          inputId: direction,
          state: false
        });
      }
    }

    this.pressed = {};
    this.released = {};
    this.hasInput = false;
  }
};

// Key mapping for both left and right hand control schemes
var keyMapping = {
  70: 'right',  // F
  76: 'right',  // L
  75: 'down',   // K
  68: 'down',   // D
  74: 'left',   // J
  83: 'left',   // S
  69: 'up',     // E
  73: 'up'      // I
};

document.getElementById("ctx").onkeydown = function (event) {
  var direction = keyMapping[event.keyCode];
  if (direction) {
    event.preventDefault();
    inputBuffer.addKeyEvent(direction, true);
  }
};

document.getElementById("ctx").onkeyup = function (event) {
  var direction = keyMapping[event.keyCode];
  if (direction) {
    event.preventDefault();
    inputBuffer.addKeyEvent(direction, false);
  }
};


function mouseMove(e) {
  mx = Math.round((e.clientX / window.innerWidth) * 800);
  my = Math.round((e.clientY / window.innerHeight) * 400);
  if (e.clientY < window.innerHeight - 70 && uiVisible) {
    unfocus();
    uiVisible = false;
    uiDiv.style.height = "0px";
    document.getElementById("menuTextDiv").style.height = "20px";
  } else if (e.clientY > window.innerHeight - 40 && !uiVisible) {
    uiVisible = true;
    document.getElementById("menuTextDiv").style.height = "0px";
    uiDiv.style.height = "55px";
  }
}

function unfocus() {
  var tmp = document.createElement("input");
  document.body.appendChild(tmp);
  tmp.focus();
  document.body.removeChild(tmp);

  document.getElementById("ctx").focus();
}
