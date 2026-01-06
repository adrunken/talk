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

document.getElementById("ctx").focus();

// Connect to Socket.IO server with explicit path
// Use window.parent.location if in iframe to get the parent URL
var parentLoc = (window.parent && window.parent.location) ? window.parent.location : window.location;
var socketUrl = parentLoc.protocol + '//' + parentLoc.host;

console.log('[socket.io] Connecting to:', socketUrl);

var socket = io(socketUrl, {
  path: '/socket.io',
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

// Connection event handlers for debugging
socket.on('connect', function() {
  console.log('[socket.io] Connected with id:', socket.id);
  ctx.fillStyle = "#000000";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#FFFFE0";
  ctx.fillRect(0, 0, 800, 400);
  ctx.fillStyle = "#000000";
  ctx.fillText("Connected! Setting up game...", 200, 200);
});

socket.on('disconnect', function() {
  console.log('[socket.io] Disconnected');
});

socket.on('connect_error', function(error) {
  console.error('[socket.io] Connection error:', error);
});

var id = -1;

var start = new Date();
var lines = 16,
  cW = ctx.canvas.width / 2,
  cH = ctx.canvas.height / 2;
var uiVisible = false;

function nameInputKeydown(event) {
  if (event.keyCode == 13) {
    document.getElementById("setName").click();
  }
}

function validNick() {
  var regex = /^\w*$/;

  var str =
    " fck suck pucy die dead rape rump fuck kill nugg negr shit asss ass gay homo arse dick d1ck cunt t1t p1s dink dlck cok dick fux fuk bitc tit smut slut shag piss pron nob phuk nigg mofo kums kum hell hoar god gay fuks fook feck fags fag dink cum boob blow porn hate poop sex sh1t c0ck c00n shit butt cock coon muff cox crap cum cawk cipa clit cnut cock";
  var n = str.indexOf(
    " " + document.getElementById("nameInput").value.toLowerCase()
  );
  if (n != -1) return 0;

  n = str.indexOf(document.getElementById("nameInput").value.toLowerCase());
  if (n != -1) return 0;

  return regex.exec(document.getElementById("nameInput").value) !== null;
}

function changeName() {
  if (validNick()) {
    var name = "" + document.getElementById("nameInput").value;
    if (name == "") {
      name = "Worm";
    }
    console.log("changing name to " + name);
    socket.emit("changeName", {
      name: name,
    });
    setCookie("trailgame_name", name, 30);
    document.getElementById("nameInput").value = name;
  }

  document.getElementById("ctx").focus();
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

      ctx.fillRect(data.players[i].x - 3, data.players[i].y - 3, 6, 6);
      ctx.fillStyle = "#000000";
      ctx.fillText(
        data.players[i].name,
        data.players[i].x,
        data.players[i].y - 10
      );
    }
  }
  ctx.fillStyle = "#000000";
  ctx.font = "25px Arial";

  if (data.inCountdown && !data.gameStarted) {
    ctx.fillText("Key I=up, K=down, J=left, L=right", 300, 260);
    ctx.fillText("Your snake has green circular head.", 300, 290);
  }

  ctx.font = "50px Arial";

  if (data.inCountdown && !data.gameStarted) {
    ctx.fillText("Wait " + data.countdown, 330, 200);
  }
  if (!data.gameStarted && !data.waiting && data.onlinePlayers < 2) {
    ctx.font = "25px Arial";
    ctx.fillText("Waiting for more online players...", 200, 200);
  }
  if (data.waiting && !data.gameStarted && !data.inCountdown) {
    if (data.lastWinnerID == id) {
      ctx.font = "30px Arial";
      ctx.fillStyle = "#0000FF";
      ctx.fillText("You are Winner!", 360, 250);
      ctx.font = "35px Arial";
      ctx.fillStyle = "#33FF99";
    }
    ctx.fillText("Winner: " + data.lastWinner, 360, 200);
  }
});

socket.on("newName", function (data) {
  console.log("Server changed your name to " + data.name);
  document.getElementById("nameInput").value = data.name;
});

socket.on("id", function (data) {
  console.log("Your id is " + data.id);
  id = data.id;
  setTimeout(function () {
    socket.emit("kthx");
  }, 100);
});

socket.on("afk?", function (data) {
  socket.emit("not afk");
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

var isRgb = false;
function rgb() {
  if (!isRgb) {
    isRgb = true;
    var oldName = document.getElementById("nameInput").value;
    socket.emit("changeName", { name: "RGB" });
    document.getElementById("nameInput").value = oldName;
    document.getElementById("setName").click();
  }
}

function unfocus() {
  var tmp = document.createElement("input");
  document.body.appendChild(tmp);
  tmp.focus();
  document.body.removeChild(tmp);

  document.getElementById("ctx").focus();
}
setTimeout(function () {
  try {
    if (getCookie("trailgame_name") != "") {
      if (getCookie("trailgame_name").length > 6) {
        setCookie("trailgame_name", "Guest", 100);
      }
      document.getElementById("nameInput").value = getCookie("trailgame_name");
      document.getElementById("setName").click();
    } else {
      console.error("Creating cookie for name");
      setCookie("trailgame_name", "Guest", 100);
    }
  } catch (err) {}
}, 500);
