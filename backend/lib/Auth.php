<?php

class Auth
{
    public static function extractToken(): ?string
    {
        // Prefer X-Auth-Token as InfinityFree Apache sometimes strips Authorization header
        if (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
            return trim($_SERVER['HTTP_X_AUTH_TOKEN']);
        }

        $authHeader = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? '';

        if ($authHeader === '' && function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            foreach ($headers as $k => $v) {
                if (strcasecmp($k, 'X-Auth-Token') === 0 && !empty($v)) {
                    return trim($v);
                }
                if (strcasecmp($k, 'Authorization') === 0 && !empty($v)) {
                    $authHeader = $v;
                }
            }
        }

        if (preg_match('/^Bearer\s+(.+)$/i', trim($authHeader), $matches)) {
            return trim($matches[1]);
        }

        return null;
    }

    public static function createSession(PDO $pdo, int $userId, int $sessionHours = 168): array
    {
        // Clean up expired sessions periodically
        $pdo->exec('DELETE FROM user_sessions WHERE expires_at <= NOW()');

        $plainToken = Crypto::randomToken(32);
        $tokenHash = hash('sha256', $plainToken);
        $expiresAt = (new DateTimeImmutable('now', new DateTimeZone('Asia/Kolkata')))
            ->modify('+' . max(1, $sessionHours) . ' hours')
            ->format('Y-m-d H:i:s');

        $stmt = $pdo->prepare('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)');
        $stmt->execute([$userId, $tokenHash, $expiresAt]);

        return [
            'token' => $plainToken,
            'expires_at' => $expiresAt,
        ];
    }

    public static function authenticate(PDO $pdo): ?array
    {
        $token = self::extractToken();
        if ($token === null || $token === '') {
            return null;
        }

        $tokenHash = hash('sha256', $token);
        $stmt = $pdo->prepare(
            'SELECT u.id, u.name, u.email, u.role, u.is_active, s.expires_at
             FROM user_sessions s
             INNER JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_active = 1
             LIMIT 1'
        );
        $stmt->execute([$tokenHash]);
        $user = $stmt->fetch();

        return $user ?: null;
    }

    public static function requireUser(PDO $pdo): array
    {
        $user = self::authenticate($pdo);
        if ($user === null) {
            Response::error('Unauthorized. Please log in again.', 401);
        }
        return $user;
    }

    public static function revokeCurrentToken(PDO $pdo): void
    {
        $token = self::extractToken();
        if ($token === null || $token === '') {
            return;
        }
        $tokenHash = hash('sha256', $token);
        $stmt = $pdo->prepare('DELETE FROM user_sessions WHERE token_hash = ?');
        $stmt->execute([$tokenHash]);
    }
}

