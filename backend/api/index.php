<?php

declare(strict_types=1);

$config = require __DIR__ . '/../config/config.php';

require_once __DIR__ . '/../lib/Response.php';
require_once __DIR__ . '/../lib/Crypto.php';
require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/Validator.php';
require_once __DIR__ . '/../lib/Auth.php';
require_once __DIR__ . '/../lib/Mailer.php';
require_once __DIR__ . '/../lib/ReminderService.php';

Response::sendHeaders($config['cors_origin'] ?? '*');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Parse request path relative to /api (works on both Apache .htaccess and php -S)
$requestUri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$route = $requestUri;

if (basename($scriptName) === 'index.php') {
    $baseDir = rtrim(dirname($scriptName), '/');
    if ($baseDir !== '' && $baseDir !== '/' && str_starts_with($route, $baseDir)) {
        $route = substr($route, strlen($baseDir));
    }
    if (str_starts_with($route, '/index.php')) {
        $route = substr($route, strlen('/index.php'));
    }
}
if (str_starts_with($route, '/api/')) {
    $route = substr($route, 4);
} elseif ($route === '/api') {
    $route = '';
}
$route = '/' . trim($route, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        Response::error('Invalid JSON request body.', 400);
    }
    return $decoded;
}

try {
    $pdo = Database::getConnection($config);
} catch (Throwable $e) {
    if ($route === '/health') {
        Response::json([
            'success' => false,
            'message' => 'Database connection failed. Check backend/config/config.local.php.',
            'timezone' => date_default_timezone_get(),
            'server_time' => date('Y-m-d H:i:s'),
        ], 500);
    }
    Response::error('Database connection error. Please check MySQL configuration.', 500);
}

$appSecret = (string)($config['app_secret'] ?? '');

try {
    // -------------------------------------------------------------------------
    // PUBLIC ROUTES
    // -------------------------------------------------------------------------
    if ($route === '/health' && $method === 'GET') {
        $userCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        Response::success([
            'status' => 'ok',
            'needs_setup' => $userCount === 0,
            'timezone' => date_default_timezone_get(),
            'server_time' => date('Y-m-d H:i:s'),
            'php_version' => PHP_VERSION,
        ]);
    }

    if ($route === '/auth/setup' && $method === 'POST') {
        $userCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        if ($userCount > 0) {
            Response::error('Setup has already been completed. Please log in.', 403);
        }

        $body = readJsonBody();
        $name = trim((string)($body['name'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');

        $errors = [];
        if (Validator::strLen($name) < 2) {
            $errors['name'] = 'Name must be at least 2 characters.';
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Valid email address is required.';
        }
        if (strlen($password) < 8) {
            $errors['password'] = 'Password must be at least 8 characters.';
        }
        if (!empty($errors)) {
            Response::error('Validation failed.', 422, $errors);
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)');
        $stmt->execute([$name, $email, $hash, 'admin']);
        $userId = (int)$pdo->lastInsertId();

        // Ensure default email_settings row exists
        ReminderService::ensureSettingsRow($pdo);

        $session = Auth::createSession($pdo, $userId, (int)($config['session_hours'] ?? 168));
        Response::success([
            'token' => $session['token'],
            'expires_at' => $session['expires_at'],
            'user' => [
                'id' => $userId,
                'name' => $name,
                'email' => $email,
                'role' => 'admin',
            ],
        ], 'Admin account created successfully.', 201);
    }

    if ($route === '/auth/login' && $method === 'POST') {
        $body = readJsonBody();
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
            Response::error('Email and password are required.', 422);
        }

        $stmt = $pdo->prepare('SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || empty($user['is_active']) || !password_verify($password, $user['password_hash'])) {
            Response::error('Invalid email or password.', 401);
        }

        $session = Auth::createSession($pdo, (int)$user['id'], (int)($config['session_hours'] ?? 168));
        Response::success([
            'token' => $session['token'],
            'expires_at' => $session['expires_at'],
            'user' => [
                'id' => (int)$user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $user['role'],
            ],
        ], 'Login successful.');
    }

    if ($route === '/reminders/cron' && $method === 'GET') {
        $key = (string)($_GET['key'] ?? '');
        $settings = ReminderService::ensureSettingsRow($pdo);
        $expected = (string)($settings['cron_secret'] ?? '');

        if ($key === '' || $expected === '' || !hash_equals($expected, $key)) {
            Response::error('Invalid cron key.', 403);
        }

        $result = ReminderService::processDueReminders($pdo, $appSecret, false);
        Response::success($result, $result['message']);
    }

    // -------------------------------------------------------------------------
    // PROTECTED ROUTES
    // -------------------------------------------------------------------------
    $currentUser = Auth::requireUser($pdo);

    if ($route === '/auth/logout' && $method === 'POST') {
        Auth::revokeCurrentToken($pdo);
        Response::success(null, 'Logged out.');
    }

    if ($route === '/auth/me' && $method === 'GET') {
        Response::success([
            'id' => (int)$currentUser['id'],
            'name' => $currentUser['name'],
            'email' => $currentUser['email'],
            'role' => $currentUser['role'],
            'timezone' => date_default_timezone_get(),
        ]);
    }

    if ($route === '/auth/change-password' && $method === 'POST') {
        $body = readJsonBody();
        $currentPassword = (string)($body['current_password'] ?? '');
        $newPassword = (string)($body['new_password'] ?? '');

        if ($currentPassword === '' || strlen($newPassword) < 8) {
            Response::error('Current password and a new password (min 8 characters) are required.', 422);
        }

        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$currentUser['id']]);
        $row = $stmt->fetch();
        if (!$row || !password_verify($currentPassword, $row['password_hash'])) {
            Response::error('Current password is incorrect.', 422, ['current_password' => 'Current password is incorrect.']);
        }

        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $upd = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $upd->execute([$newHash, $currentUser['id']]);
        Response::success(null, 'Password updated successfully.');
    }

    // -------------------------------------------------------------------------
    // TAG MASTER ROUTES
    // -------------------------------------------------------------------------
    if ($route === '/tags' && $method === 'GET') {
        $stmt = $pdo->query(
            'SELECT t.*, COUNT(i.id) AS inventory_count
             FROM tag_master t
             LEFT JOIN inventory i ON i.tag_id = t.id
             GROUP BY t.id
             ORDER BY t.is_active DESC, t.name ASC'
        );
        Response::success($stmt->fetchAll());
    }

    if ($route === '/tags' && $method === 'POST') {
        $body = readJsonBody();
        $validated = Validator::validateTag($body);
        if (!empty($validated['errors'])) {
            Response::error('Validation failed.', 422, $validated['errors']);
        }
        $data = $validated['data'];

        $dup = $pdo->prepare('SELECT id FROM tag_master WHERE LOWER(name) = LOWER(?) LIMIT 1');
        $dup->execute([$data['name']]);
        if ($dup->fetch()) {
            Response::error('A tag with this name already exists.', 409, ['name' => 'Tag name must be unique.']);
        }

        $stmt = $pdo->prepare('INSERT INTO tag_master (name, description, color, is_active) VALUES (?, ?, ?, ?)');
        $stmt->execute([$data['name'], $data['description'], $data['color'], $data['is_active']]);
        $id = (int)$pdo->lastInsertId();

        $fetch = $pdo->prepare('SELECT *, 0 AS inventory_count FROM tag_master WHERE id = ?');
        $fetch->execute([$id]);
        Response::success($fetch->fetch(), 'Tag created.', 201);
    }

    if (preg_match('#^/tags/(\d+)$#', $route, $m)) {
        $tagId = (int)$m[1];

        if ($method === 'PUT') {
            $body = readJsonBody();
            $validated = Validator::validateTag($body);
            if (!empty($validated['errors'])) {
                Response::error('Validation failed.', 422, $validated['errors']);
            }
            $data = $validated['data'];

            $dup = $pdo->prepare('SELECT id FROM tag_master WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1');
            $dup->execute([$data['name'], $tagId]);
            if ($dup->fetch()) {
                Response::error('Another tag with this name already exists.', 409, ['name' => 'Tag name must be unique.']);
            }

            $stmt = $pdo->prepare('UPDATE tag_master SET name = ?, description = ?, color = ?, is_active = ? WHERE id = ?');
            $stmt->execute([$data['name'], $data['description'], $data['color'], $data['is_active'], $tagId]);

            $fetch = $pdo->prepare(
                'SELECT t.*, COUNT(i.id) AS inventory_count
                 FROM tag_master t
                 LEFT JOIN inventory i ON i.tag_id = t.id
                 WHERE t.id = ?
                 GROUP BY t.id'
            );
            $fetch->execute([$tagId]);
            $tag = $fetch->fetch();
            if (!$tag) {
                Response::error('Tag not found.', 404);
            }
            Response::success($tag, 'Tag updated.');
        }

        if ($method === 'DELETE') {
            $stmt = $pdo->prepare('DELETE FROM tag_master WHERE id = ?');
            $stmt->execute([$tagId]);
            if ($stmt->rowCount() === 0) {
                Response::error('Tag not found.', 404);
            }
            Response::success(null, 'Tag deleted.');
        }
    }

    // -------------------------------------------------------------------------
    // INVENTORY ROUTES (Text/Metadata only - NO file/photo uploads)
    // -------------------------------------------------------------------------
    if ($route === '/inventory' && $method === 'GET') {
        $where = [];
        $params = [];

        $search = trim((string)($_GET['search'] ?? ''));
        if ($search !== '') {
            $where[] = '(i.unique_code LIKE ? OR i.unit_number LIKE ? OR i.title LIKE ? OR i.location LIKE ? OR i.floor_wing LIKE ?)';
            $like = '%' . $search . '%';
            array_push($params, $like, $like, $like, $like, $like);
        }

        if (isset($_GET['tag_id']) && $_GET['tag_id'] !== '') {
            if ($_GET['tag_id'] === 'untagged') {
                $where[] = 'i.tag_id IS NULL';
            } else {
                $where[] = 'i.tag_id = ?';
                $params[] = (int)$_GET['tag_id'];
            }
        }

        $propType = trim((string)($_GET['property_type'] ?? ''));
        if ($propType !== '') {
            $where[] = 'i.property_type = ?';
            $params[] = $propType;
        }

        $sql = 'SELECT i.*, t.name AS tag_name, t.description AS tag_description, t.color AS tag_color
                FROM inventory i
                LEFT JOIN tag_master t ON t.id = i.tag_id';
        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY i.updated_at DESC, i.id DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::success($stmt->fetchAll());
    }

    if ($route === '/inventory' && $method === 'POST') {
        $body = readJsonBody();
        $validated = Validator::validateInventory($body);
        if (!empty($validated['errors'])) {
            Response::error('Validation failed.', 422, $validated['errors']);
        }
        $data = $validated['data'];

        $dup = $pdo->prepare('SELECT id FROM inventory WHERE UPPER(unique_code) = UPPER(?) LIMIT 1');
        $dup->execute([$data['unique_code']]);
        if ($dup->fetch()) {
            Response::error(
                'Unique Code "' . $data['unique_code'] . '" already exists.',
                409,
                ['unique_code' => 'This unique inventory code is already in use.']
            );
        }

        if ($data['tag_id'] !== null) {
            $tagCheck = $pdo->prepare('SELECT id FROM tag_master WHERE id = ? LIMIT 1');
            $tagCheck->execute([$data['tag_id']]);
            if (!$tagCheck->fetch()) {
                Response::error('Selected tag does not exist.', 422, ['tag_id' => 'Invalid tag selected.']);
            }
        }

        $stmt = $pdo->prepare(
            'INSERT INTO inventory (unique_code, unit_number, title, property_type, location, floor_wing, area_sqft, price, tag_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['unique_code'],
            $data['unit_number'],
            $data['title'],
            $data['property_type'],
            $data['location'],
            $data['floor_wing'],
            $data['area_sqft'],
            $data['price'],
            $data['tag_id'],
            $data['notes'],
        ]);
        $newId = (int)$pdo->lastInsertId();

        $fetch = $pdo->prepare(
            'SELECT i.*, t.name AS tag_name, t.description AS tag_description, t.color AS tag_color
             FROM inventory i LEFT JOIN tag_master t ON t.id = i.tag_id WHERE i.id = ?'
        );
        $fetch->execute([$newId]);
        Response::success($fetch->fetch(), 'Inventory item added.', 201);
    }

    if (preg_match('#^/inventory/(\d+)/tag$#', $route, $m) && $method === 'PATCH') {
        $invId = (int)$m[1];
        $body = readJsonBody();
        $tagId = isset($body['tag_id']) && $body['tag_id'] !== '' && $body['tag_id'] !== null
            ? (int)$body['tag_id']
            : null;

        if ($tagId !== null) {
            $tagCheck = $pdo->prepare('SELECT id FROM tag_master WHERE id = ? LIMIT 1');
            $tagCheck->execute([$tagId]);
            if (!$tagCheck->fetch()) {
                Response::error('Selected tag does not exist.', 422);
            }
        }

        $upd = $pdo->prepare('UPDATE inventory SET tag_id = ? WHERE id = ?');
        $upd->execute([$tagId, $invId]);

        $fetch = $pdo->prepare(
            'SELECT i.*, t.name AS tag_name, t.description AS tag_description, t.color AS tag_color
             FROM inventory i LEFT JOIN tag_master t ON t.id = i.tag_id WHERE i.id = ?'
        );
        $fetch->execute([$invId]);
        $item = $fetch->fetch();
        if (!$item) {
            Response::error('Inventory item not found.', 404);
        }
        Response::success($item, 'Inventory tag updated.');
    }

    if (preg_match('#^/inventory/(\d+)$#', $route, $m)) {
        $invId = (int)$m[1];

        if ($method === 'PUT') {
            $body = readJsonBody();
            $validated = Validator::validateInventory($body);
            if (!empty($validated['errors'])) {
                Response::error('Validation failed.', 422, $validated['errors']);
            }
            $data = $validated['data'];

            $exists = $pdo->prepare('SELECT id FROM inventory WHERE id = ? LIMIT 1');
            $exists->execute([$invId]);
            if (!$exists->fetch()) {
                Response::error('Inventory item not found.', 404);
            }

            $dup = $pdo->prepare('SELECT id FROM inventory WHERE UPPER(unique_code) = UPPER(?) AND id <> ? LIMIT 1');
            $dup->execute([$data['unique_code'], $invId]);
            if ($dup->fetch()) {
                Response::error(
                    'Unique Code "' . $data['unique_code'] . '" already exists on another unit.',
                    409,
                    ['unique_code' => 'This unique inventory code is already in use.']
                );
            }

            if ($data['tag_id'] !== null) {
                $tagCheck = $pdo->prepare('SELECT id FROM tag_master WHERE id = ? LIMIT 1');
                $tagCheck->execute([$data['tag_id']]);
                if (!$tagCheck->fetch()) {
                    Response::error('Selected tag does not exist.', 422, ['tag_id' => 'Invalid tag selected.']);
                }
            }

            $stmt = $pdo->prepare(
                'UPDATE inventory
                 SET unique_code = ?, unit_number = ?, title = ?, property_type = ?, location = ?,
                     floor_wing = ?, area_sqft = ?, price = ?, tag_id = ?, notes = ?
                 WHERE id = ?'
            );
            $stmt->execute([
                $data['unique_code'],
                $data['unit_number'],
                $data['title'],
                $data['property_type'],
                $data['location'],
                $data['floor_wing'],
                $data['area_sqft'],
                $data['price'],
                $data['tag_id'],
                $data['notes'],
                $invId,
            ]);

            $fetch = $pdo->prepare(
                'SELECT i.*, t.name AS tag_name, t.description AS tag_description, t.color AS tag_color
                 FROM inventory i LEFT JOIN tag_master t ON t.id = i.tag_id WHERE i.id = ?'
            );
            $fetch->execute([$invId]);
            Response::success($fetch->fetch(), 'Inventory item updated.');
        }

        if ($method === 'DELETE') {
            $stmt = $pdo->prepare('DELETE FROM inventory WHERE id = ?');
            $stmt->execute([$invId]);
            if ($stmt->rowCount() === 0) {
                Response::error('Inventory item not found.', 404);
            }
            Response::success(null, 'Inventory item deleted.');
        }
    }

    // -------------------------------------------------------------------------
    // LEADS & FOLLOW-UPS ROUTES
    // -------------------------------------------------------------------------
    if ($route === '/leads' && $method === 'GET') {
        $where = [];
        $params = [];

        $search = trim((string)($_GET['search'] ?? ''));
        if ($search !== '') {
            $where[] = '(l.full_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ? OR l.preferred_location LIKE ? OR l.property_requirement LIKE ?)';
            $like = '%' . $search . '%';
            array_push($params, $like, $like, $like, $like, $like);
        }

        $status = trim((string)($_GET['status'] ?? ''));
        if ($status !== '') {
            $where[] = 'l.status = ?';
            $params[] = $status;
        }

        if (isset($_GET['is_visited']) && $_GET['is_visited'] !== '') {
            $where[] = 'l.is_visited = ?';
            $params[] = (int)$_GET['is_visited'] ? 1 : 0;
        }

        if (isset($_GET['needs_followup']) && $_GET['needs_followup'] !== '') {
            $where[] = 'l.needs_followup = ?';
            $params[] = (int)$_GET['needs_followup'] ? 1 : 0;
        }

        $scope = trim((string)($_GET['followup_scope'] ?? ''));
        if ($scope === 'overdue') {
            $where[] = "l.needs_followup = 1 AND l.next_followup_at IS NOT NULL AND l.next_followup_at < NOW() AND l.status NOT IN ('Closed Won', 'Closed Lost')";
        } elseif ($scope === 'today') {
            $where[] = "l.needs_followup = 1 AND l.next_followup_at IS NOT NULL AND DATE(l.next_followup_at) = CURDATE() AND l.status NOT IN ('Closed Won', 'Closed Lost')";
        } elseif ($scope === 'due') {
            $where[] = "l.needs_followup = 1 AND l.next_followup_at IS NOT NULL AND DATE(l.next_followup_at) <= CURDATE() AND l.status NOT IN ('Closed Won', 'Closed Lost')";
        } elseif ($scope === 'upcoming') {
            $where[] = "l.needs_followup = 1 AND l.next_followup_at IS NOT NULL AND l.next_followup_at > NOW() AND l.status NOT IN ('Closed Won', 'Closed Lost')";
        }

        if (isset($_GET['budget_min']) && $_GET['budget_min'] !== '' && is_numeric($_GET['budget_min'])) {
            $where[] = '(l.budget_max IS NULL OR l.budget_max >= ?)';
            $params[] = (float)$_GET['budget_min'];
        }
        if (isset($_GET['budget_max']) && $_GET['budget_max'] !== '' && is_numeric($_GET['budget_max'])) {
            $where[] = '(l.budget_min IS NULL OR l.budget_min <= ?)';
            $params[] = (float)$_GET['budget_max'];
        }

        $sql = 'SELECT l.*,
                       i.unique_code AS inv_unique_code,
                       i.unit_number AS inv_unit_number,
                       i.title AS inv_title,
                       t.name AS inv_tag_name,
                       t.color AS inv_tag_color,
                       (SELECT COUNT(*) FROM lead_followups lf WHERE lf.lead_id = l.id) AS followup_count,
                       (SELECT MAX(lf.followup_at) FROM lead_followups lf WHERE lf.lead_id = l.id) AS last_followup_at
                FROM leads l
                LEFT JOIN inventory i ON i.id = l.interested_inventory_id
                LEFT JOIN tag_master t ON t.id = i.tag_id';

        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY l.updated_at DESC, l.id DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::success($stmt->fetchAll());
    }

    if ($route === '/followups/queue' && $method === 'GET') {
        $scope = trim((string)($_GET['scope'] ?? 'all'));
        $where = ["l.needs_followup = 1", "l.status NOT IN ('Closed Won', 'Closed Lost')"];

        if ($scope === 'overdue') {
            $where[] = 'l.next_followup_at IS NOT NULL AND l.next_followup_at < NOW()';
        } elseif ($scope === 'today') {
            $where[] = 'l.next_followup_at IS NOT NULL AND DATE(l.next_followup_at) = CURDATE()';
        } elseif ($scope === 'upcoming') {
            $where[] = 'l.next_followup_at IS NOT NULL AND DATE(l.next_followup_at) > CURDATE()';
        }

        $sql = 'SELECT l.*,
                       i.unique_code AS inv_unique_code,
                       i.unit_number AS inv_unit_number,
                       i.title AS inv_title,
                       (SELECT COUNT(*) FROM lead_followups lf WHERE lf.lead_id = l.id) AS followup_count,
                       (SELECT lf.notes FROM lead_followups lf WHERE lf.lead_id = l.id ORDER BY lf.followup_at DESC, lf.id DESC LIMIT 1) AS last_followup_notes
                FROM leads l
                LEFT JOIN inventory i ON i.id = l.interested_inventory_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY (l.next_followup_at IS NULL) ASC, l.next_followup_at ASC';

        $stmt = $pdo->query($sql);
        Response::success($stmt->fetchAll());
    }

    if ($route === '/leads' && $method === 'POST') {
        $body = readJsonBody();
        $validated = Validator::validateLead($body);
        if (!empty($validated['errors'])) {
            Response::error('Validation failed.', 422, $validated['errors']);
        }
        $data = $validated['data'];

        if ($data['interested_inventory_id'] !== null) {
            $chk = $pdo->prepare('SELECT id FROM inventory WHERE id = ? LIMIT 1');
            $chk->execute([$data['interested_inventory_id']]);
            if (!$chk->fetch()) {
                Response::error('Selected inventory unit does not exist.', 422, ['interested_inventory_id' => 'Invalid inventory selection.']);
            }
        }

        $stmt = $pdo->prepare(
            'INSERT INTO leads (
                full_name, phone, email, source, budget_min, budget_max,
                preferred_location, property_requirement, interested_inventory_id,
                is_visited, visited_at, needs_followup, next_followup_at, status, notes
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['full_name'],
            $data['phone'],
            $data['email'],
            $data['source'],
            $data['budget_min'],
            $data['budget_max'],
            $data['preferred_location'],
            $data['property_requirement'],
            $data['interested_inventory_id'],
            $data['is_visited'],
            $data['visited_at'],
            $data['needs_followup'],
            $data['next_followup_at'],
            $data['status'],
            $data['notes'],
        ]);
        $leadId = (int)$pdo->lastInsertId();

        $fetch = $pdo->prepare(
            'SELECT l.*, i.unique_code AS inv_unique_code, i.unit_number AS inv_unit_number, i.title AS inv_title,
                    0 AS followup_count
             FROM leads l LEFT JOIN inventory i ON i.id = l.interested_inventory_id WHERE l.id = ?'
        );
        $fetch->execute([$leadId]);
        Response::success($fetch->fetch(), 'Lead created.', 201);
    }

    if (preg_match('#^/leads/(\d+)/visit$#', $route, $m) && $method === 'PATCH') {
        $leadId = (int)$m[1];
        $body = readJsonBody();

        $fetch = $pdo->prepare('SELECT id, status, is_visited FROM leads WHERE id = ? LIMIT 1');
        $fetch->execute([$leadId]);
        $lead = $fetch->fetch();
        if (!$lead) {
            Response::error('Lead not found.', 404);
        }

        $isVisited = !empty($body['is_visited']) ? 1 : 0;
        $visitedAt = $isVisited ? (Validator::normalizeDateTime($body['visited_at'] ?? null) ?: date('Y-m-d H:i:s')) : null;
        $newStatus = $lead['status'];
        if ($isVisited && in_array($lead['status'], ['New', 'Contacted'], true)) {
            $newStatus = 'Visited';
        }

        $upd = $pdo->prepare('UPDATE leads SET is_visited = ?, visited_at = ?, status = ? WHERE id = ?');
        $upd->execute([$isVisited, $visitedAt, $newStatus, $leadId]);

        $out = $pdo->prepare(
            'SELECT l.*, i.unique_code AS inv_unique_code, i.unit_number AS inv_unit_number, i.title AS inv_title
             FROM leads l LEFT JOIN inventory i ON i.id = l.interested_inventory_id WHERE l.id = ?'
        );
        $out->execute([$leadId]);
        Response::success($out->fetch(), $isVisited ? 'Lead marked as visited.' : 'Lead marked as not visited.');
    }

    if (preg_match('#^/leads/(\d+)/followups$#', $route, $m)) {
        $leadId = (int)$m[1];

        $leadCheck = $pdo->prepare('SELECT id, status, is_visited, visited_at, next_followup_at FROM leads WHERE id = ? LIMIT 1');
        $leadCheck->execute([$leadId]);
        $lead = $leadCheck->fetch();
        if (!$lead) {
            Response::error('Lead not found.', 404);
        }

        if ($method === 'GET') {
            $stmt = $pdo->prepare(
                'SELECT f.*, u.name AS created_by_name
                 FROM lead_followups f
                 LEFT JOIN users u ON u.id = f.created_by
                 WHERE f.lead_id = ?
                 ORDER BY f.followup_at DESC, f.id DESC'
            );
            $stmt->execute([$leadId]);
            Response::success($stmt->fetchAll());
        }

        if ($method === 'POST') {
            $body = readJsonBody();
            $notes = trim((string)($body['notes'] ?? ''));
            if ($notes === '') {
                Response::error('Follow-up notes are required.', 422, ['notes' => 'Please enter follow-up notes.']);
            }

            $allowedChannels = ['Call', 'WhatsApp', 'Email', 'Site Visit', 'Meeting', 'Other'];
            $channel = trim((string)($body['channel'] ?? 'Call'));
            if (!in_array($channel, $allowedChannels, true)) {
                Response::error('Invalid follow-up channel.', 422, ['channel' => 'Invalid channel.']);
            }

            if (!Validator::isValidDateTimeInput($body['followup_at'] ?? null)) {
                Response::error('Invalid follow-up date/time.', 422, ['followup_at' => 'Invalid date/time format.']);
            }
            if (!Validator::isValidDateTimeInput($body['next_followup_at'] ?? null)) {
                Response::error('Invalid next follow-up date/time.', 422, ['next_followup_at' => 'Invalid date/time format.']);
            }

            $followupAt = Validator::normalizeDateTime($body['followup_at'] ?? null) ?: date('Y-m-d H:i:s');
            $nextFollowupAt = Validator::normalizeDateTime($body['next_followup_at'] ?? null);
            $needsFollowup = array_key_exists('needs_followup', $body)
                ? (!empty($body['needs_followup']) ? 1 : 0)
                : ($nextFollowupAt !== null ? 1 : 0);

            if ($needsFollowup === 1 && $nextFollowupAt === null) {
                Response::error(
                    'Next follow-up date & time is required when "Have to take follow-up" is enabled.',
                    422,
                    ['next_followup_at' => 'Select next follow-up date & time or uncheck follow-up required.']
                );
            }

            $markedVisited = !empty($body['marked_visited']) ? 1 : 0;
            $outcome = Validator::normalizeNullableString($body['outcome'] ?? null);

            $pdo->beginTransaction();
            try {
                $ins = $pdo->prepare(
                    'INSERT INTO lead_followups (lead_id, followup_at, channel, outcome, notes, next_followup_at, marked_visited, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([
                    $leadId,
                    $followupAt,
                    $channel,
                    $outcome,
                    $notes,
                    $nextFollowupAt,
                    $markedVisited,
                    $currentUser['id'],
                ]);
                $followupId = (int)$pdo->lastInsertId();

                $isVisited = $lead['is_visited'] ? 1 : $markedVisited;
                $visitedAt = $lead['visited_at'];
                if ($markedVisited && !$lead['is_visited']) {
                    $visitedAt = $followupAt;
                }

                $newStatus = trim((string)($body['status'] ?? $lead['status']));
                $allowedStatuses = ['New', 'Contacted', 'Visited', 'Negotiation', 'Closed Won', 'Closed Lost'];
                if (!in_array($newStatus, $allowedStatuses, true)) {
                    $newStatus = $lead['status'];
                }
                if ($markedVisited && in_array($newStatus, ['New', 'Contacted'], true)) {
                    $newStatus = 'Visited';
                } elseif ($newStatus === 'New') {
                    $newStatus = 'Contacted';
                }

                $resetReminder = ($nextFollowupAt !== $lead['next_followup_at']) ? null : 'KEEP';
                if ($resetReminder === null) {
                    $upd = $pdo->prepare(
                        'UPDATE leads
                         SET needs_followup = ?, next_followup_at = ?, is_visited = ?, visited_at = ?, status = ?, reminder_sent_for = NULL
                         WHERE id = ?'
                    );
                    $upd->execute([$needsFollowup, $nextFollowupAt, $isVisited, $visitedAt, $newStatus, $leadId]);
                } else {
                    $upd = $pdo->prepare(
                        'UPDATE leads
                         SET needs_followup = ?, next_followup_at = ?, is_visited = ?, visited_at = ?, status = ?
                         WHERE id = ?'
                    );
                    $upd->execute([$needsFollowup, $nextFollowupAt, $isVisited, $visitedAt, $newStatus, $leadId]);
                }

                $pdo->commit();

                $fetch = $pdo->prepare('SELECT f.*, u.name AS created_by_name FROM lead_followups f LEFT JOIN users u ON u.id = f.created_by WHERE f.id = ?');
                $fetch->execute([$followupId]);
                Response::success($fetch->fetch(), 'Follow-up logged.', 201);
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
        }
    }

    if (preg_match('#^/followups/(\d+)$#', $route, $m) && $method === 'DELETE') {
        $followupId = (int)$m[1];
        $stmt = $pdo->prepare('DELETE FROM lead_followups WHERE id = ?');
        $stmt->execute([$followupId]);
        if ($stmt->rowCount() === 0) {
            Response::error('Follow-up not found.', 404);
        }
        Response::success(null, 'Follow-up deleted.');
    }

    if (preg_match('#^/leads/(\d+)$#', $route, $m)) {
        $leadId = (int)$m[1];

        if ($method === 'GET') {
            $stmt = $pdo->prepare(
                'SELECT l.*, i.unique_code AS inv_unique_code, i.unit_number AS inv_unit_number, i.title AS inv_title,
                        t.name AS inv_tag_name, t.color AS inv_tag_color
                 FROM leads l
                 LEFT JOIN inventory i ON i.id = l.interested_inventory_id
                 LEFT JOIN tag_master t ON t.id = i.tag_id
                 WHERE l.id = ? LIMIT 1'
            );
            $stmt->execute([$leadId]);
            $lead = $stmt->fetch();
            if (!$lead) {
                Response::error('Lead not found.', 404);
            }

            $fStmt = $pdo->prepare(
                'SELECT f.*, u.name AS created_by_name
                 FROM lead_followups f
                 LEFT JOIN users u ON u.id = f.created_by
                 WHERE f.lead_id = ?
                 ORDER BY f.followup_at DESC, f.id DESC'
            );
            $fStmt->execute([$leadId]);
            $lead['followups'] = $fStmt->fetchAll();

            Response::success($lead);
        }

        if ($method === 'PUT') {
            $existingStmt = $pdo->prepare('SELECT id, next_followup_at, reminder_sent_for FROM leads WHERE id = ? LIMIT 1');
            $existingStmt->execute([$leadId]);
            $existing = $existingStmt->fetch();
            if (!$existing) {
                Response::error('Lead not found.', 404);
            }

            $body = readJsonBody();
            $validated = Validator::validateLead($body);
            if (!empty($validated['errors'])) {
                Response::error('Validation failed.', 422, $validated['errors']);
            }
            $data = $validated['data'];

            if ($data['interested_inventory_id'] !== null) {
                $chk = $pdo->prepare('SELECT id FROM inventory WHERE id = ? LIMIT 1');
                $chk->execute([$data['interested_inventory_id']]);
                if (!$chk->fetch()) {
                    Response::error('Selected inventory unit does not exist.', 422, ['interested_inventory_id' => 'Invalid inventory selection.']);
                }
            }

            $reminderSentFor = ($data['next_followup_at'] === $existing['next_followup_at'])
                ? $existing['reminder_sent_for']
                : null;

            $stmt = $pdo->prepare(
                'UPDATE leads
                 SET full_name = ?, phone = ?, email = ?, source = ?, budget_min = ?, budget_max = ?,
                     preferred_location = ?, property_requirement = ?, interested_inventory_id = ?,
                     is_visited = ?, visited_at = ?, needs_followup = ?, next_followup_at = ?,
                     status = ?, notes = ?, reminder_sent_for = ?
                 WHERE id = ?'
            );
            $stmt->execute([
                $data['full_name'],
                $data['phone'],
                $data['email'],
                $data['source'],
                $data['budget_min'],
                $data['budget_max'],
                $data['preferred_location'],
                $data['property_requirement'],
                $data['interested_inventory_id'],
                $data['is_visited'],
                $data['visited_at'],
                $data['needs_followup'],
                $data['next_followup_at'],
                $data['status'],
                $data['notes'],
                $reminderSentFor,
                $leadId,
            ]);

            $fetch = $pdo->prepare(
                'SELECT l.*, i.unique_code AS inv_unique_code, i.unit_number AS inv_unit_number, i.title AS inv_title,
                        (SELECT COUNT(*) FROM lead_followups lf WHERE lf.lead_id = l.id) AS followup_count
                 FROM leads l LEFT JOIN inventory i ON i.id = l.interested_inventory_id WHERE l.id = ?'
            );
            $fetch->execute([$leadId]);
            Response::success($fetch->fetch(), 'Lead updated.');
        }

        if ($method === 'DELETE') {
            $stmt = $pdo->prepare('DELETE FROM leads WHERE id = ?');
            $stmt->execute([$leadId]);
            if ($stmt->rowCount() === 0) {
                Response::error('Lead not found.', 404);
            }
            Response::success(null, 'Lead deleted.');
        }
    }

    // -------------------------------------------------------------------------
    // EMAIL SETTINGS & REMINDER TRIGGER ROUTES
    // -------------------------------------------------------------------------
    if ($route === '/settings/email' && $method === 'GET') {
        $row = ReminderService::ensureSettingsRow($pdo);
        $logsStmt = $pdo->query(
            'SELECT rl.*, l.full_name AS lead_name
             FROM reminder_logs rl
             LEFT JOIN leads l ON l.id = rl.lead_id
             ORDER BY rl.sent_at DESC, rl.id DESC
             LIMIT 25'
        );

        Response::success([
            'settings' => [
                'reminders_enabled' => (bool)$row['reminders_enabled'],
                'recipient_email' => $row['recipient_email'],
                'sender_name' => $row['sender_name'],
                'sender_email' => $row['sender_email'],
                'transport' => $row['transport'],
                'smtp_host' => $row['smtp_host'] ?? '',
                'smtp_port' => (int)$row['smtp_port'],
                'smtp_encryption' => $row['smtp_encryption'],
                'smtp_username' => $row['smtp_username'] ?? '',
                'has_smtp_password' => !empty($row['smtp_password_enc']),
                'has_api_key' => !empty($row['api_key_enc']),
                'remind_before_minutes' => (int)$row['remind_before_minutes'],
                'cron_secret' => $row['cron_secret'],
                'last_run_at' => $row['last_run_at'],
                'last_status' => $row['last_status'],
            ],
            'logs' => $logsStmt->fetchAll(),
        ]);
    }

    if ($route === '/settings/email' && $method === 'PUT') {
        $existing = ReminderService::ensureSettingsRow($pdo);
        $body = readJsonBody();
        $errors = [];

        $remindersEnabled = !empty($body['reminders_enabled']) ? 1 : 0;
        $rawRecipients = (string)($body['recipient_email'] ?? '');
        $parsedRecipients = Validator::parseEmailList($rawRecipients);
        $recipientEmails = $parsedRecipients['emails'];
        $recipientEmail = implode(', ', $recipientEmails);
        $senderName = trim((string)($body['sender_name'] ?? 'Property Lead Manager'));
        $senderEmail = trim((string)($body['sender_email'] ?? ''));
        $transport = trim((string)($body['transport'] ?? 'brevo_api'));

        if (!in_array($transport, ['smtp', 'php_mail', 'resend_api', 'brevo_api'], true)) {
            $errors['transport'] = 'Invalid email transport.';
        }
        if (!empty($parsedRecipients['invalid'])) {
            $errors['recipient_email'] = 'Invalid recipient email(s): ' . implode(', ', $parsedRecipients['invalid']);
        } elseif ($remindersEnabled && empty($recipientEmails)) {
            $errors['recipient_email'] = 'At least one valid recipient email is required when reminders are enabled.';
        }
        if ($senderEmail !== '' && !filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) {
            $errors['sender_email'] = 'Enter a valid sender email address.';
        }
        if ($remindersEnabled && $senderEmail === '') {
            $errors['sender_email'] = 'Sender email is required when reminders are enabled.';
        }

        $smtpPort = isset($body['smtp_port']) && is_numeric($body['smtp_port']) ? (int)$body['smtp_port'] : 587;
        if ($smtpPort < 1 || $smtpPort > 65535) {
            $errors['smtp_port'] = 'SMTP port must be between 1 and 65535.';
        }

        $smtpEncryption = trim((string)($body['smtp_encryption'] ?? 'tls'));
        if (!in_array($smtpEncryption, ['tls', 'ssl', 'none'], true)) {
            $errors['smtp_encryption'] = 'Invalid SMTP encryption option.';
        }

        $remindBefore = isset($body['remind_before_minutes']) && is_numeric($body['remind_before_minutes'])
            ? max(0, min(10080, (int)$body['remind_before_minutes']))
            : 60;

        if (!empty($errors)) {
            Response::error('Validation failed.', 422, $errors);
        }

        $smtpPasswordEnc = $existing['smtp_password_enc'];
        if (!empty($body['clear_smtp_password'])) {
            $smtpPasswordEnc = null;
        } elseif (!empty($body['smtp_password'])) {
            $smtpPasswordEnc = Crypto::encrypt((string)$body['smtp_password'], $appSecret);
        }

        $apiKeyEnc = $existing['api_key_enc'];
        $trimmedApiKey = isset($body['api_key']) ? trim((string)$body['api_key']) : '';
        if (!empty($body['clear_api_key'])) {
            $apiKeyEnc = null;
        } elseif ($trimmedApiKey !== '') {
            if ($transport === 'brevo_api' && str_starts_with($trimmedApiKey, 'xsmtpsib-')) {
                Response::error(
                    'You entered a Brevo SMTP key (xsmtpsib-...). Please use a Brevo v3 API key (xkeysib-...) from Brevo -> SMTP & API -> API Keys.',
                    422,
                    ['api_key' => 'Use a Brevo v3 API key starting with xkeysib-.']
                );
            }
            if ($transport === 'brevo_api' && !str_starts_with($trimmedApiKey, 'xkeysib-')) {
                Response::error(
                    'Invalid Brevo API key format. A Brevo v3 API key must start with "xkeysib-".',
                    422,
                    ['api_key' => 'Brevo v3 API key must start with xkeysib-.']
                );
            }
            $apiKeyEnc = Crypto::encrypt($trimmedApiKey, $appSecret);
        }

        $stmt = $pdo->prepare(
            'UPDATE email_settings
             SET reminders_enabled = ?, recipient_email = ?, sender_name = ?, sender_email = ?,
                 transport = ?, smtp_host = ?, smtp_port = ?, smtp_encryption = ?, smtp_username = ?,
                 smtp_password_enc = ?, api_key_enc = ?, remind_before_minutes = ?
             WHERE id = 1'
        );
        $stmt->execute([
            $remindersEnabled,
            $recipientEmail,
            $senderName !== '' ? $senderName : 'Property Lead Manager',
            $senderEmail,
            $transport,
            Validator::normalizeNullableString($body['smtp_host'] ?? null),
            $smtpPort,
            $smtpEncryption,
            Validator::normalizeNullableString($body['smtp_username'] ?? null),
            $smtpPasswordEnc,
            $apiKeyEnc,
            $remindBefore,
        ]);

        Response::success(null, 'Email reminder settings saved.');
    }

    if ($route === '/settings/email/test' && $method === 'POST') {
        $settings = ReminderService::ensureSettingsRow($pdo);
        $body = readJsonBody();
        $rawTo = (string)($body['test_email'] ?? $settings['recipient_email'] ?? '');
        $parsedTo = Validator::parseEmailList($rawTo);

        if (!empty($parsedTo['invalid'])) {
            Response::error('Invalid recipient email(s): ' . implode(', ', $parsedTo['invalid']), 422);
        }
        if (empty($parsedTo['emails'])) {
            Response::error('Please save or provide at least one valid recipient email address first.', 422);
        }
        $recipients = $parsedTo['emails'];
        $recipientSummary = implode(', ', $recipients);

        $subject = 'Test Reminder - Property Lead Manager (' . date('d/m/Y, H:i') . ' IST)';
        $html = '<div style="font-family:Arial,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:8px;">'
            . '<h3 style="margin-top:0;color:#0f172a;">Email Reminders Configured Successfully</h3>'
            . '<p>Your Property Lead Manager email notification setup is working.</p>'
            . '<p style="color:#64748b;font-size:13px;">Server time (Asia/Kolkata): ' . date('d/m/Y, H:i:s') . '</p>'
            . '</div>';
        $text = "Email Reminders Configured Successfully.\nServer time (Asia/Kolkata): " . date('d/m/Y, H:i:s');

        $result = Mailer::send($settings, $recipients, $subject, $html, $text, $appSecret);
        $logStmt = $pdo->prepare(
            'INSERT INTO reminder_logs (lead_id, recipient_email, subject, status, error_message) VALUES (NULL, ?, ?, ?, ?)'
        );
        $logStmt->execute([
            $recipientSummary,
            $subject,
            $result['ok'] ? 'sent' : 'failed',
            $result['error'],
        ]);

        if (!$result['ok']) {
            Response::error('Test email failed: ' . $result['error'], 400);
        }
        Response::success(null, 'Test email sent to ' . $recipientSummary . '.');
    }

    if ($route === '/settings/email/send-due' && $method === 'POST') {
        $result = ReminderService::processDueReminders($pdo, $appSecret, true);
        Response::success($result, $result['message']);
    }

    if ($route === '/settings/email/rotate-cron-secret' && $method === 'POST') {
        ReminderService::ensureSettingsRow($pdo);
        $newSecret = Crypto::randomToken(20);
        $upd = $pdo->prepare('UPDATE email_settings SET cron_secret = ? WHERE id = 1');
        $upd->execute([$newSecret]);
        Response::success(['cron_secret' => $newSecret], 'Cron secret rotated.');
    }

    Response::error('API endpoint not found: ' . $method . ' ' . $route, 404);
} catch (Throwable $e) {
    Response::error('Server error: ' . $e->getMessage(), 500);
}
