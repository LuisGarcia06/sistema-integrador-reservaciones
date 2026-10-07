const fs = require('node:fs');
const path = require('node:path');
const {
    construirDatosEquivalenciaTourExterno,
    resolverEquivalenciaTourExternoConDb,
} = require('../services/equivalenciasToursExternos.service');
const { normalizarTextoEquivalenciaExterna } = require('../utils/normalizarTextoEquivalenciaExterna');

function crearDbFake(equivalencias = []) {
    return {
        query: jest.fn(async (query, values = []) => {
            if (!/FROM equivalencias_tours_externos/i.test(query)) {
                throw new Error(`Query no soportado: ${query}`);
            }

            const [provider, activityTitleNormalizado, optionTitleNormalizado] = values;
            const rows = equivalencias.filter((equivalencia) => (
                String(equivalencia.provider).trim().toLowerCase() === String(provider).trim().toLowerCase()
                && equivalencia.activity_title_normalizado === activityTitleNormalizado
                && equivalencia.option_title_normalizado === optionTitleNormalizado
                && equivalencia.activo === true
            ));

            return { rows };
        }),
    };
}

describe('normalizarTextoEquivalenciaExterna', () => {
    test('normaliza de forma determinista texto externo', () => {
        expect(normalizarTextoEquivalenciaExterna('  Riviera   Maya: Tour -- Sian Kaan!!!  '))
            .toBe('riviera maya tour sian kaan');
    });

    test('Ka\'an y Kaan quedan equivalentes por normalizacion determinista', () => {
        expect(normalizarTextoEquivalenciaExterna("Sian Ka'an"))
            .toBe(normalizarTextoEquivalenciaExterna('Sian Kaan'));
    });

    test('quita acentos', () => {
        expect(normalizarTextoEquivalenciaExterna('Tulum: tour al mediodía'))
            .toBe('tulum tour al mediodia');
    });

    test('convierte puntuacion y separadores a espacios', () => {
        expect(normalizarTextoEquivalenciaExterna('A/B+C_reserva.maya'))
            .toBe('a b c reserva maya');
    });

    test('colapsa espacios multiples', () => {
        expect(normalizarTextoEquivalenciaExterna('Riviera     Maya\n\tSian   Kaan'))
            .toBe('riviera maya sian kaan');
    });
});

describe('equivalenciasToursExternos.service', () => {
    const equivalenciaBase = construirDatosEquivalenciaTourExterno({
        provider: 'getyourguide',
        activityTitle: 'Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Kaan',
        optionTitle: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
        idTour: 74,
        turno: 'Tarde',
    });

    test('equivalencia activa devuelve id_tour y turno', async () => {
        const db = crearDbFake([{
            id_equivalencia_tour_externo: 1,
            ...equivalenciaBase,
        }]);

        const resultado = await resolverEquivalenciaTourExternoConDb(db, {
            provider: 'getyourguide',
            activityTitle: "Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Ka'an",
            optionTitle: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
        });

        expect(resultado).toEqual(expect.objectContaining({
            id_tour: 74,
            turno: 'Tarde',
        }));
    });

    test('sin equivalencia devuelve null', async () => {
        const db = crearDbFake([]);

        await expect(resolverEquivalenciaTourExternoConDb(db, {
            provider: 'getyourguide',
            activityTitle: equivalenciaBase.activity_title,
            optionTitle: equivalenciaBase.option_title,
        })).resolves.toBeNull();
    });

    test('equivalencia inactiva no aplica', async () => {
        const db = crearDbFake([{ ...equivalenciaBase, activo: false }]);

        await expect(resolverEquivalenciaTourExternoConDb(db, {
            provider: 'getyourguide',
            activityTitle: equivalenciaBase.activity_title,
            optionTitle: equivalenciaBase.option_title,
        })).resolves.toBeNull();
    });

    test('provider diferente no aplica', async () => {
        const db = crearDbFake([{ ...equivalenciaBase, id_equivalencia_tour_externo: 1 }]);

        await expect(resolverEquivalenciaTourExternoConDb(db, {
            provider: 'fareharbor',
            activityTitle: equivalenciaBase.activity_title,
            optionTitle: equivalenciaBase.option_title,
        })).resolves.toBeNull();
    });

    test('texto realmente diferente no hace fuzzy match', async () => {
        const db = crearDbFake([{ ...equivalenciaBase, id_equivalencia_tour_externo: 1 }]);

        await expect(resolverEquivalenciaTourExternoConDb(db, {
            provider: 'getyourguide',
            activityTitle: 'Riviera Maya tour diferente',
            optionTitle: equivalenciaBase.option_title,
        })).resolves.toBeNull();
    });

    test('datos ambiguos no se asignan automaticamente', async () => {
        const db = crearDbFake([
            { ...equivalenciaBase, id_equivalencia_tour_externo: 1 },
            { ...equivalenciaBase, id_equivalencia_tour_externo: 2 },
        ]);

        await expect(resolverEquivalenciaTourExternoConDb(db, {
            provider: 'getyourguide',
            activityTitle: equivalenciaBase.activity_title,
            optionTitle: equivalenciaBase.option_title,
        })).resolves.toBeNull();
    });

    test('la migracion declara FK y unique parcial para impedir duplicado activo', () => {
        const migrationPath = path.join(__dirname, '..', '..', 'database', 'migrations', '014_equivalencias_tours_externos.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toMatch(/FOREIGN KEY \(id_tour\)\s+REFERENCES tours\(id_tour\)/i);
        expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_equivalencias_tours_externos_activa/i);
        expect(sql).toMatch(/WHERE activo = TRUE/i);
    });
});