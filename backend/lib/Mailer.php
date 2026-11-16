<?php

/**
 * Zero-dependency Mailer supporting:
 * 1. Brevo HTTP API (recommended on InfinityFree free hosting)
 * 2. Resend HTTP API (recommended on InfinityFree free hosting)
 * 3. Direct SMTP socket client (TLS/SSL/AUTH LOGIN - works on upgraded/VPS/local PHP)
 * 4. PHP mail() fallback
 */
class Mailer
{
    /**
     * @param string|string[] $toEmails
     * @param array $attachments Array of ['name' => string, 'content' => string, 'type' => string, 'is_base64' => bool]
     */
    public static function send(array $settings, $toEmails, string $subject, string $htmlBody, string $textBody, string $appSecret, array $attachments = []): array
    {
        $transport = $settings['transport'] ?? 'brevo_api';
        $senderName = trim((string)($settings['sender_name'] ?? 'Property Lead Manager'));
        $senderEmail = trim((string)($settings['sender_email'] ?? ''));

        $rawList = is_array($toEmails) ? $toEmails : Validator::parseEmailList((string)$toEmails)['emails'];
        $recipients = [];
        foreach ($rawList as $email) {
            $trimmed = trim((string)$email);
            if (!filter_var($trimmed, FILTER_VALIDATE_EMAIL)) {
                return ['ok' => false, 'error' => 'Invalid recipient email address: ' . $trimmed];
            }
            $recipients[] = $trimmed;
        }
        if (empty($recipients)) {
            return ['ok' => false, 'error' => 'At least one valid recipient email address is required.'];
        }

        if ($senderEmail === '' || !filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Valid Sender Email is required in Email Settings.'];
        }

        if ($transport === 'brevo_api') {
            $apiKey = trim(Crypto::decrypt($settings['api_key_enc'] ?? '', $appSecret));
            if ($apiKey === '') {
                return ['ok' => false, 'error' => 'Brevo API Key is not configured.'];
            }
            if (str_starts_with($apiKey, 'xsmtpsib-')) {
                return [
                    'ok' => false,
                    'error' => 'You entered a Brevo SMTP key (xsmtpsib-...). For Brevo HTTP API, create and paste a v3 API key (xkeysib-...) from Brevo -> SMTP & API -> API Keys.',
                ];
            }
            if (!str_starts_with($apiKey, 'xkeysib-')) {
                return [
                    'ok' => false,
                    'error' => sprintf(
                        'Saved Brevo API key looks invalid (length %d, does not start with "xkeysib-"). Paste a valid Brevo v3 API key (xkeysib-...) from Brevo -> SMTP & API -> API Keys and save.',
                        strlen($apiKey)
                    ),
                ];
            }
            return self::sendViaBrevo($apiKey, $senderName, $senderEmail, $recipients, $subject, $htmlBody, $textBody, $attachments);
        }

        if ($transport === 'resend_api') {
            $apiKey = trim(Crypto::decrypt($settings['api_key_enc'] ?? '', $appSecret));
            if ($apiKey === '') {
                return ['ok' => false, 'error' => 'Resend API Key is not configured.'];
            }
            return self::sendViaResend($apiKey, $senderName, $senderEmail, $recipients, $subject, $htmlBody, $textBody, $attachments);
        }

        if ($transport === 'smtp') {
            $smtpPassword = Crypto::decrypt($settings['smtp_password_enc'] ?? '', $appSecret);
            return self::sendViaSmtp(
                (string)($settings['smtp_host'] ?? ''),
                (int)($settings['smtp_port'] ?? 587),
                (string)($settings['smtp_encryption'] ?? 'tls'),
                (string)($settings['smtp_username'] ?? ''),
                $smtpPassword,
                $senderName,
                $senderEmail,
                $recipients,
                $subject,
                $htmlBody,
                $textBody,
                $attachments
            );
        }

        // php_mail fallback
        $boundary = 'plm_mail_' . bin2hex(random_bytes(8));
        $headers = [
            'MIME-Version: 1.0',
            sprintf('From: %s <%s>', self::encodeHeader($senderName), $senderEmail),
        ];

        if (empty($attachments)) {
            $headers[] = 'Content-type: text/html; charset=UTF-8';
            $mailBody = $htmlBody;
        } else {
            $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
            $mailBody = "--$boundary\r\n"
                . "Content-Type: text/html; charset=UTF-8\r\n\r\n"
                . $htmlBody . "\r\n";
            foreach ($attachments as $att) {
                $rawContent = (string)($att['content'] ?? '');
                $name = (string)($att['name'] ?? 'attachment.txt');
                $isBase64 = !empty($att['is_base64']);
                $b64Content = $isBase64 ? $rawContent : base64_encode($rawContent);
                $type = (string)($att['type'] ?? 'application/octet-stream');
                $mailBody .= "--$boundary\r\n"
                    . "Content-Type: {$type}; name=\"" . self::encodeHeader($name) . "\"\r\n"
                    . "Content-Disposition: attachment; filename=\"" . self::encodeHeader($name) . "\"\r\n"
                    . "Content-Transfer-Encoding: base64\r\n\r\n"
                    . chunk_split($b64Content);
            }
            $mailBody .= "--$boundary--";
        }

        $ok = @mail(implode(', ', $recipients), $subject, $mailBody, implode("\r\n", $headers));
        if (!$ok) {
            return ['ok' => false, 'error' => 'PHP mail() returned false (often disabled on free shared hosting).'];
        }
        return ['ok' => true, 'error' => null];
    }

    private static function sendViaBrevo(
        string $apiKey,
        string $senderName,
        string $senderEmail,
        array $recipients,
        string $subject,
        string $htmlBody,
        string $textBody,
        array $attachments = []
    ): array {
        $bodyData = [
            'sender' => ['name' => $senderName, 'email' => $senderEmail],
            'to' => array_map(static fn(string $email) => ['email' => $email], $recipients),
            'subject' => $subject,
            'htmlContent' => $htmlBody,
            'textContent' => $textBody,
        ];

        if (!empty($attachments)) {
            $brevoAttachments = [];
            foreach ($attachments as $att) {
                $rawContent = (string)($att['content'] ?? '');
                $name = (string)($att['name'] ?? 'attachment.txt');
                $isBase64 = !empty($att['is_base64']);
                $brevoAttachments[] = [
                    'name' => $name,
                    'content' => $isBase64 ? $rawContent : base64_encode($rawContent),
                ];
            }
            $bodyData['attachment'] = $brevoAttachments;
        }

        $payload = json_encode($bodyData);

        return self::curlJsonPost(
            'https://api.brevo.com/v3/smtp/email',
            [
                'Accept: application/json',
                'Content-Type: application/json',
                'api-key: ' . $apiKey,
            ],
            $payload
        );
    }

    private static function sendViaResend(
        string $apiKey,
        string $senderName,
        string $senderEmail,
        array $recipients,
        string $subject,
        string $htmlBody,
        string $textBody,
        array $attachments = []
    ): array {
        $bodyData = [
            'from' => sprintf('%s <%s>', $senderName, $senderEmail),
            'to' => array_values($recipients),
            'subject' => $subject,
            'html' => $htmlBody,
            'text' => $textBody,
        ];

        if (!empty($attachments)) {
            $resendAttachments = [];
            foreach ($attachments as $att) {
                $rawContent = (string)($att['content'] ?? '');
                $name = (string)($att['name'] ?? 'attachment.txt');
                $isBase64 = !empty($att['is_base64']);
                $resendAttachments[] = [
                    'filename' => $name,
                    'content' => $isBase64 ? $rawContent : base64_encode($rawContent),
                ];
            }
            $bodyData['attachments'] = $resendAttachments;
        }

        $payload = json_encode($bodyData);

        return self::curlJsonPost(
            'https://api.resend.com/emails',
            [
                'Accept: application/json',
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            $payload
        );
    }

    private static function curlJsonPost(string $url, array $headers, string $jsonPayload): array
    {
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'error' => 'PHP cURL extension is not enabled.'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $jsonPayload,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        $response = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false) {
            return ['ok' => false, 'error' => 'HTTP request failed: ' . $curlError];
        }
        if ($httpCode >= 200 && $httpCode < 300) {
            return ['ok' => true, 'error' => null];
        }
        return ['ok' => false, 'error' => sprintf('Email API error (HTTP %d): %s', $httpCode, $response)];
    }

    private static function sendViaSmtp(
        string $host,
        int $port,
        string $encryption,
        string $username,
        string $password,
        string $senderName,
        string $senderEmail,
        array $recipients,
        string $subject,
        string $htmlBody,
        string $textBody,
        array $attachments = []
    ): array {
        if ($host === '' || $port <= 0) {
            return ['ok' => false, 'error' => 'SMTP host and port are required.'];
        }

        $remote = ($encryption === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $errno = 0;
        $errstr = '';
        $socket = @stream_socket_client($remote, $errno, $errstr, 15);
        if (!$socket) {
            return ['ok' => false, 'error' => "SMTP connection failed ($errno): $errstr"];
        }
        stream_set_timeout($socket, 15);

        try {
            self::expectSmtpCode($socket, [220]);
            self::sendSmtpLine($socket, 'EHLO localhost');
            self::expectSmtpCode($socket, [250]);

            if ($encryption === 'tls') {
                self::sendSmtpLine($socket, 'STARTTLS');
                self::expectSmtpCode($socket, [220]);
                if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new RuntimeException('Failed to enable STARTTLS encryption.');
                }
                self::sendSmtpLine($socket, 'EHLO localhost');
                self::expectSmtpCode($socket, [250]);
            }

            if ($username !== '') {
                self::sendSmtpLine($socket, 'AUTH LOGIN');
                self::expectSmtpCode($socket, [334]);
                self::sendSmtpLine($socket, base64_encode($username));
                self::expectSmtpCode($socket, [334]);
                self::sendSmtpLine($socket, base64_encode($password));
                self::expectSmtpCode($socket, [235]);
            }

            self::sendSmtpLine($socket, 'MAIL FROM:<' . $senderEmail . '>');
            self::expectSmtpCode($socket, [250]);
            foreach ($recipients as $rcpt) {
                self::sendSmtpLine($socket, 'RCPT TO:<' . $rcpt . '>');
                self::expectSmtpCode($socket, [250, 251]);
            }
            self::sendSmtpLine($socket, 'DATA');
            self::expectSmtpCode($socket, [354]);

            $toHeader = implode(', ', array_map(static fn(string $e) => '<' . $e . '>', $recipients));

            if (empty($attachments)) {
                $boundary = 'plm_' . bin2hex(random_bytes(8));
                $headers = [
                    'Date: ' . date('r'),
                    sprintf('From: %s <%s>', self::encodeHeader($senderName), $senderEmail),
                    'To: ' . $toHeader,
                    'Subject: ' . self::encodeHeader($subject),
                    'MIME-Version: 1.0',
                    'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
                ];

                $body = implode("\r\n", $headers) . "\r\n\r\n"
                    . "--$boundary\r\n"
                    . "Content-Type: text/plain; charset=UTF-8\r\n"
                    . "Content-Transfer-Encoding: base64\r\n\r\n"
                    . chunk_split(base64_encode($textBody)) . "\r\n"
                    . "--$boundary\r\n"
                    . "Content-Type: text/html; charset=UTF-8\r\n"
                    . "Content-Transfer-Encoding: base64\r\n\r\n"
                    . chunk_split(base64_encode($htmlBody)) . "\r\n"
                    . "--$boundary--\r\n.";
            } else {
                $mixedBoundary = 'plm_mix_' . bin2hex(random_bytes(8));
                $altBoundary = 'plm_alt_' . bin2hex(random_bytes(8));
                $headers = [
                    'Date: ' . date('r'),
                    sprintf('From: %s <%s>', self::encodeHeader($senderName), $senderEmail),
                    'To: ' . $toHeader,
                    'Subject: ' . self::encodeHeader($subject),
                    'MIME-Version: 1.0',
                    'Content-Type: multipart/mixed; boundary="' . $mixedBoundary . '"',
                ];

                $parts = [];
                // Alternative content (plain text + html)
                $parts[] = "--$mixedBoundary\r\n"
                    . "Content-Type: multipart/alternative; boundary=\"$altBoundary\"\r\n\r\n"
                    . "--$altBoundary\r\n"
                    . "Content-Type: text/plain; charset=UTF-8\r\n"
                    . "Content-Transfer-Encoding: base64\r\n\r\n"
                    . chunk_split(base64_encode($textBody)) . "\r\n"
                    . "--$altBoundary\r\n"
                    . "Content-Type: text/html; charset=UTF-8\r\n"
                    . "Content-Transfer-Encoding: base64\r\n\r\n"
                    . chunk_split(base64_encode($htmlBody)) . "\r\n"
                    . "--$altBoundary--";

                // Attachment parts
                foreach ($attachments as $att) {
                    $rawContent = (string)($att['content'] ?? '');
                    $name = (string)($att['name'] ?? 'attachment.txt');
                    $isBase64 = !empty($att['is_base64']);
                    $b64Content = $isBase64 ? $rawContent : base64_encode($rawContent);
                    $type = (string)($att['type'] ?? 'application/octet-stream');

                    $parts[] = "--$mixedBoundary\r\n"
                        . "Content-Type: {$type}; name=\"" . self::encodeHeader($name) . "\"\r\n"
                        . "Content-Disposition: attachment; filename=\"" . self::encodeHeader($name) . "\"\r\n"
                        . "Content-Transfer-Encoding: base64\r\n\r\n"
                        . chunk_split($b64Content);
                }

                $body = implode("\r\n", $headers) . "\r\n\r\n"
                    . implode("\r\n", $parts) . "\r\n"
                    . "--$mixedBoundary--\r\n.";
            }

            fwrite($socket, $body . "\r\n");
            self::expectSmtpCode($socket, [250]);
            self::sendSmtpLine($socket, 'QUIT');
            fclose($socket);
            return ['ok' => true, 'error' => null];
        } catch (Throwable $e) {
            if (is_resource($socket)) {
                fclose($socket);
            }
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    private static function sendSmtpLine($socket, string $line): void
    {
        fwrite($socket, $line . "\r\n");
    }

    private static function expectSmtpCode($socket, array $expectedCodes): void
    {
        $response = '';
        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        $code = (int)substr($response, 0, 3);
        if (!in_array($code, $expectedCodes, true)) {
            throw new RuntimeException('SMTP error: ' . trim($response));
        }
    }

    private static function encodeHeader(string $value): string
    {
        if (preg_match('/[^\x20-\x7E]/', $value)) {
            return '=?UTF-8?B?' . base64_encode($value) . '?=';
        }
        return $value;
    }
}

