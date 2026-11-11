<?php

class Crypto
{
    private const CIPHER = 'AES-256-CBC';

    public static function encrypt(string $plaintext, string $secret): string
    {
        if ($plaintext === '') {
            return '';
        }
        $key = hash('sha256', $secret, true);
        $ivLength = openssl_cipher_iv_length(self::CIPHER);
        $iv = random_bytes($ivLength);
        $ciphertext = openssl_encrypt($plaintext, self::CIPHER, $key, OPENSSL_RAW_DATA, $iv);
        if ($ciphertext === false) {
            throw new RuntimeException('Encryption failed');
        }
        return base64_encode($iv . $ciphertext);
    }

    public static function decrypt(?string $encoded, string $secret): string
    {
        if ($encoded === null || $encoded === '') {
            return '';
        }
        $raw = base64_decode($encoded, true);
        if ($raw === false) {
            return '';
        }
        $key = hash('sha256', $secret, true);
        $ivLength = openssl_cipher_iv_length(self::CIPHER);
        if (strlen($raw) <= $ivLength) {
            return '';
        }
        $iv = substr($raw, 0, $ivLength);
        $ciphertext = substr($raw, $ivLength);
        $plaintext = openssl_decrypt($ciphertext, self::CIPHER, $key, OPENSSL_RAW_DATA, $iv);
        return $plaintext === false ? '' : $plaintext;
    }

    public static function randomToken(int $bytes = 32): string
    {
        return bin2hex(random_bytes($bytes));
    }
}

