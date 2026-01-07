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
rawSocket.onopen = function() {
  console.log('[snake] WebSocket connected');
  ctx.fillStyle = "#000000";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#FFFFE0";
  ctx.fillRect(0, 0, 800, 400);
  ctx.fillStyle = "#000000";
  ctx.fillText("Connected! Setting up game...", 200, 200);

  // Send ping to initialize the game
  console.log('[snake] Sending ping to initialize game');
  rawSocket.send('ping');

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
  lastGameState: null  // Store final game state for rendering on game-over screen
};

function getLoggedInUsername() {
  try {
    // Try to get username from localStorage (set by main app)
    const storedUsername = localStorage.getItem("username");
    if (storedUsername && storedUsername.trim()) {
      return storedUsername.trim();
    }
  } catch (e) {
    console.log("[snake] localStorage not available:", e);
  }

  // Fallback to a default name
  return "Worm";
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

  // Store the latest game state for game-over screen rendering
  snakeGameOverState.lastGameState = {
    players: data.players,
    trails: data.trails,
    gameStarted: data.gameStarted
  };

  // Handle game over state
  if (snakeGameOverState.isGameOver) {
    ctx.clearRect(0, 0, 800, 400);
    ctx.fillStyle = "#FFFFE0";
    ctx.fillRect(0, 0, 800, 400);
    ctx.textAlign = "center";
    ctx.font = "10px Arial";

    // Draw background grid
    ctx.fillStyle = "#BBBBBB";
    for (var bgLineX = 0; bgLineX < 800; bgLineX += 20) {
      ctx.fillRect(bgLineX, 0, 1, 400);
    }
    for (var bgLineY = 0; bgLineY < 400; bgLineY += 20) {
      ctx.fillRect(0, bgLineY, 800, 1);
    }

    // Render the final game state (all snakes stationary)
    if (snakeGameOverState.lastGameState) {
      const gameData = snakeGameOverState.lastGameState;

      // Draw trails
      for (var i = 0; i < gameData.trails.length; i++) {
        ctx.strokeStyle = "hsl(" + gameData.trails[i].color + ", 100%, 20%)";
        ctx.beginPath();
        ctx.lineWidth = "3";
        ctx.moveTo(gameData.trails[i].x, gameData.trails[i].y);
        ctx.lineTo(gameData.trails[i].endX, gameData.trails[i].endY);
        ctx.stroke();
      }

      // Draw player heads (stationary)
      for (var i = 0; i < gameData.players.length; i++) {
        const player = gameData.players[i];

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

    // Draw winner and countdown in center with semi-transparent background
    ctx.fillStyle = "rgba(255, 255, 224, 0.95)";
    ctx.fillRect(75, 60, 650, 280);

    // Draw border around winner box
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeRect(75, 60, 650, 280);

    // Draw winner text
    ctx.textAlign = "center";
    ctx.font = "bold 56px Arial";
    ctx.fillStyle = "#1a1a1a";

    if (snakeGameOverState.winner) {
      ctx.fillText("🏆 " + snakeGameOverState.winner + " Wins! 🏆", 400, 140);
    } else {
      ctx.fillText("Game Over!", 400, 140);
    }

    // Draw countdown label
    ctx.font = "24px Arial";
    ctx.fillStyle = "#555555";
    ctx.fillText("Next game starts in", 400, 195);

    // Draw countdown timer
    ctx.font = "bold 80px Arial";
    ctx.fillStyle = "#FF6600";
    ctx.textAlign = "center";
    ctx.fillText(Math.max(0, snakeGameOverState.countdownSeconds), 400, 280);

    ctx.font = "18px Arial";
    ctx.fillStyle = "#333333";
    ctx.fillText("seconds", 400, 310);

    return;
  }

  ctx.clearRect(0, 0, 800, 400);
  ctx.fillStyle = "#FFFFE0";
  ctx.fillRect(0, 0, 800, 400);
  ctx.textAlign = "center";
  ctx.font = "10px Arial";

  ctx.fillStyle = "#BBBBBB";
  for (var bgLineX = 0; bgLineX < 800; bgLineX += 20) {
    ctx.fillRect(bgLineX, 0, 1, 400);
  }
  for (var bgLineY = 0; bgLineY < 400; bgLineY += 20) {
    ctx.fillRect(0, bgLineY, 800, 1);
  }

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
  snakeGameOverState.countdownSeconds = 7;

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

  // Start countdown
  snakeGameOverState.countdownInterval = setInterval(function() {
    snakeGameOverState.countdownSeconds--;
    console.log("[snake] Countdown:", snakeGameOverState.countdownSeconds);
    if (snakeGameOverState.countdownSeconds <= 0) {
      clearInterval(snakeGameOverState.countdownInterval);
      console.log("[snake] Countdown ended, rejoining lobby for new game");
      snakeGameOverState.isGameOver = false;
      snakeGameOverState.winner = null;
      snakeGameOverState.countdownSeconds = 7;

      // Rejoin lobby to start new game - this triggers the server to check if a new game should start
      socket.emit("snake_join", {
        username: getLoggedInUsername()
      });
    }
  }, 1000);
});

socket.on("id", function (data) {
  console.log("Your id is " + data.id);
  id = data.id;
  setTimeout(function () {
    socket.emit("kthx");
    // Join the snake game lobby with the authenticated username
    var username = getLoggedInUsername();
    console.log("[snake] Joining game as:", username);
    socket.emit("snake_join", {
      username: username
    });
  }, 100);
});

socket.on("afk?", function (data) {
  socket.emit("not afk");
});

socket.on("username", function (data) {
  console.log("[snake] Server requesting username");
  var username = getLoggedInUsername();
  console.log("[snake] Responding with username:", username);
  socket.emit("username", {
    username: username
  });
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


document.getElementById("ctx").onkeydown = function (event) {
  if (event.keyCode === 70 || event.keyCode === 76)
    socket.emit("keyPress", {
      inputId: "right",
      state: true,
    });
  else if (event.keyCode === 75 || event.keyCode === 68)
    socket.emit("keyPress", {
      inputId: "down",
      state: true,
    });
  else if (event.keyCode === 74 || event.keyCode === 83)
    socket.emit("keyPress", {
      inputId: "left",
      state: true,
    });
  else if (event.keyCode === 69 || event.keyCode === 73)
    socket.emit("keyPress", {
      inputId: "up",
      state: true,
    });
};
document.getElementById("ctx").onkeyup = function (event) {
  if (event.keyCode === 70 || event.keyCode === 76)
    socket.emit("keyPress", {
      inputId: "right",
      state: false,
    });
  else if (event.keyCode === 75 || event.keyCode === 68)
    socket.emit("keyPress", {
      inputId: "down",
      state: false,
    });
  else if (event.keyCode === 74 || event.keyCode === 83)
    socket.emit("keyPress", {
      inputId: "left",
      state: false,
    });
  else if (event.keyCode === 69 || event.keyCode === 73)
    socket.emit("keyPress", {
      inputId: "up",
      state: false,
    });
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
