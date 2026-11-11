<?php
/**
 * Example configuration file for InfinityFree / MySQL deployment.
 * Copy this to config.local.php and fill in your InfinityFree MySQL details
 * from your VistaPanel -> MySQL Databases section.
 */

return [
    'timezone' => 'Asia/Kolkata',
    'db' => [
        'host' => 'sqlXXX.infinityfree.com', // Replace with your InfinityFree MySQL Hostname
        'port' => '3306',
        'name' => 'if0_XXXXXXXX_realestate', // Replace with your InfinityFree Database Name
        'user' => 'if0_XXXXXXXX',            // Replace with your InfinityFree MySQL Username
        'pass' => 'YOUR_MYSQL_PASSWORD',     // Replace with your InfinityFree MySQL Password
        'charset' => 'utf8mb4',
    ],
    // Generate a unique random 32+ char string for encrypting SMTP/API secrets
    'app_secret' => 'CHANGE_THIS_TO_A_RANDOM_64_CHAR_HEX_STRING_FOR_PRODUCTION',
    // Token lifetime in hours (default 7 days)
    'session_hours' => 168,
    // Allowed CORS origins (comma-separated or '*' for same-origin/dev)
    'cors_origin' => '*',
];

