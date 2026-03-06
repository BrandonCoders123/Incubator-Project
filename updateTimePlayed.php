<?php
// updateTimePlayed.php
header('Content-Type: application/json');
require_once 'db.php';

try {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($data['user_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing user_id']);
        exit;
    }
    
    $user_id = $data['user_id'];
    
    $stmt = $pdo->prepare("UPDATE your_player_table SET minutes_played = minutes_played + 1 WHERE user_id = ?");
    $stmt->execute([$user_id]);
    
    echo json_encode(['success' => true]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
