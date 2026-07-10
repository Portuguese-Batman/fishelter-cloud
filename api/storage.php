<?php
session_start();
require_once __DIR__ . '/db.php';

if (!isset($_SESSION['user_id'])) {
    sendJson(['error' => 'Não autorizado'], 403);
}

$uploadDir = __DIR__ . '/../uploads/';
$limitGb = 2;

$usedBytes = 0;
if (is_dir($uploadDir)) {
    $files = glob($uploadDir . '*');
    if (is_array($files) && count($files) > 0) {
        $usedBytes = array_sum(array_map(function ($path) {
            return is_file($path) ? filesize($path) : 0;
        }, $files));
    }
}

$usedMb = round($usedBytes / 1024 / 1024, 2);
$usedGb = round($usedBytes / 1024 / 1024 / 1024, 2);
$percentage = min(100, max(0, round(($usedBytes / ($limitGb * 1024 * 1024 * 1024)) * 100)));

sendJson([
    'usedBytes' => $usedBytes,
    'usedMb' => $usedMb,
    'usedGb' => $usedGb,
    'limitGb' => $limitGb,
    'percentage' => $percentage
]);
