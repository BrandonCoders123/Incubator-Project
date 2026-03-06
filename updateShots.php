<?php
// updateShots.php
header('Content-Type: application/json');
require_once 'db.php';

try {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($data['user_id']) || !isset($data['shots_fired']) || !isset($data['shots_hit'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields']);
        exit;
    }
    
    $user_id = $data['user_id'];
    $shots_fired = $data['shots_fired'];
    $shots_hit = $data['shots_hit'];
    
    $stmt = $pdo->prepare("UPDATE your_player_table SET total_shots = total_shots + ?, shots_hit = shots_hit + ? WHERE user_id = ?");
    $stmt->execute([$shots_fired, $shots_hit, $user_id]);
    
    echo json_encode(['success' => true]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
