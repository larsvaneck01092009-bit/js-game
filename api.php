
<?php

// Provides the room, player, position, projectile, and health endpoints for multiplayer matches.
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store, no-cache, must-revalidate");

$dataDir = __DIR__ . "/game_data";

if (!is_dir($dataDir)) {
    if (!mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
        http_response_code(500);
        echo json_encode(["error" => "Could not create game_data folder."]);
        exit;
    }
}

$htaccess = $dataDir . "/.htaccess";
if (!file_exists($htaccess)) {
    file_put_contents($htaccess, "Require all denied\n");
}

// Return a JSON response with the requested HTTP status and stop processing.
function respond($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// Accept only six-digit room codes before using them in room file paths.
function validRoom($code) {
    return preg_match('/^[0-9]{6}$/', $code);
}

// Build the server-side JSON filename used to store a room.
function roomPath($code) {
    global $dataDir;
    return $dataDir . "/" . $code . ".json";
}

// Add default state fields so rooms created by older versions remain usable.
function ensureGameFields(&$room) {
    if (!isset($room["health"])) {
        $room["health"] = ["1" => 100, "2" => 100];
    }

    if (!isset($room["bullets"]) || !is_array($room["bullets"])) {
        $room["bullets"] = [];
    }

    if (!array_key_exists("winner", $room)) {
        $room["winner"] = null;
    }

    if (!isset($room["lastTick"])) {
        $room["lastTick"] = microtime(true);
    }

    if (!isset($room["started"])) {
        $room["started"] = false;
    }

    foreach (["1", "2"] as $p) {
        if (!isset($room["players"][$p]["lastShot"])) {
            $room["players"][$p]["lastShot"] = 0;
        }

        if (!isset($room["players"][$p]["angle"])) {
            $room["players"][$p]["angle"] = 0;
        }

        if (!isset($room["players"][$p]["upgrades"]) ||
            !is_array($room["players"][$p]["upgrades"])) {
            $room["players"][$p]["upgrades"] = [];
        }

        foreach (["speed", "bulletSpeed", "health", "multiShot", "damage"] as $upgrade) {
            if (!isset($room["players"][$p]["upgrades"][$upgrade])) {
                $room["players"][$p]["upgrades"][$upgrade] = 0;
            }
        }
    }
}

// Read a room under a shared file lock without changing its saved state.
function readRoom($code) {
    $path = roomPath($code);

    if (!is_file($path)) {
        return null;
    }

    $file = fopen($path, "r");
    if (!$file) {
        return null;
    }

    flock($file, LOCK_SH);
    $content = stream_get_contents($file);
    flock($file, LOCK_UN);
    fclose($file);

    $room = json_decode($content, true);

    if (is_array($room)) {
        ensureGameFields($room);
    }

    return $room;
}

// Lock a room exclusively while applying a change and saving the updated JSON.
function updateRoom($code, $callback) {
    $file = fopen(roomPath($code), "c+");

    if (!$file) {
        respond(["error" => "Could not open room."], 500);
    }

    flock($file, LOCK_EX);
    rewind($file);
    $room = json_decode(stream_get_contents($file), true);

    if (!$room || !isset($room["players"])) {
        flock($file, LOCK_UN);
        fclose($file);
        respond(["error" => "Room not found."], 404);
    }

    ensureGameFields($room);
    $callback($room);

    rewind($file);
    ftruncate($file, 0);
    fwrite($file, json_encode($room));
    fflush($file);

    flock($file, LOCK_UN);
    fclose($file);
}

// Check that a request presents the secret token assigned to that room player.
function authorizePlayer($room, $player, $token) {
    $savedToken = $room["players"][$player]["token"] ?? null;

    return $savedToken &&
        hash_equals($savedToken, $token);
}

// Advance active bullets, apply hits, reduce health, and decide when a player wins.
function simulateProjectiles(&$room) {
    $now = microtime(true);
    $dt = min(max($now - $room["lastTick"], 0), 0.1);
    $room["lastTick"] = $now;

    if ($room["winner"] !== null || !$room["started"]) {
        return;
    }

    $remaining = [];

    foreach ($room["bullets"] as $bullet) {
        $bullet["x"] += $bullet["vx"] * $dt;
        $bullet["y"] += $bullet["vy"] * $dt;
        $bullet["life"] -= $dt;

        if ($bullet["life"] <= 0) {
            continue;
        }

        $target = $bullet["owner"] === "1" ? "2" : "1";
        $targetPlayer = $room["players"][$target];

        if (
            is_numeric($targetPlayer["x"] ?? null) &&
            is_numeric($targetPlayer["y"] ?? null)
        ) {
            $targetX = (float)$targetPlayer["x"] + 50;
            $targetY = (float)$targetPlayer["y"] + 50;

            $dx = $bullet["x"] - $targetX;
            $dy = $bullet["y"] - $targetY;

            if (($dx * $dx + $dy * $dy) <= (55 * 55)) {
                $damage = (int)($bullet["damage"] ?? 10);
                $room["health"][$target] = max(
                    0,
                    $room["health"][$target] - $damage
                );

                if ($room["health"][$target] <= 0) {
                    $room["winner"] = $bullet["owner"];
                    $room["bullets"] = [];
                    return;
                }

                continue;
            }
        }

        $remaining[] = $bullet;
    }

    $room["bullets"] = $remaining;
}

// Decode the JSON request body and select the requested API action.
$input = json_decode(file_get_contents("php://input"), true);

if (!is_array($input)) {
    respond(["error" => "Invalid request."], 400);
}

$action = $input["action"] ?? "";

// Create an empty room and return its code and Player 1's access token.
if ($action === "create") {
    do {
        $code = (string)random_int(100000, 999999);
    } while (file_exists(roomPath($code)));

    $token = bin2hex(random_bytes(32));

    $room = [
        "started" => false,
        "players" => [
            "1" => [
                "token" => $token,
                "x" => null,
                "y" => null,
                "angle" => 0,
                "upgrades" => [
                    "speed" => 0,
                    "bulletSpeed" => 0,
                    "health" => 0,
                    "multiShot" => 0,
                    "damage" => 0
                ],
                "lastSeen" => time(),
                "lastShot" => 0
            ],
            "2" => [
                "token" => null,
                "x" => null,
                "y" => null,
                "angle" => 0,
                "upgrades" => [
                    "speed" => 0,
                    "bulletSpeed" => 0,
                    "health" => 0,
                    "multiShot" => 0,
                    "damage" => 0
                ],
                "lastSeen" => 0,
                "lastShot" => 0
            ]
        ],
        "health" => ["1" => 100, "2" => 100],
        "bullets" => [],
        "winner" => null,
        "lastTick" => microtime(true)
    ];

    if (file_put_contents(roomPath($code), json_encode($room), LOCK_EX) === false) {
        respond(["error" => "Could not save room."], 500);
    }

    respond([
        "success" => true,
        "code" => $code,
        "player" => 1,
        "token" => $token
    ]);
}

// Assign Player 2 to an available room and start the match.
if ($action === "join") {
    $code = (string)($input["code"] ?? "");

    if (!validRoom($code) || !file_exists(roomPath($code))) {
        respond(["error" => "Room not found."], 404);
    }

    $token = bin2hex(random_bytes(32));
    $result = ["success" => true];

    updateRoom($code, function (&$room) use ($token, &$result) {
        if (!empty($room["players"]["2"]["token"])) {
            $result = ["error" => "Room is already full."];
            return;
        }

        $room["players"]["2"]["token"] = $token;
        $room["players"]["2"]["lastSeen"] = time();

        // Both players can now enter the game
        $room["started"] = true;
    });

    if (isset($result["error"])) {
        respond($result, 409);
    }

    respond([
        "success" => true,
        "code" => $code,
        "player" => 2,
        "token" => $token
    ]);
}

// Return the authorized player's current room state without exposing either token.
if ($action === "state") {
    $code = (string)($input["code"] ?? "");
    $player = (string)($input["player"] ?? "");
    $token = (string)($input["token"] ?? "");

    if (!validRoom($code) || !in_array($player, ["1", "2"], true)) {
        respond(["error" => "Invalid room or player."], 400);
    }

    $result = null;

    updateRoom($code, function (&$room) use ($player, $token, &$result) {
        if (!authorizePlayer($room, $player, $token)) {
            $result = ["error" => "Player authorization failed."];
            return;
        }

        simulateProjectiles($room);

        $players = $room["players"];
        unset($players["1"]["token"], $players["2"]["token"]);

        $result = [
            "success" => true,
            "players" => $players,
            "player2Joined" => !empty($room["players"]["2"]["token"]),
            "started" => $room["started"],
            "health" => $room["health"],
            "bullets" => $room["bullets"],
            "winner" => $room["winner"]
        ];
    });

    if (isset($result["error"])) {
        respond($result, 403);
    }

    respond($result);
}

// Validate and save the authorized player's latest position.
if ($action === "update") {
    $code = (string)($input["code"] ?? "");
    $player = (string)($input["player"] ?? "");
    $token = (string)($input["token"] ?? "");

    if (!validRoom($code)) {
        respond(["error" => "Invalid room code."], 400);
    }

    if (!in_array($player, ["1", "2"], true)) {
        respond(["error" => "Invalid player number."], 400);
    }

    if (!is_numeric($input["x"] ?? null) ||
        !is_numeric($input["y"] ?? null)) {
        respond(["error" => "Invalid position."], 400);
    }

    $x = (float)$input["x"];
    $y = (float)$input["y"];

    if (!is_finite($x) || !is_finite($y) ||
        abs($x) > 100000 || abs($y) > 100000) {
        respond(["error" => "Position is out of range."], 400);
    }

    $result = ["success" => true];

    updateRoom($code, function (&$room) use ($player, $token, $x, $y, &$result) {
        if (!authorizePlayer($room, $player, $token)) {
            $result = ["error" => "Player authorization failed."];
            return;
        }

        $room["players"][$player]["x"] = $x;
        $room["players"][$player]["y"] = $y;
        $room["players"][$player]["lastSeen"] = time();

        simulateProjectiles($room);
    });

    if (isset($result["error"])) {
        respond($result, 403);
    }

    respond($result);
}

// Enforce shooting rules and add a projectile aimed at the other player.
if ($action === "shoot") {
    $code = (string)($input["code"] ?? "");
    $player = (string)($input["player"] ?? "");
    $token = (string)($input["token"] ?? "");

    if (!validRoom($code)) {
        respond(["error" => "Invalid room code."], 400);
    }

    if (!in_array($player, ["1", "2"], true)) {
        respond(["error" => "Invalid player number."], 400);
    }

    $result = ["success" => true];

    updateRoom($code, function (&$room) use ($player, $token, &$result) {
        if (!authorizePlayer($room, $player, $token)) {
            $result = ["error" => "Player authorization failed."];
            return;
        }

        simulateProjectiles($room);

        if (!$room["started"] || $room["winner"] !== null) {
            $result = ["error" => "The game is not running."];
            return;
        }

        $now = microtime(true);
        $lastShot = (float)$room["players"][$player]["lastShot"];

        if (($now - $lastShot) < 0.5) {
            $result = ["error" => "Shooting cooldown."];
            return;
        }

        $opponent = $player === "1" ? "2" : "1";

        $ownX = $room["players"][$player]["x"];
        $ownY = $room["players"][$player]["y"];
        $otherX = $room["players"][$opponent]["x"];
        $otherY = $room["players"][$opponent]["y"];

        if (!is_numeric($ownX) || !is_numeric($ownY)) {
            $result = ["error" => "Player position not ready."];
            return;
        }

        $startX = (float)$ownX + 50;
        $startY = (float)$ownY + 50;

        if (is_numeric($otherX) && is_numeric($otherY)) {
            $dx = ((float)$otherX + 50) - $startX;
            $dy = ((float)$otherY + 50) - $startY;
        } else {
            $dx = $player === "1" ? 1 : -1;
            $dy = 0;
        }

        $distance = sqrt($dx * $dx + $dy * $dy);

        if ($distance < 0.001) {
            $dx = $player === "1" ? 1 : -1;
            $dy = 0;
            $distance = 1;
        }

        $bulletSpeed = 650;
        $bulletSpeed *= 1 + (0.25 * $room["players"][$player]["upgrades"]["bulletSpeed"]);
        $angle = rad2deg(atan2($dy, $dx));
        $shotCount = 1 + $room["players"][$player]["upgrades"]["multiShot"];
        $aimAngle = atan2($dy, $dx);

        for ($shot = 0; $shot < $shotCount; $shot++) {
            $shotAngle = $aimAngle + ($shot - (($shotCount - 1) / 2)) * 0.12;

            $room["bullets"][] = [
                "id" => bin2hex(random_bytes(8)),
                "owner" => $player,
                "x" => $startX,
                "y" => $startY,
                "vx" => cos($shotAngle) * $bulletSpeed,
                "vy" => sin($shotAngle) * $bulletSpeed,
                "damage" => 10 + (10 * $room["players"][$player]["upgrades"]["damage"]),
                "life" => 3.5
            ];
        }

        $room["players"][$player]["angle"] = $angle;
        $room["players"][$player]["lastShot"] = $now;
        $result["angle"] = $angle;
    });

    if (isset($result["error"])) {
        respond($result, 400);
    }

    respond($result);
}

// Let only the losing player select an upgrade, then reset the room for a rematch.
if ($action === "upgrade") {
    $code = (string)($input["code"] ?? "");
    $player = (string)($input["player"] ?? "");
    $token = (string)($input["token"] ?? "");
    $upgrade = (string)($input["upgrade"] ?? "");

    if (!validRoom($code) || !in_array($player, ["1", "2"], true)) {
        respond(["error" => "Invalid room or player."], 400);
    }

    if (!in_array($upgrade, ["speed", "bulletSpeed", "health", "multiShot", "damage"], true)) {
        respond(["error" => "Invalid upgrade."], 400);
    }

    $result = ["success" => true];

    updateRoom($code, function (&$room) use ($player, $token, $upgrade, &$result) {
        if (!authorizePlayer($room, $player, $token)) {
            $result = ["error" => "Player authorization failed."];
            return;
        }

        if ($room["winner"] === null || $room["winner"] === $player) {
            $result = ["error" => "Only the losing player can choose an upgrade."];
            return;
        }

        $currentLevel = (int)$room["players"][$player]["upgrades"][$upgrade];
        $room["players"][$player]["upgrades"][$upgrade] = $currentLevel + 1;
        $room["health"] = [
            "1" => 100 + (25 * $room["players"]["1"]["upgrades"]["health"]),
            "2" => 100 + (25 * $room["players"]["2"]["upgrades"]["health"])
        ];
        $room["bullets"] = [];
        $room["winner"] = null;
        $room["lastTick"] = microtime(true);

        foreach (["1", "2"] as $playerNumber) {
            $room["players"][$playerNumber]["x"] = null;
            $room["players"][$playerNumber]["y"] = null;
            $room["players"][$playerNumber]["angle"] = 0;
            $room["players"][$playerNumber]["lastShot"] = 0;
        }
    });

    if (isset($result["error"])) {
        respond($result, 403);
    }

    respond($result);
}

// Reject action names that do not match a supported endpoint.
respond(["error" => "Unknown action."], 400);

?>
