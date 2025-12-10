<?php
session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Credentials: true');

require_once 'db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$userId = $_SESSION['user_id'];
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON input']);
    exit;
}

$mouseSensitivity = isset($input['mouse_sensitivity']) ? floatval($input['mouse_sensitivity']) : 1.0;
$moveForward = isset($input['move_forward_key']) ? $input['move_forward_key'] : 'KeyW';
$moveBackward = isset($input['move_backward_key']) ? $input['move_backward_key'] : 'KeyS';
$moveLeft = isset($input['move_left_key']) ? $input['move_left_key'] : 'KeyA';
$moveRight = isset($input['move_right_key']) ? $input['move_right_key'] : 'KeyD';
$jumpKey = isset($input['jump_key']) ? $input['jump_key'] : 'Space';
$crouchKey = isset($input['crouch_key']) ? $input['crouch_key'] : 'ControlLeft';

try {
    $stmt = $pdo->prepare("
        UPDATE user_settings 
        SET 
            mouse_sensitivity = ?,
            move_forward_key = ?,
            move_backward_key = ?,
            move_left_key = ?,
            move_right_key = ?,
            jump_key = ?,
            crouch_key = ?
        WHERE user_id = ?
    ");
    
    $result = $stmt->execute([
        $mouseSensitivity,
        $moveForward,
        $moveBackward,
        $moveLeft,
        $moveRight,
        $jumpKey,
        $crouchKey,
        $userId
    ]);

    if ($stmt->rowCount() === 0) {
        $insertStmt = $pdo->prepare("
            INSERT INTO user_settings 
            (user_id, mouse_sensitivity, move_forward_key, move_backward_key, move_left_key, move_right_key, jump_key, crouch_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $insertStmt->execute([
            $userId,
            $mouseSensitivity,
            $moveForward,
            $moveBackward,
            $moveLeft,
            $moveRight,
            $jumpKey,
            $crouchKey
        ]);
    }

    echo json_encode(['success' => true, 'message' => 'Settings saved successfully']);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
