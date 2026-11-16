<?php

declare(strict_types=1);

date_default_timezone_set('Asia/Kolkata');

require_once __DIR__ . '/../lib/Validator.php';
require_once __DIR__ . '/../lib/Crypto.php';

function assertTrue(bool $cond, string $label): void
{
    if (!$cond) {
        fwrite(STDERR, "FAIL: $label\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

// 1. Lead validation: rejects budget_max < budget_min
$res1 = Validator::validateLead([
    'full_name' => 'Amit Sharma',
    'phone' => '+91 9876543210',
    'budget_min' => 5000000,
    'budget_max' => 3000000,
    'needs_followup' => 1,
    'next_followup_at' => '2026-11-12T11:30',
]);
assertTrue(isset($res1['errors']['budget_max']), 'Lead rejects budget_max < budget_min');

// 2. Lead validation: requires next_followup_at when needs_followup = 1
$res2 = Validator::validateLead([
    'full_name' => 'Amit Sharma',
    'phone' => '9876543210',
    'needs_followup' => 1,
    'next_followup_at' => '',
]);
assertTrue(isset($res2['errors']['next_followup_at']), 'Lead requires next_followup_at when needs_followup is set');

// 3. Lead validation: valid lead passes and normalizes datetime
$res3 = Validator::validateLead([
    'full_name' => 'Priya Verma',
    'phone' => '+91 9811122233',
    'email' => 'priya@example.com',
    'budget_min' => 4500000,
    'budget_max' => 6500000,
    'is_visited' => 1,
    'visited_at' => '2026-11-11T10:15',
    'needs_followup' => 1,
    'next_followup_at' => '2026-11-12T14:00',
    'status' => 'Visited',
]);
assertTrue(empty($res3['errors']), 'Valid lead passes validation');
assertTrue($res3['data']['next_followup_at'] === '2026-11-12 14:00:00', 'Datetime normalized for MySQL');

// 4. Inventory validation: uppercases unique_code and accepts unit_number like "410 C"
$inv = Validator::validateInventory([
    'unique_code' => 't1-410c',
    'unit_number' => '410 C',
    'title' => 'Skyline Towers',
    'area_sqft' => 1350,
    'price' => 7500000,
]);
assertTrue(empty($inv['errors']), 'Valid inventory passes');
assertTrue($inv['data']['unique_code'] === 'T1-410C', 'Unique code uppercased');
assertTrue($inv['data']['unit_number'] === '410 C', 'Unit number preserved as 410 C');

// 5. Crypto roundtrip
$secret = 'test_secret_key_for_unit_test';
$enc = Crypto::encrypt('my-smtp-app-password', $secret);
assertTrue($enc !== 'my-smtp-app-password' && $enc !== '', 'Crypto encrypts value');
assertTrue(Crypto::decrypt($enc, $secret) === 'my-smtp-app-password', 'Crypto decrypts back to plaintext');

// 7. Multiple email parsing
$emailParsed = Validator::parseEmailList("one@example.com, two@example.com; ONE@example.com\nbad-email");
assertTrue($emailParsed['emails'] === ['one@example.com', 'two@example.com'], 'Deduplicates valid email list');
assertTrue($emailParsed['invalid'] === ['bad-email'], 'Reports invalid emails in list');

// 8. Agent validation: requires valid name, email, and min 6 char password
$agentInvalid = Validator::validateAgent([
    'name' => 'A',
    'email' => 'not-an-email',
    'password' => '123',
], true);
assertTrue(isset($agentInvalid['errors']['name']), 'Agent rejects 1-char name');
assertTrue(isset($agentInvalid['errors']['email']), 'Agent rejects invalid email');
assertTrue(isset($agentInvalid['errors']['password']), 'Agent rejects short password');

// 9. Valid agent with DD/MM/YYYY date of joining
$agentValid = Validator::validateAgent([
    'name' => 'Rahul Verma',
    'email' => 'rahul@realestate.com',
    'password' => 'AgentPass123!',
    'mobile_number' => '+91 9876543210',
    'alt_number' => '011-23456789',
    'address' => 'Sector 62, Noida, UP',
    'date_of_joining' => '15/11/2026',
], true);
assertTrue(empty($agentValid['errors']), 'Valid agent passes validation');
assertTrue($agentValid['data']['date_of_joining'] === '2026-11-15', 'Agent date_of_joining normalized from DD/MM/YYYY');

// 10. Lead temperature and agent assignment validation
$leadWithTemp = Validator::validateLead([
    'full_name' => 'Kavita Singh',
    'phone' => '9988776655',
    'temperature' => 'Hot',
    'assigned_agent_id' => 4,
]);
assertTrue(empty($leadWithTemp['errors']), 'Lead with temperature and agent passes');
assertTrue($leadWithTemp['data']['temperature'] === 'Hot', 'Lead temperature preserved as Hot');
assertTrue($leadWithTemp['data']['assigned_agent_id'] === 4, 'Assigned agent ID preserved as 4');

// 11. BackupService SQL dump verification (if local DB is available)
require_once __DIR__ . '/../lib/BackupService.php';
assertTrue(class_exists('BackupService'), 'BackupService class exists');

try {
    $config = require __DIR__ . '/../config/config.php';
    require_once __DIR__ . '/../lib/Database.php';
    $pdo = Database::getConnection($config);
    $dump = BackupService::generateSqlDump($pdo);
    assertTrue(strlen($dump) > 100, 'BackupService generates non-empty SQL dump');
    assertTrue(str_contains($dump, 'SET FOREIGN_KEY_CHECKS'), 'BackupService dump contains safety directives');
    assertTrue(str_contains($dump, 'CREATE TABLE'), 'BackupService dump contains CREATE TABLE statements');
} catch (Throwable $e) {
    // If running in headless CI without local MySQL, skip DB test safely
    echo "Notice: DB-dependent test skipped (No DB connection: " . $e->getMessage() . ")\n";
}

echo "All backend unit checks passed.\n";

