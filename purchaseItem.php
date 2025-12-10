<?php
header('Content-Type: application/json');
session_start();
require_once 'db.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$userId = $_SESSION['user_id'];
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['itemId'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Item ID required']);
    exit;
}

$itemId = (int)$input['itemId'];
$price = isset($input['price']) ? (int)$input['price'] : 0;

try {
    $pdo->beginTransaction();
    
    // Get or create user's inventory entry
    $stmt = $pdo->prepare("SELECT inventory_id, gold FROM inventory WHERE user_id = ? LIMIT 1");
    $stmt->execute([$userId]);
    $inventory = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$inventory) {
        // Create initial inventory with default gold (1000)
        $stmt = $pdo->prepare("INSERT INTO inventory (user_id, item_id, acquired_at, gold) VALUES (?, 0, NOW(), 1000)");
        $stmt->execute([$userId]);
        $inventoryId = $pdo->lastInsertId();
        $currentGold = 1000;
    } else {
        $inventoryId = $inventory['inventory_id'];
        $currentGold = (int)$inventory['gold'];
    }
    
    // Check if user already owns this item
    $stmt = $pdo->prepare("SELECT id FROM inventory_items WHERE inventory_id = ? AND item_id = ?");
    $stmt->execute([$inventoryId, $itemId]);
    if ($stmt->fetch()) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['error' => 'You already own this item']);
        exit;
    }
    
    // Check if user has enough gold
    if ($currentGold < $price) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['error' => 'Not enough gold']);
        exit;
    }
    
    // Deduct gold
    $newGold = $currentGold - $price;
    $stmt = $pdo->prepare("UPDATE inventory SET gold = ? WHERE inventory_id = ?");
    $stmt->execute([$newGold, $inventoryId]);
    
    // Add item to inventory_items table
    $stmt = $pdo->prepare("INSERT INTO inventory_items (inventory_id, item_id) VALUES (?, ?)");
    $stmt->execute([$inventoryId, $itemId]);
    
    $pdo->commit();
    
    echo json_encode([
        'success' => true,
        'message' => 'Item purchased successfully',
        'currency' => $newGold
    ]);
} catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Failed to purchase item: ' . $e->getMessage()]);
}
?>
