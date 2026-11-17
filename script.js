
const player1 = document.getElementById("player1");
const player2 = document.getElementById("player2");
let x = 50;
let y = 50;
let x2 = 100;
let y2 = 100;
let speed = 4;





const keys = {};

document.addEventListener("keydown", function (event) {
    keys[event.key.toLowerCase()] = true;
});

document.addEventListener("keyup", function (event) {
    keys[event.key.toLowerCase()] = false;
});

function gameLoop() {
    let dx = x2 - x;
let dy = y2 - y;

    if (keys["w"]) y -= speed;
    if (keys["s"]) y += speed;
    if (keys["a"]) x -= speed;
    if (keys["d"]) x += speed;

    player1.style.left = x + "px";
    player1.style.top = y + "px";
    if (keys["arrowup"]) y2 -= speed;
    if (keys["arrowdown"]) y2 += speed;
    if (keys["arrowleft"]) x2 -= speed;
    if (keys["arrowright"]) x2 += speed;

    player2.style.left = x2 + "px";
    player2.style.top = y2 + "px";
    if (x < 0) {
        x = 0;
    }
    if (x > window.innerWidth - player1.offsetWidth) {
        x = window.innerWidth - player1.offsetWidth;
    }
    if (y < 0) {
        y = 0;
    }
    if (y > window.innerHeight - player1.offsetHeight) {
        y = window.innerHeight - player1.offsetHeight;
    }
    if (x2 < 0) {
        x2 = 0;
    }
    if (x2 > window.innerWidth - player2.offsetWidth) {
        x2 = window.innerWidth - player2.offsetWidth;
    }
    if (y2 < 0) {
        y2 = 0;
    }
    if (y2 > window.innerHeight - player2.offsetHeight) {
        y2 = window.innerHeight - player2.offsetHeight;
    }
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
    requestAnimationFrame(gameLoop);
}

gameLoop();
