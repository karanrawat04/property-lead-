<?php

class Response
{
    public static function sendHeaders(string $corsOrigin = '*'): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Access-Control-Allow-Origin: ' . $corsOrigin);
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');
        header('Access-Control-Max-Age: 86400');
    }

    public static function json(array $data, int $status = 200): void
    {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success($data = null, string $message = 'OK', int $status = 200): void
    {
        $payload = ['success' => true, 'message' => $message];
        if ($data !== null) {
            $payload['data'] = $data;
        }
        self::json($payload, $status);
    }

    public static function error(string $message, int $status = 400, array $errors = []): void
    {
        $payload = [
            'success' => false,
            'message' => $message,
        ];
        if (!empty($errors)) {
            $payload['errors'] = $errors;
        }
        self::json($payload, $status);
    }
}

