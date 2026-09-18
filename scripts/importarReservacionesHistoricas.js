const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
let pool = null;

const CAMPOS_PERMITIDOS = [
    'codigo',
    'fecha',
    'tour',
    'pais',
    'plataforma',
    'nombre_cliente',
    'telefono_cliente',
    'habitacion',
    'pax',
    'ninos',
    'pickup_place',
    'pickup_time',
    'turno',
    'precio_total',
    'deposito',
    'saldo',
    'tipo_cambio',
    'metodo_pago',
    'vendedor',
    'observaciones',
    'estado'
];

const ESTADOS_HISTORICOS = ['Completada', 'Cancelada'];
const TURNOS_VALIDOS = ['Mañana', 'Tarde'];
const NUMERIC_10_2_MAX = 99999999.99;

const LIMITES_TEXTO = {
    codigo: 30,
    tour: 150,
    pais: 150,
    plataforma: 50,
    nombre_cliente: 120,
    telefono_cliente: 30,
    habitacion: 50,
    pickup_place: 120,
    metodo_pago: 50,
    vendedor: 120,
    estado: 30
};

const mostrarUso = () => {
    console.error('Uso:');
    console.error('  node scripts/importarReservacionesHistoricas.js --file "C:\\ruta\\reservaciones.json" --dry-run');
    console.error('  node scripts/importarReservacionesHistoricas.js --file "C:\\ruta\\reservaciones.json" --execute');
};

const obtenerPool = () => {
    if (!pool) {
        process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';
        pool = require('../backend/config/database');
    }

    return pool;
};

const esSubruta = (ruta, raiz) => {
    const relativa = path.relative(raiz, ruta);

    return relativa === '' || (!relativa.startsWith('..') && !path.isAbsolute(relativa));
};

const parsearArgumentos = (argv) => {
    const args = argv.slice(2);
    const opciones = {
        file: null,
        dryRun: false,
        execute: false
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === '--file') {
            if (opciones.file || index + 1 >= args.length) {
                return { error: 'El argumento --file requiere una ruta y solo puede enviarse una vez.' };
            }

            opciones.file = args[index + 1];
            index += 1;
            continue;
        }

        if (arg === '--dry-run') {
            opciones.dryRun = true;
            continue;
        }

        if (arg === '--execute') {
            opciones.execute = true;
            continue;
        }

        return { error: `Argumento no reconocido: ${arg}` };
    }

    if (!opciones.file) {
        return { error: 'El argumento --file es obligatorio.' };
    }

    if (opciones.dryRun === opciones.execute) {
        return { error: 'Debe indicar exactamente uno entre --dry-run y --execute.' };
    }

    const filePath = path.resolve(opciones.file);

    if (esSubruta(filePath, REPO_ROOT)) {
        return { error: 'El JSON de importación debe estar fuera del repositorio.' };
    }

    return {
        opciones: {
            ...opciones,
            filePath
        }
    };
};

const leerJson = (filePath) => {
    let contenido;

    try {
        contenido = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        return { error: `No se pudo leer el archivo JSON: ${error.message}` };
    }

    try {
        return { datos: JSON.parse(contenido) };
    } catch (error) {
        return { error: `JSON inválido: ${error.message}` };
    }
};

const esObjetoPlano = (valor) => (
    valor !== null &&
    typeof valor === 'object' &&
    !Array.isArray(valor)
);

const esTextoNoVacio = (valor) => (
    typeof valor === 'string' &&
    valor.trim() !== ''
);

const obtenerTextoRequerido = (fila, campo, errores) => {
    const valor = fila[campo];

    if (!esTextoNoVacio(valor)) {
        errores.push(`El campo ${campo} es obligatorio y debe ser texto no vacío.`);
        return null;
    }

    const texto = valor.trim();
    const maximo = LIMITES_TEXTO[campo];

    if (maximo && texto.length > maximo) {
        errores.push(`El campo ${campo} no debe exceder ${maximo} caracteres.`);
    }

    return texto;
};

const obtenerTextoOpcional = (fila, campo, errores) => {
    const valor = fila[campo];

    if (valor === undefined || valor === null || valor === '') {
        return null;
    }

    if (typeof valor !== 'string') {
        errores.push(`El campo ${campo} debe ser texto o null.`);
        return null;
    }

    const texto = valor.trim();

    if (texto === '') {
        return null;
    }

    const maximo = LIMITES_TEXTO[campo];

    if (maximo && texto.length > maximo) {
        errores.push(`El campo ${campo} no debe exceder ${maximo} caracteres.`);
    }

    return texto;
};

const esFechaValida = (valor) => {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return false;
    }

    const fecha = new Date(`${valor}T00:00:00.000Z`);

    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
};

const obtenerFecha = (fila, errores) => {
    const fecha = obtenerTextoRequerido(fila, 'fecha', errores);

    if (fecha && !esFechaValida(fecha)) {
        errores.push('El campo fecha debe tener formato YYYY-MM-DD y ser una fecha válida.');
    }

    return fecha;
};

const obtenerHora = (fila, errores) => {
    const hora = obtenerTextoRequerido(fila, 'pickup_time', errores);

    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
        errores.push('El campo pickup_time debe tener formato HH:MM válido.');
    }

    return hora;
};

const obtenerEntero = (fila, campo, errores, { positivo }) => {
    const valor = fila[campo];
    const numero = Number(valor);

    if (!Number.isInteger(numero) || (positivo ? numero <= 0 : numero < 0)) {
        errores.push(
            positivo
                ? `El campo ${campo} debe ser un entero positivo.`
                : `El campo ${campo} debe ser un entero mayor o igual a 0.`
        );
        return null;
    }

    return numero;
};

const contarDecimales = (valor) => {
    const texto = String(valor);
    const partes = texto.split('.');

    return partes.length === 2 ? partes[1].length : 0;
};

const obtenerNumero = (fila, campo, errores, { requerido }) => {
    const valor = fila[campo];

    if (valor === undefined || valor === null || valor === '') {
        if (requerido) {
            errores.push(`El campo ${campo} es obligatorio y debe ser numérico.`);
        }

        return null;
    }

    if (typeof valor !== 'number' && typeof valor !== 'string') {
        errores.push(`El campo ${campo} debe ser numérico válido.`);
        return null;
    }

    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
        errores.push(`El campo ${campo} debe ser numérico válido.`);
        return null;
    }

    if (Math.abs(numero) > NUMERIC_10_2_MAX || contarDecimales(valor) > 2) {
        errores.push(`El campo ${campo} debe ser compatible con NUMERIC(10,2).`);
    }

    return numero;
};

const obtenerTurno = (fila, errores) => {
    const turno = obtenerTextoRequerido(fila, 'turno', errores);

    if (turno && !TURNOS_VALIDOS.includes(turno)) {
        errores.push('El campo turno debe ser Mañana o Tarde.');
    }

    return turno;
};

const obtenerEstado = (fila, errores) => {
    const estado = obtenerTextoRequerido(fila, 'estado', errores);

    if (estado && !ESTADOS_HISTORICOS.includes(estado)) {
        errores.push('El campo estado debe ser Completada o Cancelada.');
    }

    return estado;
};

const crearErrorFila = (index, codigo, mensaje) => ({
    index,
    fila: index + 1,
    codigo: codigo || null,
    mensaje
});

const formatearReferenciaFila = (error) => (
    `fila ${error.fila}${error.codigo ? ` codigo ${error.codigo}` : ''}`
);

const validarFila = (fila, index) => {
    const errores = [];

    if (!esObjetoPlano(fila)) {
        return {
            reservacion: null,
            errores: [crearErrorFila(index, null, 'La fila debe ser un objeto JSON.')]
        };
    }

    Object.keys(fila).forEach((campo) => {
        if (!CAMPOS_PERMITIDOS.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido.`);
        }
    });

    const reservacion = {
        _indiceOriginal: index,
        codigo: obtenerTextoRequerido(fila, 'codigo', errores),
        fecha: obtenerFecha(fila, errores),
        tour: obtenerTextoRequerido(fila, 'tour', errores),
        pais: obtenerTextoRequerido(fila, 'pais', errores),
        plataforma: obtenerTextoRequerido(fila, 'plataforma', errores),
        nombre_cliente: obtenerTextoRequerido(fila, 'nombre_cliente', errores),
        telefono_cliente: obtenerTextoOpcional(fila, 'telefono_cliente', errores),
        habitacion: obtenerTextoOpcional(fila, 'habitacion', errores),
        pax: obtenerEntero(fila, 'pax', errores, { positivo: true }),
        ninos: obtenerEntero(fila, 'ninos', errores, { positivo: false }),
        pickup_place: obtenerTextoRequerido(fila, 'pickup_place', errores),
        pickup_time: obtenerHora(fila, errores),
        turno: obtenerTurno(fila, errores),
        precio_total: obtenerNumero(fila, 'precio_total', errores, { requerido: true }),
        deposito: obtenerNumero(fila, 'deposito', errores, { requerido: false }),
        saldo: obtenerNumero(fila, 'saldo', errores, { requerido: false }),
        tipo_cambio: obtenerNumero(fila, 'tipo_cambio', errores, { requerido: false }),
        metodo_pago: obtenerTextoOpcional(fila, 'metodo_pago', errores),
        vendedor: obtenerTextoOpcional(fila, 'vendedor', errores),
        observaciones: obtenerTextoOpcional(fila, 'observaciones', errores),
        estado: obtenerEstado(fila, errores)
    };

    if (reservacion.ninos !== null && reservacion.pax !== null && reservacion.ninos > reservacion.pax) {
        errores.push('El campo ninos no puede ser mayor que pax.');
    }

    return {
        reservacion,
        errores: errores.map((mensaje) => crearErrorFila(index, reservacion.codigo, mensaje))
    };
};

const validarEstructura = (datos) => {
    const errores = [];
    const reservaciones = [];

    if (!Array.isArray(datos)) {
        return {
            reservaciones,
            errores: [crearErrorFila(0, null, 'La raíz del JSON debe ser un arreglo.')]
        };
    }

    datos.forEach((fila, index) => {
        const resultado = validarFila(fila, index);

        if (resultado.reservacion) {
            reservaciones.push(resultado.reservacion);
        }

        errores.push(...resultado.errores);
    });

    return {
        reservaciones,
        errores
    };
};

const agregarErrorDuplicadoArchivo = (errores, reservaciones) => {
    const vistos = new Map();

    reservaciones.forEach((reservacion, index) => {
        if (!reservacion.codigo) {
            return;
        }

        if (!vistos.has(reservacion.codigo)) {
            vistos.set(reservacion.codigo, reservacion._indiceOriginal);
            return;
        }

        const primeraFila = vistos.get(reservacion.codigo) + 1;

        errores.push(crearErrorFila(
            reservacion._indiceOriginal,
            reservacion.codigo,
            `Código duplicado dentro del archivo; primera aparición en fila ${primeraFila}.`
        ));
    });
};

const obtenerUnicos = (valores) => [...new Set(valores.filter(Boolean))];

const crearMapaFilasPorCampo = (reservaciones, campo) => {
    const mapa = new Map();

    reservaciones.forEach((reservacion, index) => {
        const valor = reservacion[campo];

        if (!valor) {
            return;
        }

        if (!mapa.has(valor)) {
            mapa.set(valor, []);
        }

        mapa.get(valor).push(index);
    });

    return mapa;
};

const consultarCatalogo = async (db, tabla, columnaId, nombres) => {
    if (nombres.length === 0) {
        return new Map();
    }

    const query = `
        SELECT
            ${columnaId} AS id,
            nombre
        FROM ${tabla}
        WHERE nombre = ANY($1::text[])
        ORDER BY nombre ASC, ${columnaId} ASC
    `;
    const result = await db.query(query, [nombres]);
    const mapa = new Map();

    result.rows.forEach((row) => {
        if (!mapa.has(row.nombre)) {
            mapa.set(row.nombre, []);
        }

        mapa.get(row.nombre).push(row.id);
    });

    return mapa;
};

const validarCatalogo = async (db, reservaciones, campo, tabla, columnaId, errores) => {
    const filasPorNombre = crearMapaFilasPorCampo(reservaciones, campo);
    const nombres = obtenerUnicos([...filasPorNombre.keys()]);
    const mapaCatalogo = await consultarCatalogo(db, tabla, columnaId, nombres);
    const faltantes = [];
    const ambiguos = [];

    nombres.forEach((nombre) => {
        const coincidencias = mapaCatalogo.get(nombre) || [];
        const filas = filasPorNombre.get(nombre) || [];

        if (coincidencias.length === 0) {
            faltantes.push(nombre);
            filas.forEach((index) => {
                errores.push(crearErrorFila(
                    reservaciones[index]._indiceOriginal,
                    reservaciones[index].codigo,
                    `${campo} no existe en catálogo: ${nombre}`
                ));
            });
            return;
        }

        if (coincidencias.length > 1) {
            ambiguos.push(nombre);
            filas.forEach((index) => {
                errores.push(crearErrorFila(
                    reservaciones[index]._indiceOriginal,
                    reservaciones[index].codigo,
                    `${campo} ambiguo en catálogo: ${nombre}`
                ));
            });
            return;
        }

        filas.forEach((index) => {
            reservaciones[index][`${campo}_id`] = coincidencias[0];
        });
    });

    return {
        faltantes,
        ambiguos
    };
};

const consultarCodigosExistentes = async (db, codigos) => {
    if (codigos.length === 0) {
        return new Set();
    }

    const result = await db.query(
        `
            SELECT codigo
            FROM reservaciones
            WHERE codigo = ANY($1::text[])
            ORDER BY codigo ASC
        `,
        [codigos]
    );

    return new Set(result.rows.map((row) => row.codigo));
};

const validarCodigosExistentes = async (db, reservaciones, errores) => {
    const codigos = obtenerUnicos(reservaciones.map((reservacion) => reservacion.codigo));
    const existentes = await consultarCodigosExistentes(db, codigos);

    if (existentes.size === 0) {
        return [];
    }

    reservaciones.forEach((reservacion, index) => {
        if (existentes.has(reservacion.codigo)) {
            errores.push(crearErrorFila(
                reservacion._indiceOriginal,
                reservacion.codigo,
                'El código ya existe en reservaciones.'
            ));
        }
    });

    return [...existentes];
};

const validarContraBase = async (db, reservaciones) => {
    const errores = [];
    const catalogos = {
        tours: await validarCatalogo(db, reservaciones, 'tour', 'tours', 'id_tour', errores),
        paises: await validarCatalogo(db, reservaciones, 'pais', 'paises', 'id_pais', errores),
        plataformas: await validarCatalogo(db, reservaciones, 'plataforma', 'plataformas', 'id_plataforma', errores)
    };
    const codigosExistentes = await validarCodigosExistentes(db, reservaciones, errores);

    return {
        errores,
        catalogos,
        codigosExistentes
    };
};

const calcularResumen = (leidas, reservaciones, errores, insertadas, omitidasForzadas = null) => {
    const indicesInvalidos = new Set(errores.map((error) => error.index));
    const validas = reservaciones.filter((reservacion) => !indicesInvalidos.has(reservacion._indiceOriginal));
    const invalidas = Math.max(leidas - validas.length, indicesInvalidos.size);
    const omitidas = omitidasForzadas === null ? indicesInvalidos.size : omitidasForzadas;

    return {
        leidas,
        validas: validas.length,
        invalidas,
        insertadas,
        omitidas,
        completadas: validas.filter((reservacion) => reservacion.estado === 'Completada').length,
        canceladas: validas.filter((reservacion) => reservacion.estado === 'Cancelada').length,
        paxTotal: validas.reduce((total, reservacion) => total + (reservacion.pax || 0), 0)
    };
};

const imprimirResumen = (resumen) => {
    console.log('Resumen:');
    console.log(`  leídas: ${resumen.leidas}`);
    console.log(`  válidas: ${resumen.validas}`);
    console.log(`  inválidas: ${resumen.invalidas}`);
    console.log(`  insertadas: ${resumen.insertadas}`);
    console.log(`  omitidas: ${resumen.omitidas}`);
    console.log(`  Completadas: ${resumen.completadas}`);
    console.log(`  Canceladas: ${resumen.canceladas}`);
    console.log(`  PAX total: ${resumen.paxTotal}`);
};

const imprimirLista = (titulo, valores) => {
    if (valores.length === 0) {
        return;
    }

    console.log(`${titulo}:`);
    valores.forEach((valor) => {
        console.log(`  - ${valor}`);
    });
};

const imprimirCatalogos = (catalogos) => {
    imprimirLista('Tours faltantes', catalogos.tours.faltantes);
    imprimirLista('Tours ambiguos', catalogos.tours.ambiguos);
    imprimirLista('Países faltantes', catalogos.paises.faltantes);
    imprimirLista('Países ambiguos', catalogos.paises.ambiguos);
    imprimirLista('Plataformas faltantes', catalogos.plataformas.faltantes);
    imprimirLista('Plataformas ambiguas', catalogos.plataformas.ambiguos);
};

const imprimirErrores = (errores) => {
    if (errores.length === 0) {
        return;
    }

    console.error('Errores:');
    errores.forEach((error) => {
        console.error(`  - ${formatearReferenciaFila(error)}: ${error.mensaje}`);
    });
};

const insertarReservacion = async (db, reservacion) => {
    await db.query(
        `
            INSERT INTO reservaciones (
                codigo,
                fecha,
                id_tour,
                id_pais,
                id_plataforma,
                nombre_cliente,
                telefono_cliente,
                habitacion,
                pax,
                ninos,
                pickup_place,
                pickup_time,
                turno,
                precio_total,
                deposito,
                saldo,
                tipo_cambio,
                metodo_pago,
                vendedor,
                observaciones,
                id_transporte_operacion,
                estado,
                fecha_registro,
                ultima_actualizacion
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20,
                NULL,
                $21,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
        `,
        [
            reservacion.codigo,
            reservacion.fecha,
            reservacion.tour_id,
            reservacion.pais_id,
            reservacion.plataforma_id,
            reservacion.nombre_cliente,
            reservacion.telefono_cliente,
            reservacion.habitacion,
            reservacion.pax,
            reservacion.ninos,
            reservacion.pickup_place,
            reservacion.pickup_time,
            reservacion.turno,
            reservacion.precio_total,
            reservacion.deposito,
            reservacion.saldo,
            reservacion.tipo_cambio,
            reservacion.metodo_pago,
            reservacion.vendedor,
            reservacion.observaciones,
            reservacion.estado
        ]
    );
};

const clonarReservaciones = (reservaciones) => reservaciones.map((reservacion) => ({ ...reservacion }));

const ejecutarImportacion = async (reservaciones) => {
    const client = await obtenerPool().connect();
    let insertadas = 0;

    try {
        await client.query('BEGIN');

        const reservacionesTransaccion = clonarReservaciones(reservaciones);
        const resultadoTransaccion = await validarContraBase(client, reservacionesTransaccion);

        if (resultadoTransaccion.errores.length > 0) {
            await client.query('ROLLBACK');
            return {
                insertadas: 0,
                rollback: true,
                errores: resultadoTransaccion.errores,
                catalogos: resultadoTransaccion.catalogos,
                codigosExistentes: resultadoTransaccion.codigosExistentes
            };
        }

        for (const reservacion of reservacionesTransaccion) {
            await insertarReservacion(client, reservacion);
            insertadas += 1;
        }

        await client.query('COMMIT');

        return {
            insertadas,
            rollback: false,
            errores: [],
            catalogos: resultadoTransaccion.catalogos,
            codigosExistentes: []
        };
    } catch (error) {
        await client.query('ROLLBACK');

        return {
            insertadas: 0,
            rollback: true,
            errores: [crearErrorFila(0, null, `Error durante la importación: ${error.message}`)],
            catalogos: {
                tours: { faltantes: [], ambiguos: [] },
                paises: { faltantes: [], ambiguos: [] },
                plataformas: { faltantes: [], ambiguos: [] }
            },
            codigosExistentes: []
        };
    } finally {
        client.release();
    }
};

const validarArchivo = async (datos) => {
    const { reservaciones, errores } = validarEstructura(datos);

    agregarErrorDuplicadoArchivo(errores, reservaciones);

    if (errores.length > 0) {
        return {
            reservaciones,
            errores,
            catalogos: {
                tours: { faltantes: [], ambiguos: [] },
                paises: { faltantes: [], ambiguos: [] },
                plataformas: { faltantes: [], ambiguos: [] }
            },
            codigosExistentes: []
        };
    }

    const resultadoBase = await validarContraBase(obtenerPool(), reservaciones);

    return {
        reservaciones,
        errores: resultadoBase.errores,
        catalogos: resultadoBase.catalogos,
        codigosExistentes: resultadoBase.codigosExistentes
    };
};

const main = async () => {
    const resultadoArgs = parsearArgumentos(process.argv);

    if (resultadoArgs.error) {
        console.error(resultadoArgs.error);
        mostrarUso();
        process.exitCode = 1;
        return;
    }

    const { opciones } = resultadoArgs;
    const resultadoJson = leerJson(opciones.filePath);

    if (resultadoJson.error) {
        console.error(resultadoJson.error);
        process.exitCode = 1;
        return;
    }

    const leidas = Array.isArray(resultadoJson.datos) ? resultadoJson.datos.length : 0;
    const resultadoValidacion = await validarArchivo(resultadoJson.datos);

    imprimirCatalogos(resultadoValidacion.catalogos);
    imprimirLista('Códigos ya existentes', resultadoValidacion.codigosExistentes);

    if (resultadoValidacion.errores.length > 0) {
        imprimirErrores(resultadoValidacion.errores);
        imprimirResumen(calcularResumen(leidas, resultadoValidacion.reservaciones, resultadoValidacion.errores, 0));
        process.exitCode = 1;
        return;
    }

    if (opciones.dryRun) {
        imprimirResumen(calcularResumen(leidas, resultadoValidacion.reservaciones, [], 0, 0));
        console.log('Dry-run correcto: el archivo está listo para importar.');
        return;
    }

    const resultadoImportacion = await ejecutarImportacion(resultadoValidacion.reservaciones);

    imprimirCatalogos(resultadoImportacion.catalogos);
    imprimirLista('Códigos ya existentes', resultadoImportacion.codigosExistentes);

    if (resultadoImportacion.errores.length > 0) {
        imprimirErrores(resultadoImportacion.errores);

        if (resultadoImportacion.rollback) {
            console.error('Rollback completo aplicado. insertadas = 0.');
        }

        imprimirResumen(calcularResumen(
            leidas,
            resultadoValidacion.reservaciones,
            resultadoImportacion.errores,
            0,
            leidas
        ));
        process.exitCode = 1;
        return;
    }

    imprimirResumen(calcularResumen(
        leidas,
        resultadoValidacion.reservaciones,
        [],
        resultadoImportacion.insertadas,
        0
    ));
    console.log('Importación histórica completada correctamente.');
};

main()
    .catch((error) => {
        console.error(`Error inesperado: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (pool) {
            await pool.end();
        }
    });
