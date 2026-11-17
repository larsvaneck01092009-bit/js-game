
const player1 = document.getElementById("player1");
const player2 = document.getElementById("player2");

let x = 50;
let y = 300;
let x2 = 1300;
let y2 = 300;

let health1 = 100;
let health2 = 100;
let gameOver = false;

let speed = 5;
let bulletSpeed = 20;
let projectiles = [];

let lastShot1 = 0;
let lastShot2 = 0;
let shootCooldown = 500;

const keys = {};

document.addEventListener("keydown", function (event) {
    keys[event.key.toLowerCase()] = true;
});

document.addEventListener("keyup", function (event) {
    keys[event.key.toLowerCase()] = false;
});

function gameLoop() {
    if (gameOver) return;

    // PLAYER 1 MOVEMENT
    if (keys["w"]) y -= speed;
    if (keys["s"]) y += speed;
    if (keys["a"]) x -= speed;
    if (keys["d"]) x += speed;

    // PLAYER 2 MOVEMENT
    if (keys["arrowup"]) y2 -= speed;
    if (keys["arrowdown"]) y2 += speed;
    if (keys["arrowleft"]) x2 -= speed;
    if (keys["arrowright"]) x2 += speed;

    // KEEP PLAYERS INSIDE THE SCREEN
    x = Math.max(0, Math.min(x, window.innerWidth - player1.offsetWidth));
    y = Math.max(0, Math.min(y, window.innerHeight - player1.offsetHeight));

    x2 = Math.max(0, Math.min(x2, window.innerWidth - player2.offsetWidth));
    y2 = Math.max(0, Math.min(y2, window.innerHeight - player2.offsetHeight));

    // COLLISION BETWEEN PLAYERS
    let dx = x2 - x;
    let dy = y2 - y;
    let distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 50 && distance > 0) {
        let overlap = 50 - distance;
        let nx = dx / distance;
        let ny = dy / distance;

        x -= nx * (overlap / 2);
        y -= ny * (overlap / 2);

        x2 += nx * (overlap / 2);
        y2 += ny * (overlap / 2);
    }

    // UPDATE PLAYER POSITIONS
    player1.style.transform = `translate(${x}px, ${y}px)`;
    player2.style.transform = `translate(${x2}px, ${y2}px)`;

    // PLAYER 1 SHOOTS AT PLAYER 2
    if (keys["f"] && Date.now() - lastShot1 > shootCooldown) {
        let bullet = document.createElement("div");
        bullet.classList.add("bullet");
        document.body.appendChild(bullet);

        let bulletX = x + player1.offsetWidth;
        let bulletY = y + player1.offsetHeight / 2;

        let dx = (x2 + player2.offsetWidth / 2) - bulletX;
        let dy = (y2 + player2.offsetHeight / 2) - bulletY;

        let distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
            projectiles.push({
                x: bulletX,
                y: bulletY,
                vx: (dx / distance) * bulletSpeed,
                vy: (dy / distance) * bulletSpeed,
                shooter: 1,
                element: bullet
            });
        } else {
            bullet.remove();
        }

        lastShot1 = Date.now();
    }

    // PLAYER 2 SHOOTS AT PLAYER 1
    if (keys["enter"] && Date.now() - lastShot2 > shootCooldown) {
        let bullet = document.createElement("div");
        bullet.classList.add("bullet");
        document.body.appendChild(bullet);

        let bulletX = x2;
        let bulletY = y2 + player2.offsetHeight / 2;

        let dx = (x + player1.offsetWidth / 2) - bulletX;
        let dy = (y + player1.offsetHeight / 2) - bulletY;

        let distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
            projectiles.push({
                x: bulletX,
                y: bulletY,
                vx: (dx / distance) * bulletSpeed,
                vy: (dy / distance) * bulletSpeed,
                shooter: 2,
                element: bullet
            });
        } else {
            bullet.remove();
        }

        lastShot2 = Date.now();
    }

    // MOVE BULLETS AND CHECK HITS
    for (let index = projectiles.length - 1; index >= 0; index--) {
        let projectile = projectiles[index];

        projectile.x += projectile.vx;
        projectile.y += projectile.vy;

        projectile.element.style.transform =
            `translate(${projectile.x}px, ${projectile.y}px)`;

        let hitPlayer = false;

        // PLAYER 1 BULLET HITS PLAYER 2
        if (projectile.shooter === 1) {
            if (
                projectile.x < x2 + 50 &&
                projectile.x + 10 > x2 &&
                projectile.y < y2 + 50 &&
                projectile.y + 10 > y2
            ) {
                health2 = Math.max(0, health2 - 10);
                hitPlayer = true;
            }
        }

        // PLAYER 2 BULLET HITS PLAYER 1
        if (projectile.shooter === 2) {
            if (
                projectile.x < x + 50 &&
                projectile.x + 10 > x &&
                projectile.y < y + 50 &&
                projectile.y + 10 > y
            ) {
                health1 = Math.max(0, health1 - 10);
                hitPlayer = true;
            }
        }

        // REMOVE HIT OR OFFSCREEN BULLETS
        if (
            hitPlayer ||
            projectile.x > window.innerWidth ||
            projectile.x < -10 ||
            projectile.y > window.innerHeight ||
            projectile.y < -10
        ) {
            projectile.element.remove();
            projectiles.splice(index, 1);
        }
    }

    // UPDATE HEALTH TEXT
    document.getElementById("health1").textContent =
        "Player 1: " + health1 + " HP";

    document.getElementById("health2").textContent =
        "Player 2: " + health2 + " HP";

    // CHECK WINNER
    if (health1 <= 0) {
        gameOver = true;
        document.getElementById("winnerText").textContent = "PLAYER 2 WINS!";
        document.getElementById("winScreen").style.display = "flex";
        return;
    }

    if (health2 <= 0) {
        gameOver = true;
        document.getElementById("winnerText").textContent = "PLAYER 1 WINS!";
        document.getElementById("winScreen").style.display = "flex";
        return;
    }

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
