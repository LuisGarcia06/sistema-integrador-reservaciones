'use strict';
// Digests fijados tras revisar el DDL y el inventario real del cluster sintetico.
module.exports = Object.freeze({
    MIGRATION_SHA: 'ccf31d500d818196480fbfaff70753f6d74ae99926755e42e54024ea90a6aab8',
    CATALOG_SHA: 'c5ad20f697b128d08f1f6ebcb78e76d50baad8f55f62bad07620119a952a1f6b',
    FILE: 'database/migrations/021_auditoria_recursos_lab.sql',
    ENVIRONMENT: 'audit-schema-lab', PURPOSE: 'audit-schema-tests-only', SCHEMA: '021'
});
