
// Runs the multiplayer match in the browser and syncs each player's state with api.php.
const API_URL = "api.php";

// Get the room information
const roomCode = sessionStorage.getItem("roomCode");
const playerNumber = Number(sessionStorage.getItem("playerNumber"));
const playerToken = sessionStorage.getItem("playerToken");

if (
    !/^[0-9]{6}$/.test(roomCode || "") ||
    ![1, 2].includes(playerNumber) ||
    !playerToken
) {
    alert("Your multiplayer room information is invalid. Please return to the lobby and create or join a room again.");
    throw new Error("Missing multiplayer information.");
}

// Game elements
const player1 = document.getElementById("player1");
const player2 = document.getElementById("player2");
const health1 = document.getElementById("health1");
const health2 = document.getElementById("health2");
const winScreen = document.getElementById("winScreen");
const winnerText = document.getElementById("winnerText");
const winMessage = document.getElementById("winMessage");
const upgradeOptions = document.getElementById("upgradeOptions");
const remotePlayer = playerNumber === 1 ? player2 : player1;
const WORLD_WIDTH = 1400;
const WORLD_HEIGHT = 800;

// Animate server updates to the remote player's position.
remotePlayer.style.transition = "transform 100ms linear";
player1.style.transformOrigin = "top left";
player2.style.transformOrigin = "top left";

// Player positions
let x = playerNumber === 1 ? 50 : 1250;
let y = 350;

let remoteX = playerNumber === 1 ? 1250 : 50;
let remoteY = 350;
let angle1 = 0;
let angle2 = 0;

let speed = 200;
let lastFrameTime = performance.now();
let checkingServer = false;
let gameOver = false;
let syncTimer;

// Keyboard controls
const keys = {};

document.addEventListener("keydown", (event) => {
    keys[event.key.toLowerCase()] = true;

    if (
        event.key === "Enter" ||
        event.key.startsWith("Arrow")
    ) {
        event.preventDefault();
    }

    if (event.repeat || gameOver) return;

    if (playerNumber === 1 && event.key.toLowerCase() === "f") {
        shoot();
    }

    if (playerNumber === 2 && event.key === "Enter") {
        shoot();
    }
});

document.addEventListener("keyup", (event) => {
    keys[event.key.toLowerCase()] = false;
});

window.addEventListener("blur", () => {
    for (const key in keys) {
        keys[key] = false;
    }
});

// Bullet display container
const bulletContainer = document.createElement("div");
bulletContainer.style.position = "fixed";
bulletContainer.style.left = "0";
bulletContainer.style.top = "0";
bulletContainer.style.width = "100%";
bulletContainer.style.height = "100%";
bulletContainer.style.pointerEvents = "none";
bulletContainer.style.zIndex = "10";
document.body.appendChild(bulletContainer);

// Latest bullets received from the server
let bullets = [];

// Send an authenticated JSON request to the game API and return its response.
async function sendRequest(data) {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ...data,
            roomCode: roomCode,
            playerNumber: playerNumber,
            code: roomCode,
            player: String(playerNumber),
            token: playerToken
        })
    });

    const result = await response.json();

    if (!response.ok || result.error) {
        const error = new Error(result.error || "Server request failed.");
        error.status = response.status;
        throw error;
    }

    return result;
}

// Ask the server to create a projectile for this player.
async function shoot() {
    if (gameOver) return;

    try {
        const result = await sendRequest({
            action: "shoot"
        });

        if (Number.isFinite(Number(result.angle))) {
            if (playerNumber === 1) {
                angle1 = Number(result.angle);
            } else {
                angle2 = Number(result.angle);
            }

            drawPlayers();
        }
    } catch (error) {
        // The server handles the shooting cooldown.
        if (!error.message.toLowerCase().includes("cooldown")) {
            console.error("Shooting error:", error);
        }
    }
}

// Push the local and remote players apart when their sprites overlap.
function handleCollision() {
    const dx = remoteX - x;
    const dy = remoteY - y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const minimumDistance = 100;

    if (distance < minimumDistance && distance > 0) {
        const overlap = minimumDistance - distance;
        const pushX = (dx / distance) * overlap / 2;
        const pushY = (dy / distance) * overlap / 2;

        x -= pushX;
        y -= pushY;

        remoteX += pushX;
        remoteY += pushY;
    }
}

// Fit the same game world inside each player's viewport.
function getGameScale() {
    const scale = Math.min(
        window.innerWidth / WORLD_WIDTH,
        window.innerHeight / WORLD_HEIGHT
    );

    const offsetX = (window.innerWidth - WORLD_WIDTH * scale) / 2;
    const offsetY = (window.innerHeight - WORLD_HEIGHT * scale) / 2;

    return { scale, offsetX, offsetY };
}

// Render both players, mapping local and remote positions to their player numbers.
function drawPlayers() {
    const view = getGameScale();
    const screenX = view.offsetX + x * view.scale;
    const screenY = view.offsetY + y * view.scale;
    const remoteScreenX = view.offsetX + remoteX * view.scale;
    const remoteScreenY = view.offsetY + remoteY * view.scale;

    if (playerNumber === 1) {
        player1.style.transform =
            `translate(${screenX}px, ${screenY}px) scale(${view.scale}) rotate(${angle1}deg)`;
        player2.style.transform =
            `translate(${remoteScreenX}px, ${remoteScreenY}px) scale(${view.scale}) rotate(${angle2}deg)`;
    } else {
        player2.style.transform =
            `translate(${screenX}px, ${screenY}px) scale(${view.scale}) rotate(${angle2}deg)`;
        player1.style.transform =
            `translate(${remoteScreenX}px, ${remoteScreenY}px) scale(${view.scale}) rotate(${angle1}deg)`;
    }
}

// Draw bullets smoothly between server updates
function drawBullets() {
    bulletContainer.innerHTML = "";

    const now = performance.now();
    const view = getGameScale();

    for (const bullet of bullets) {
        // Predict where the bullet should be between server updates.
        const elapsed = Math.min(
            (now - bullet.receivedAt) / 1000,
            0.15
        );

        const visualX = Number(bullet.x) + Number(bullet.vx) * elapsed;
        const visualY = Number(bullet.y) + Number(bullet.vy) * elapsed;

        const bulletElement = document.createElement("div");

        bulletElement.style.position = "absolute";
        bulletElement.style.width = `${10 * view.scale}px`;
        bulletElement.style.height = `${10 * view.scale}px`;
        bulletElement.style.backgroundColor = "yellow";
        bulletElement.style.borderRadius = "50%";
        bulletElement.style.left =
            `${view.offsetX + visualX * view.scale}px`;
        bulletElement.style.top =
            `${view.offsetY + visualY * view.scale}px`;

        bulletContainer.appendChild(bulletElement);
    }
}

// Display each player's latest health value returned by the server.
function updateHealth(health) {
    if (!health) return;

    if (health1) {
        health1.textContent = `Player 1: ${health["1"] ?? health[1] ?? 100} HP`;
    }

    if (health2) {
        health2.textContent = `Player 2: ${health["2"] ?? health[2] ?? 100} HP`;
    }
}

// Stop player input and show the winning player's result.
function showWinner(winner, players) {
    if (!winner || gameOver) return;

    gameOver = true;

    if (winnerText) {
        winnerText.textContent = Number(winner) === playerNumber
            ? "You win!"
            : "You lost!";
    }

    if (winMessage) {
        winMessage.textContent = Number(winner) === playerNumber
            ? "Waiting for the other player to choose an upgrade..."
            : "Choose one upgrade for the next round:";
    }

    if (upgradeOptions) {
        upgradeOptions.style.display = Number(winner) === playerNumber ? "none" : "flex";

        upgradeOptions.querySelectorAll("button").forEach((button) => {
            button.disabled = false;
            button.textContent = button.dataset.label;
        });
    }

    if (winScreen) {
        winScreen.style.display = "flex";
    }

    for (const key in keys) {
        keys[key] = false;
    }
}

// Reset local match state after the loser selects an upgrade.
function startNextRound() {
    gameOver = false;
    x = playerNumber === 1 ? 50 : 1250;
    y = 350;
    remoteX = playerNumber === 1 ? 1250 : 50;
    remoteY = 350;
    angle1 = 0;
    angle2 = 0;
    bullets = [];

    if (winScreen) {
        winScreen.style.display = "none";
    }

    drawPlayers();
}

// Submit the loser's choice; the server applies it and starts the rematch.
async function chooseUpgrade(event) {
    const buttons = upgradeOptions.querySelectorAll("button");
    buttons.forEach((button) => {
        button.disabled = true;
    });

    if (winMessage) {
        winMessage.textContent = "Applying upgrade and starting the next round...";
    }

    try {
        await sendRequest({
            action: "upgrade",
            upgrade: event.currentTarget.dataset.upgrade
        });
        startNextRound();
    } catch (error) {
        console.error("Upgrade error:", error);
        if (winMessage) {
            winMessage.textContent = error.message;
        }
        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
}

upgradeOptions?.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", chooseUpgrade);
});

// Read a player's position while supporting the server's possible key formats.
function getPlayerPosition(players, number) {
    if (!players) return null;

    return (
        players[String(number)] ||
        players[`player${number}`] ||
        players[number] ||
        null
    );
}

// Apply local movement and redraw the game continuously using animation frames.
function gameLoop() {
    const now = performance.now();

    let deltaTime = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Prevent large movement jumps if the browser pauses.
    deltaTime = Math.min(deltaTime, 0.05);

    if (!gameOver) {
        // Player 1: WASD
        // Player 2: Arrow keys
        if (playerNumber === 1) {
            if (keys["w"]) y -= speed * deltaTime;
            if (keys["s"]) y += speed * deltaTime;
            if (keys["a"]) x -= speed * deltaTime;
            if (keys["d"]) x += speed * deltaTime;
        } else {
            if (keys["arrowup"]) y -= speed * deltaTime;
            if (keys["arrowdown"]) y += speed * deltaTime;
            if (keys["arrowleft"]) x -= speed * deltaTime;
            if (keys["arrowright"]) x += speed * deltaTime;
        }

        handleCollision();
        x = Math.max(0, Math.min(WORLD_WIDTH - 100, x));
        y = Math.max(0, Math.min(WORLD_HEIGHT - 100, y));
    }

    drawPlayers();
    drawBullets();

    requestAnimationFrame(gameLoop);
}

// Upload this player's position, then apply the latest remote position and game state.
async function syncGame() {
    if (checkingServer) return;

    checkingServer = true;

    try {
        if (!gameOver) {
            await sendRequest({
                action: "update",
                x: x,
                y: y
            });
        }

        // Get the latest game state
        const result = await sendRequest({
            action: "state"
        });

        if (gameOver && !result.winner && result.started) {
            startNextRound();
        }

        if (result.players) {
            const ownPlayer = getPlayerPosition(result.players, playerNumber);
            const upgrades = ownPlayer?.upgrades || {};
            speed = 300 * (1 + 0.25 * Number(upgrades.speed || 0));

            const otherPlayerNumber = playerNumber === 1 ? 2 : 1;
            const otherPlayer = getPlayerPosition(
                result.players,
                otherPlayerNumber
            );

            if (otherPlayer && otherPlayer.x !== null && otherPlayer.y !== null) {
                const nextX = Number(otherPlayer.x);
                const nextY = Number(otherPlayer.y);

                if (Number.isFinite(nextX) && Number.isFinite(nextY)) {
                    remoteX = nextX;
                    remoteY = nextY;

                    const nextAngle = Number(otherPlayer.angle);
                    if (Number.isFinite(nextAngle)) {
                        if (otherPlayerNumber === 1) {
                            angle1 = nextAngle;
                        } else {
                            angle2 = nextAngle;
                        }
                    }

                    drawPlayers();
                }
            }
        }

        // Save the server's latest bullet positions.
        // receivedAt lets the browser animate them between updates.
        if (Array.isArray(result.bullets)) {
            const receivedAt = performance.now();

            bullets = result.bullets.map((bullet) => ({
                ...bullet,
                receivedAt: receivedAt
            }));
        }

        updateHealth(result.health);

        if (result.winner) {
            showWinner(result.winner, result.players);
        }

    } catch (error) {
        console.error("Multiplayer sync error:", error);

        if ([400, 403, 404].includes(error.status)) {
            clearInterval(syncTimer);
            sessionStorage.removeItem("roomCode");
            sessionStorage.removeItem("playerNumber");
            sessionStorage.removeItem("playerToken");
            alert("This multiplayer room is no longer valid. Please return to the lobby and create or join a room again.");
            window.location.href = "multiplayer.html";
        }
    }

    checkingServer = false;
}

// Refresh immediately when returning to a tab that may have been throttled in the background.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        syncGame();
    }
});

// Start the game
drawPlayers();
requestAnimationFrame(gameLoop);
syncGame();

// Poll often enough for responsive movement without flooding the server.
syncTimer = setInterval(syncGame, 10);
