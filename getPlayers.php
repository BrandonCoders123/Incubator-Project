<?php
require_once 'db.php';

$stmt = $pdo->query("SELECT * FROM players");
$players = $stmt->fetchAll(PDO::FETCH_ASSOC);

header('Content-Type: application/json');
echo json_encode($players);
?>