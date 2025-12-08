<?php
// getItems.php
header('Content-Type: application/json');
require_once 'db.php';

try {
    // Adjust column names to match your actual `items` table
    $stmt = $pdo->query("
        SELECT 
            id,
            name,
            description,
            price,
            image_url,
            rarity,
            category
        FROM items
        WHERE is_active = 1
        ORDER BY display_order ASC, rarity DESC
    ");

    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($items);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to load shop items']);
}

If your items columns are named slightly differently, just change the SELECT and WHERE is_active = 1 line to match.
Suggested minimal items table (for phpMyAdmin / MySQL):
CREATE TABLE items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price INT NOT NULL,
  image_url VARCHAR(255),
  rarity ENUM('common','rare','epic','legendary') DEFAULT 'common',
  category VARCHAR(50),
  is_active TINYINT(1) DEFAULT 1,
  display_order INT DEFAULT 0
);
