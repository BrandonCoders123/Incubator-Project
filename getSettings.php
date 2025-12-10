<?php
session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Credentials: true');

require_once 'db.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$userId = $_SESSION['user_id'];

try {
    $stmt = $pdo->prepare("
        SELECT 
            mouse_sensitivity,
            move_forward_key,
            move_backward_key,
            move_left_key,
            move_right_key,
            jump_key,
            crouch_key
        FROM user_settings 
        WHERE user_id = ?
    ");
    $stmt->execute([$userId]);
    $settings = $stmt->fetch();

    if ($settings) {
        echo json_encode([
            'success' => true,
            'settings' => $settings
        ]);
    } else {
        echo json_encode([
            'success' => true,
            'settings' => [
                'mouse_sensitivity' => 1.0,
                'move_forward_key' => 'KeyW',
                'move_backward_key' => 'KeyS',
                'move_left_key' => 'KeyA',
                'move_right_key' => 'KeyD',
                'jump_key' => 'Space',
                'crouch_key' => 'ControlLeft'
            ]
        ]);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
