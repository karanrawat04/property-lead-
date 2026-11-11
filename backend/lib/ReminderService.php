<?php

class ReminderService
{
    public static function ensureSettingsRow(PDO $pdo): array
    {
        // Upgrade recipient_email column to TEXT on existing databases so multiple emails fit comfortably
        try {
            $col = $pdo->query("SHOW COLUMNS FROM email_settings LIKE 'recipient_email'")->fetch();
            if ($col && stripos((string)($col['Type'] ?? ''), 'varchar(150)') !== false) {
                $pdo->exec('ALTER TABLE email_settings MODIFY recipient_email TEXT NOT NULL');
                $pdo->exec('ALTER TABLE reminder_logs MODIFY recipient_email TEXT NOT NULL');
            }
        } catch (Throwable $e) {
            // Ignore if table lacks ALTER privilege; schema.sql already uses TEXT for fresh installs
        }

        $stmt = $pdo->query('SELECT * FROM email_settings WHERE id = 1 LIMIT 1');
        $row = $stmt->fetch();
        if ($row) {
            return $row;
        }

        $secret = Crypto::randomToken(20);
        $insert = $pdo->prepare(
            "INSERT INTO email_settings (id, reminders_enabled, recipient_email, sender_name, sender_email, transport, remind_before_minutes, cron_secret)
             VALUES (1, 0, '', 'Property Lead Manager', '', 'brevo_api', 60, ?)"
        );
        $insert->execute([$secret]);

        $stmt = $pdo->query('SELECT * FROM email_settings WHERE id = 1 LIMIT 1');
        return $stmt->fetch();
    }

    public static function processDueReminders(PDO $pdo, string $appSecret, bool $forceIgnoreEnabled = false): array
    {
        $settings = self::ensureSettingsRow($pdo);

        if (!$forceIgnoreEnabled && empty($settings['reminders_enabled'])) {
            return [
                'processed' => 0,
                'sent' => 0,
                'failed' => 0,
                'message' => 'Email reminders are currently disabled in settings.',
            ];
        }

        $parsed = Validator::parseEmailList((string)($settings['recipient_email'] ?? ''));
        $recipients = $parsed['emails'];
        if (empty($recipients)) {
            return [
                'processed' => 0,
                'sent' => 0,
                'failed' => 0,
                'message' => 'At least one valid recipient reminder email is required.',
            ];
        }
        $recipientSummary = implode(', ', $recipients);

        $windowMinutes = max(0, (int)($settings['remind_before_minutes'] ?? 60));

        // Find leads requiring follow-up whose next_followup_at is due within window (Asia/Kolkata)
        // and for which we haven't sent a reminder yet for this exact next_followup_at timestamp.
        $sql = "SELECT l.*, i.unique_code AS inv_unique_code, i.unit_number AS inv_unit_number, i.title AS inv_title
                FROM leads l
                LEFT JOIN inventory i ON i.id = l.interested_inventory_id
                WHERE l.needs_followup = 1
                  AND l.next_followup_at IS NOT NULL
                  AND l.status NOT IN ('Closed Won', 'Closed Lost')
                  AND l.next_followup_at <= DATE_ADD(NOW(), INTERVAL ? MINUTE)
                  AND (l.reminder_sent_for IS NULL OR l.reminder_sent_for <> l.next_followup_at)
                ORDER BY l.next_followup_at ASC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$windowMinutes]);
        $dueLeads = $stmt->fetchAll();

        if (empty($dueLeads)) {
            self::updateRunStatus($pdo, 'Checked: No due follow-up reminders.');
            return [
                'processed' => 0,
                'sent' => 0,
                'failed' => 0,
                'message' => 'No pending follow-up reminders due right now.',
            ];
        }

        $sentCount = 0;
        $failedCount = 0;
        $errors = [];

        foreach ($dueLeads as $lead) {
            $followupFormatted = date('d/m/Y, H:i', strtotime($lead['next_followup_at'])) . ' IST';
            $subject = sprintf('Follow-up Reminder: %s (%s)', $lead['full_name'], $followupFormatted);

            $budgetStr = self::formatBudget($lead['budget_min'], $lead['budget_max']);
            $unitStr = $lead['inv_unit_number']
                ? sprintf('%s (%s - %s)', $lead['inv_unit_number'], $lead['inv_unique_code'], $lead['inv_title'])
                : 'Not assigned';
            $visitedStr = !empty($lead['is_visited']) ? 'Yes' : 'No';

            $html = self::buildHtmlEmail($lead, $followupFormatted, $budgetStr, $unitStr, $visitedStr);
            $text = self::buildTextEmail($lead, $followupFormatted, $budgetStr, $unitStr, $visitedStr);

            $result = Mailer::send($settings, $recipients, $subject, $html, $text, $appSecret);

            $logStmt = $pdo->prepare(
                'INSERT INTO reminder_logs (lead_id, recipient_email, subject, status, error_message) VALUES (?, ?, ?, ?, ?)'
            );

            if ($result['ok']) {
                $sentCount++;
                $upd = $pdo->prepare('UPDATE leads SET reminder_sent_for = ? WHERE id = ?');
                $upd->execute([$lead['next_followup_at'], $lead['id']]);
                $logStmt->execute([$lead['id'], $recipientSummary, $subject, 'sent', null]);
            } else {
                $failedCount++;
                $errors[] = $lead['full_name'] . ': ' . $result['error'];
                $logStmt->execute([$lead['id'], $recipientSummary, $subject, 'failed', $result['error']]);
            }
        }

        $summary = sprintf('Processed %d due lead(s): %d sent, %d failed.', count($dueLeads), $sentCount, $failedCount);
        self::updateRunStatus($pdo, $summary);

        return [
            'processed' => count($dueLeads),
            'sent' => $sentCount,
            'failed' => $failedCount,
            'errors' => $errors,
            'message' => $summary,
        ];
    }

    private static function updateRunStatus(PDO $pdo, string $status): void
    {
        $stmt = $pdo->prepare('UPDATE email_settings SET last_run_at = NOW(), last_status = ? WHERE id = 1');
        $stmt->execute([Validator::strSub($status, 0, 250)]);
    }

    private static function formatBudget($min, $max): string
    {
        if ($min === null && $max === null) {
            return 'Not specified';
        }
        $fmt = static fn($v) => 'Rs. ' . number_format((float)$v, 0);
        if ($min !== null && $max !== null) {
            return $fmt($min) . ' - ' . $fmt($max);
        }
        return $min !== null ? ('From ' . $fmt($min)) : ('Up to ' . $fmt($max));
    }

    private static function buildHtmlEmail(array $lead, string $followupFormatted, string $budgetStr, string $unitStr, string $visitedStr): string
    {
        $esc = static fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
        return '
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <div style="background:#0f172a;color:#ffffff;padding:16px 20px;">
            <h2 style="margin:0;font-size:18px;">Lead Follow-Up Reminder</h2>
            <p style="margin:4px 0 0;font-size:13px;color:#cbd5e1;">Scheduled Time: ' . $esc($followupFormatted) . '</p>
          </div>
          <div style="padding:20px;background:#ffffff;color:#1e293b;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#64748b;width:150px;">Lead Name:</td><td style="padding:6px 0;font-weight:600;">' . $esc($lead['full_name']) . '</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Phone:</td><td style="padding:6px 0;">' . $esc($lead['phone']) . '</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Email:</td><td style="padding:6px 0;">' . $esc($lead['email'] ?: '-') . '</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Status:</td><td style="padding:6px 0;">' . $esc($lead['status']) . '</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Visited:</td><td style="padding:6px 0;">' . $esc($visitedStr) . '</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Budget Range:</td><td style="padding:6px 0;">' . $esc($budgetStr) . '</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Interested Unit:</td><td style="padding:6px 0;">' . $esc($unitStr) . '</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;">Notes:</td><td style="padding:6px 0;">' . nl2br($esc($lead['notes'] ?: '-')) . '</td></tr>
            </table>
          </div>
          <div style="background:#f8fafc;padding:12px 20px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;">
            Sent by Property Lead Manager (Timezone: Asia/Kolkata)
          </div>
        </div>';
    }

    private static function buildTextEmail(array $lead, string $followupFormatted, string $budgetStr, string $unitStr, string $visitedStr): string
    {
        return "Lead Follow-Up Reminder\n"
            . "Scheduled: $followupFormatted\n"
            . "Lead: {$lead['full_name']}\n"
            . "Phone: {$lead['phone']}\n"
            . "Email: " . ($lead['email'] ?: '-') . "\n"
            . "Status: {$lead['status']}\n"
            . "Visited: $visitedStr\n"
            . "Budget: $budgetStr\n"
            . "Interested Unit: $unitStr\n"
            . "Notes: " . ($lead['notes'] ?: '-') . "\n";
    }
}
