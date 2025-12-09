<?php
header('Content-Type: application/json');
require_once 'db.php';

try {
    $stmt = $pdo->query("
        SELECT 
            item_id as id,
            item_name as name,
            item_type as type,
            store_price as price,
            is_cosmetic
        FROM items
        ORDER BY item_id ASC
    ");

    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Map to frontend expected format
    $mappedItems = array_map(function($item) {
        return [
            'id' => $item['id'],
            'name' => $item['name'],
            'description' => $item['type'],
            'price' => $item['price'],
            'image_url' => 'https://via.placeholder.com/200?text=' . urlencode($item['name']),
            'rarity' => $item['is_cosmetic'] ? 'uncommon' : 'common',
            'category' => $item['type']
        ];
    }, $items);
    
    echo json_encode($mappedItems);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to load shop items: ' . $e->getMessage()]);
}
?>
