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

try {
    // First get the user's inventory_id from inventory table
    $stmt = $pdo->prepare("SELECT inventory_id FROM inventory WHERE user_id = ? LIMIT 1");
    $stmt->execute([$userId]);
    $inventory = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$inventory) {
        // User has no inventory yet, return empty array
        echo json_encode([]);
        exit;
    }
    
    $inventoryId = $inventory['inventory_id'];
    
    // Get all items from inventory_items table joined with items
    $stmt = $pdo->prepare("
        SELECT DISTINCT
            i.item_id as id,
            i.item_name as name,
            i.item_type as type,
            i.store_price as price,
            i.is_cosmetic
        FROM items i
        INNER JOIN inventory_items ii ON i.item_id = ii.item_id
        WHERE ii.inventory_id = ?
        ORDER BY i.item_id ASC
    ");
    $stmt->execute([$inventoryId]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Map to frontend format
    $mappedItems = array_map(function($item) {
        return [
            'id' => (int)$item['id'],
            'name' => $item['name'],
            'type' => $item['type'],
            'price' => (int)$item['price'],
            'isCosmeticItem' => $item['is_cosmetic'] == 1
        ];
    }, $items);
    
    echo json_encode($mappedItems);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to load inventory: ' . $e->getMessage()]);
}
?>
