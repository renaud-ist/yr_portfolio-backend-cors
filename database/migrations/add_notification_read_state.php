<?php

declare(strict_types=1);

return static function (PDO $pdo): void {
    $column = $pdo->query(
        "SELECT COUNT(*)
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'notifications'
           AND column_name = 'read_at'"
    )->fetchColumn();

    if ((int) $column === 0) {
        $pdo->exec('ALTER TABLE notifications ADD COLUMN read_at TIMESTAMP NULL DEFAULT NULL AFTER sent_at');
    }

    $index = $pdo->query(
        "SELECT COUNT(*)
         FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name = 'notifications'
           AND index_name = 'idx_notifications_recipient_read'"
    )->fetchColumn();

    if ((int) $index === 0) {
        $pdo->exec('CREATE INDEX idx_notifications_recipient_read ON notifications (recipient_type, read_at)');
    }
};