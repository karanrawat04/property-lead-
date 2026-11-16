<?php

class Validator
{
    public static function strLen(string $value): int
    {
        return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    }

    public static function strSub(string $value, int $start, int $length): string
    {
        return function_exists('mb_substr') ? mb_substr($value, $start, $length, 'UTF-8') : substr($value, $start, $length);
    }

    /**
     * Parses comma, semicolon, or newline separated email addresses into deduplicated valid & invalid lists.
     */
    public static function parseEmailList(string $raw): array
    {
        $parts = preg_split('/[\s,;]+/', trim($raw), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $emails = [];
        $seen = [];
        $invalid = [];

        foreach ($parts as $part) {
            $email = trim($part);
            if ($email === '') {
                continue;
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $invalid[] = $email;
                continue;
            }
            $lower = strtolower($email);
            if (!isset($seen[$lower])) {
                $seen[$lower] = true;
                $emails[] = $email;
            }
        }

        return ['emails' => $emails, 'invalid' => $invalid];
    }

    public static function normalizeNullableString($value): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim((string)$value);
        return $trimmed === '' ? null : $trimmed;
    }

    public static function normalizeNullableFloat($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_numeric($value)) {
            return null;
        }
        return (float)$value;
    }

    public static function normalizeDateTime($value): ?string
    {
        if ($value === null) {
            return null;
        }
        $str = trim((string)$value);
        if ($str === '') {
            return null;
        }
        // Handle HTML datetime-local 'YYYY-MM-DDTHH:MM' or 'DD/MM/YYYY, HH:MM'
        $str = str_replace('T', ' ', $str);
        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $str)) {
            $str .= ':00';
        }
        $tz = new DateTimeZone('Asia/Kolkata');
        foreach (['Y-m-d H:i:s', 'd/m/Y, H:i:s', 'd/m/Y, H:i', 'd/m/Y H:i:s', 'd/m/Y H:i'] as $fmt) {
            $dt = DateTimeImmutable::createFromFormat('!' . $fmt, $str, $tz);
            if ($dt !== false) {
                $errors = DateTimeImmutable::getLastErrors();
                if ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0)) {
                    return $dt->format('Y-m-d H:i:s');
                }
            }
        }
        return null;
    }

    public static function normalizeDate($value): ?string
    {
        if ($value === null) {
            return null;
        }
        $str = trim((string)$value);
        if ($str === '') {
            return null;
        }
        $tz = new DateTimeZone('Asia/Kolkata');
        foreach (['Y-m-d', 'd/m/Y', 'd-m-Y'] as $fmt) {
            $dt = DateTimeImmutable::createFromFormat('!' . $fmt, $str, $tz);
            if ($dt !== false) {
                $errors = DateTimeImmutable::getLastErrors();
                if ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0)) {
                    return $dt->format('Y-m-d');
                }
            }
        }
        return null;
    }

    public static function isValidDateTimeInput($value): bool
    {
        if ($value === null || trim((string)$value) === '') {
            return true;
        }
        return self::normalizeDateTime($value) !== null;
    }

    public static function validateLead(array $input): array
    {
        $errors = [];

        $fullName = trim((string)($input['full_name'] ?? ''));
        if ($fullName === '' || self::strLen($fullName) < 2) {
            $errors['full_name'] = 'Full name is required (minimum 2 characters).';
        } elseif (self::strLen($fullName) > 120) {
            $errors['full_name'] = 'Full name cannot exceed 120 characters.';
        }

        $phone = trim((string)($input['phone'] ?? ''));
        if ($phone === '') {
            $errors['phone'] = 'Phone number is required.';
        } elseif (!preg_match('/^[0-9+\-\s()]{7,20}$/', $phone)) {
            $errors['phone'] = 'Enter a valid phone number (7 to 20 digits/characters).';
        }

        $email = self::normalizeNullableString($input['email'] ?? null);
        if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Enter a valid email address.';
        }

        $budgetMinRaw = $input['budget_min'] ?? null;
        $budgetMaxRaw = $input['budget_max'] ?? null;
        $budgetMin = null;
        $budgetMax = null;

        if ($budgetMinRaw !== null && $budgetMinRaw !== '') {
            if (!is_numeric($budgetMinRaw) || (float)$budgetMinRaw < 0) {
                $errors['budget_min'] = 'Minimum budget must be a non-negative number.';
            } else {
                $budgetMin = round((float)$budgetMinRaw, 2);
            }
        }

        if ($budgetMaxRaw !== null && $budgetMaxRaw !== '') {
            if (!is_numeric($budgetMaxRaw) || (float)$budgetMaxRaw < 0) {
                $errors['budget_max'] = 'Maximum budget must be a non-negative number.';
            } else {
                $budgetMax = round((float)$budgetMaxRaw, 2);
            }
        }

        if ($budgetMin !== null && $budgetMax !== null && $budgetMax < $budgetMin) {
            $errors['budget_max'] = 'Maximum budget must be greater than or equal to minimum budget.';
        }

        $allowedStatuses = ['New', 'Contacted', 'Visited', 'Negotiation', 'Closed Won', 'Closed Lost'];
        $status = trim((string)($input['status'] ?? 'New'));
        if (!in_array($status, $allowedStatuses, true)) {
            $errors['status'] = 'Invalid lead status.';
        }

        $allowedTemperatures = ['Hot', 'Warm', 'Cold'];
        $temperature = trim((string)($input['temperature'] ?? 'Warm'));
        if (!in_array($temperature, $allowedTemperatures, true)) {
            $temperature = 'Warm';
        }

        if (!self::isValidDateTimeInput($input['visited_at'] ?? null)) {
            $errors['visited_at'] = 'Invalid visited date/time format.';
        }
        if (!self::isValidDateTimeInput($input['next_followup_at'] ?? null)) {
            $errors['next_followup_at'] = 'Invalid next follow-up date/time format.';
        }

        $needsFollowup = !empty($input['needs_followup']) ? 1 : 0;
        $nextFollowupAt = self::normalizeDateTime($input['next_followup_at'] ?? null);
        if ($needsFollowup === 1 && $nextFollowupAt === null) {
            $errors['next_followup_at'] = 'Next follow-up date & time is required when follow-up is enabled.';
        }

        $isVisited = !empty($input['is_visited']) ? 1 : 0;
        $visitedAt = self::normalizeDateTime($input['visited_at'] ?? null);
        if ($isVisited === 1 && $visitedAt === null) {
            $visitedAt = date('Y-m-d H:i:s');
        }
        if ($isVisited === 0) {
            $visitedAt = null;
        }

        $invId = $input['interested_inventory_id'] ?? null;
        $inventoryId = ($invId !== null && $invId !== '' && is_numeric($invId) && (int)$invId > 0)
            ? (int)$invId
            : null;

        $agentIdRaw = $input['assigned_agent_id'] ?? null;
        $assignedAgentId = ($agentIdRaw !== null && $agentIdRaw !== '' && is_numeric($agentIdRaw) && (int)$agentIdRaw > 0)
            ? (int)$agentIdRaw
            : null;

        return [
            'errors' => $errors,
            'data' => [
                'full_name' => $fullName,
                'phone' => $phone,
                'email' => $email,
                'source' => self::normalizeNullableString($input['source'] ?? null),
                'budget_min' => $budgetMin,
                'budget_max' => $budgetMax,
                'preferred_location' => self::normalizeNullableString($input['preferred_location'] ?? null),
                'property_requirement' => self::normalizeNullableString($input['property_requirement'] ?? null),
                'interested_inventory_id' => $inventoryId,
                'assigned_agent_id' => $assignedAgentId,
                'is_visited' => $isVisited,
                'visited_at' => $visitedAt,
                'needs_followup' => $needsFollowup,
                'next_followup_at' => $nextFollowupAt,
                'status' => $status,
                'temperature' => $temperature,
                'notes' => self::normalizeNullableString($input['notes'] ?? null),
            ],
        ];
    }

    public static function validateAgent(array $input, bool $isNew = true): array
    {
        $errors = [];

        $name = trim((string)($input['name'] ?? ''));
        if ($name === '' || self::strLen($name) < 2) {
            $errors['name'] = 'Full name is required (minimum 2 characters).';
        } elseif (self::strLen($name) > 100) {
            $errors['name'] = 'Full name cannot exceed 100 characters.';
        }

        $email = strtolower(trim((string)($input['email'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'A valid email address is required.';
        }

        $password = (string)($input['password'] ?? '');
        if ($isNew && strlen($password) < 6) {
            $errors['password'] = 'Password is required and must be at least 6 characters.';
        } elseif (!$isNew && $password !== '' && strlen($password) < 6) {
            $errors['password'] = 'New password must be at least 6 characters.';
        }

        $mobile = self::normalizeNullableString($input['mobile_number'] ?? null);
        if ($mobile !== null && !preg_match('/^[0-9+\-\s()]{7,20}$/', $mobile)) {
            $errors['mobile_number'] = 'Enter a valid mobile number (7 to 20 digits).';
        }

        $altMobile = self::normalizeNullableString($input['alt_number'] ?? null);
        if ($altMobile !== null && !preg_match('/^[0-9+\-\s()]{7,20}$/', $altMobile)) {
            $errors['alt_number'] = 'Enter a valid alternate number (7 to 20 digits).';
        }

        $dateOfJoining = self::normalizeDate($input['date_of_joining'] ?? null);
        if (!empty($input['date_of_joining']) && $dateOfJoining === null) {
            $errors['date_of_joining'] = 'Invalid date of joining (use DD/MM/YYYY or YYYY-MM-DD).';
        }

        $isActive = isset($input['is_active']) ? (!empty($input['is_active']) ? 1 : 0) : 1;

        return [
            'errors' => $errors,
            'data' => [
                'name' => $name,
                'email' => $email,
                'password' => $password,
                'mobile_number' => $mobile,
                'alt_number' => $altMobile,
                'address' => self::normalizeNullableString($input['address'] ?? null),
                'date_of_joining' => $dateOfJoining,
                'avatar_url' => self::normalizeNullableString($input['avatar_url'] ?? null),
                'is_active' => $isActive,
            ],
        ];
    }

    public static function validateInventory(array $input): array
    {
        $errors = [];

        $uniqueCode = strtoupper(trim((string)($input['unique_code'] ?? '')));
        if ($uniqueCode === '' || self::strLen($uniqueCode) < 2) {
            $errors['unique_code'] = 'Unique Inventory Code is required (e.g. INV-410C or T1-410C).';
        } elseif (self::strLen($uniqueCode) > 60) {
            $errors['unique_code'] = 'Unique Inventory Code cannot exceed 60 characters.';
        } elseif (!preg_match('/^[A-Za-z0-9\-_\/\s]+$/', $uniqueCode)) {
            $errors['unique_code'] = 'Unique code may only contain letters, numbers, spaces, -, _, or /.';
        }

        $unitNumber = trim((string)($input['unit_number'] ?? ''));
        if ($unitNumber === '') {
            $errors['unit_number'] = 'Unit Number is required (e.g. 410 C, 322 B).';
        } elseif (self::strLen($unitNumber) > 60) {
            $errors['unit_number'] = 'Unit Number cannot exceed 60 characters.';
        }

        $title = trim((string)($input['title'] ?? ''));
        if ($title === '' || self::strLen($title) < 2) {
            $errors['title'] = 'Property / Project title is required.';
        } elseif (self::strLen($title) > 150) {
            $errors['title'] = 'Title cannot exceed 150 characters.';
        }

        $propertyType = trim((string)($input['property_type'] ?? 'Apartment'));
        if ($propertyType === '') {
            $propertyType = 'Apartment';
        }

        $areaRaw = $input['area_sqft'] ?? null;
        $areaSqft = null;
        if ($areaRaw !== null && $areaRaw !== '') {
            if (!is_numeric($areaRaw) || (float)$areaRaw < 0) {
                $errors['area_sqft'] = 'Area must be a non-negative number.';
            } else {
                $areaSqft = round((float)$areaRaw, 2);
            }
        }

        $priceRaw = $input['price'] ?? null;
        $price = null;
        if ($priceRaw !== null && $priceRaw !== '') {
            if (!is_numeric($priceRaw) || (float)$priceRaw < 0) {
                $errors['price'] = 'Price must be a non-negative number.';
            } else {
                $price = round((float)$priceRaw, 2);
            }
        }

        return [
            'errors' => $errors,
            'data' => [
                'unique_code' => $uniqueCode,
                'unit_number' => $unitNumber,
                'title' => $title,
                'property_type' => $propertyType,
                'location' => self::normalizeNullableString($input['location'] ?? null),
                'floor_wing' => self::normalizeNullableString($input['floor_wing'] ?? null),
                'area_sqft' => $areaSqft,
                'price' => $price,
                'notes' => self::normalizeNullableString($input['notes'] ?? null),
            ],
        ];
    }
}
