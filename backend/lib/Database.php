<?php

class Database
{
    private static ?PDO $instance = null;

    public static function getConnection(array $config): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $db = $config['db'];
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            $db['host'],
            $db['port'] ?? '3306',
            $db['name'],
            $db['charset'] ?? 'utf8mb4'
        );

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];

        $pdo = new PDO($dsn, $db['user'], $db['pass'], $options);
        // Ensure MySQL session matches Asia/Kolkata (+05:30)
        $pdo->exec("SET time_zone = '+05:30'");

        self::migrateIfNeeded($pdo);

        self::$instance = $pdo;
        return self::$instance;
    }

    public static function migrateIfNeeded(PDO $pdo): void
    {
        try {
            // Check if users table exists
            $tableCheck = $pdo->query("SHOW TABLES LIKE 'users'")->fetch();
            if (!$tableCheck) {
                return;
            }

            // Check users columns
            $colsUsers = $pdo->query('SHOW COLUMNS FROM users')->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('mobile_number', $colsUsers, true)) {
                $pdo->exec('ALTER TABLE users ADD COLUMN mobile_number VARCHAR(30) NULL AFTER role');
            }
            if (!in_array('alt_number', $colsUsers, true)) {
                $pdo->exec('ALTER TABLE users ADD COLUMN alt_number VARCHAR(30) NULL AFTER mobile_number');
            }
            if (!in_array('address', $colsUsers, true)) {
                $pdo->exec('ALTER TABLE users ADD COLUMN address TEXT NULL AFTER alt_number');
            }
            if (!in_array('date_of_joining', $colsUsers, true)) {
                $pdo->exec('ALTER TABLE users ADD COLUMN date_of_joining DATE NULL AFTER address');
            }
            if (!in_array('avatar_url', $colsUsers, true)) {
                $pdo->exec('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL AFTER date_of_joining');
            }

            // Check leads columns
            $leadsCheck = $pdo->query("SHOW TABLES LIKE 'leads'")->fetch();
            if ($leadsCheck) {
                $colsLeads = $pdo->query('SHOW COLUMNS FROM leads')->fetchAll(PDO::FETCH_COLUMN);
                if (!in_array('assigned_agent_id', $colsLeads, true)) {
                    $pdo->exec('ALTER TABLE leads ADD COLUMN assigned_agent_id INT UNSIGNED NULL AFTER interested_inventory_id');
                    try {
                        $pdo->exec('ALTER TABLE leads ADD CONSTRAINT fk_leads_assigned_agent FOREIGN KEY (assigned_agent_id) REFERENCES users (id) ON DELETE SET NULL');
                    } catch (Throwable $e) {}
                }
                if (!in_array('temperature', $colsLeads, true)) {
                    $pdo->exec("ALTER TABLE leads ADD COLUMN temperature ENUM('Hot', 'Warm', 'Cold') NOT NULL DEFAULT 'Warm' AFTER status");
                }
            }

            // Cleanup legacy tag references if present
            $invCheck = $pdo->query("SHOW TABLES LIKE 'inventory'")->fetch();
            if ($invCheck) {
                $colsInv = $pdo->query('SHOW COLUMNS FROM inventory')->fetchAll(PDO::FETCH_COLUMN);
                if (in_array('tag_id', $colsInv, true)) {
                    try {
                        $pdo->exec('ALTER TABLE inventory DROP FOREIGN KEY fk_inventory_tag');
                    } catch (Throwable $e) {}
                    try {
                        $pdo->exec('ALTER TABLE inventory DROP COLUMN tag_id');
                    } catch (Throwable $e) {}
                }
            }
            try {
                $pdo->exec('DROP TABLE IF EXISTS tag_master');
            } catch (Throwable $e) {}
        } catch (Throwable $e) {
            // Log or ignore schema migration error on read-only environments
            error_log('Database schema migration notice: ' . $e->getMessage());
        }
    }
}

