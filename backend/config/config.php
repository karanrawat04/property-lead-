<?php
/**
 * Main configuration loader.
 * Forces Asia/Kolkata timezone and merges optional config.local.php overrides.
 */

date_default_timezone_set('Asia/Kolkata');

$defaultConfig = [
    'timezone' => 'Asia/Kolkata',
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => getenv('DB_PORT') ?: '3306',
        'name' => getenv('DB_NAME') ?: 'property_lead_manager',
        'user' => getenv('DB_USER') ?: 'root',
        'pass' => getenv('DB_PASS') ?: '',
        'charset' => 'utf8mb4',
    ],
    'app_secret' => getenv('APP_SECRET') ?: 'plm_dev_secret_change_before_production_deployment_2026',
    'session_hours' => 168,
    'cors_origin' => getenv('CORS_ORIGIN') ?: '*',
];

$localConfigPath = __DIR__ . '/config.local.php';
if (file_exists($localConfigPath)) {
    $localConfig = require $localConfigPath;
    if (is_array($localConfig)) {
        $defaultConfig = array_replace_recursive($defaultConfig, $localConfig);
    }
}

if (!empty($defaultConfig['timezone'])) {
    date_default_timezone_set($defaultConfig['timezone']);
}

return $defaultConfig;

