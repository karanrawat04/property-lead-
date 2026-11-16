<?php

declare(strict_types=1);

class BackupService
{
    /**
     * Generates a complete self-contained SQL dump of all tables and data.
     * Compatible with MySQL 5.7+, 8.0+, MariaDB, and phpMyAdmin import.
     */
    public static function generateSqlDump(PDO $pdo, string $databaseName = 'property_lead_manager'): string
    {
        $out = [];
        $now = date('Y-m-d H:i:s');

        $out[] = "-- ============================================================";
        $out[] = "-- Property Lead Manager - Automated Database Backup";
        $out[] = "-- Generated At (Asia/Kolkata): {$now}";
        $out[] = "-- ============================================================";
        $out[] = "";
        $out[] = "SET NAMES utf8mb4;";
        $out[] = "SET time_zone = '+05:30';";
        $out[] = "SET FOREIGN_KEY_CHECKS = 0;";
        $out[] = "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';";
        $out[] = "";

        // Fetch all tables
        $tablesStmt = $pdo->query('SHOW TABLES');
        $tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($tables as $table) {
            $table = (string)$table;

            $out[] = "-- ------------------------------------------------------------";
            $out[] = "-- Table structure for `{$table}`";
            $out[] = "-- ------------------------------------------------------------";
            $out[] = "DROP TABLE IF EXISTS `{$table}`;";

            // Fetch CREATE TABLE
            $createStmt = $pdo->query("SHOW CREATE TABLE `{$table}`");
            $createRow = $createStmt->fetch(PDO::FETCH_NUM);
            if ($createRow && isset($createRow[1])) {
                $out[] = $createRow[1] . ";";
            }
            $out[] = "";

            // Fetch table data
            $rowsStmt = $pdo->query("SELECT * FROM `{$table}`");
            $rows = $rowsStmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($rows)) {
                $out[] = "-- Dumping data for table `{$table}` (" . count($rows) . " rows)";
                $columns = array_keys($rows[0]);
                $escapedCols = array_map(fn($col) => "`" . str_replace("`", "``", (string)$col) . "`", $columns);
                $colsSql = implode(', ', $escapedCols);

                // Group inserts in chunks of 50 rows for optimal performance & SQL size
                $chunks = array_chunk($rows, 50);
                foreach ($chunks as $chunk) {
                    $valuesArr = [];
                    foreach ($chunk as $row) {
                        $valParts = [];
                        foreach ($columns as $col) {
                            $val = $row[$col];
                            if ($val === null) {
                                $valParts[] = 'NULL';
                            } elseif (is_numeric($val) && !is_string($val)) {
                                $valParts[] = (string)$val;
                            } else {
                                $valParts[] = $pdo->quote((string)$val);
                            }
                        }
                        $valuesArr[] = '(' . implode(', ', $valParts) . ')';
                    }
                    $out[] = "INSERT INTO `{$table}` ({$colsSql}) VALUES\n  " . implode(",\n  ", $valuesArr) . ";";
                }
            }
            $out[] = "";
        }

        $out[] = "SET FOREIGN_KEY_CHECKS = 1;";
        $out[] = "-- [End of Dump - " . count($tables) . " tables backed up]";
        $out[] = "";

        return implode("\n", $out);
    }
}

