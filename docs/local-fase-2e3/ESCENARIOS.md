# Escenarios de aceptación sintética 2E.3

Los grupos aprobados están en verification.json; la implementación real de cada proveedor sigue limitada por la Puerta A. Las fechas de diciembre son reloj/datos sintéticos, no una activación comercial programada.

| # | Escenario requerido | Evidencia y resultado esperado comprobado |
| ---: | --- | --- |
| 1 | Primer mes manual | Alta por API comercial y conservación SHA íntegra, incluido dato histórico turnoNULL |
| 2 | Primera activación con historia | Electron original confirma corte; registros previos permanecen sin importar |
| 3 | Exclusión anterior al corte | Creación04:59:59.999Z frente a corte05:00Z: sin vínculo ni alta |
| 4 | Creación exacta al corte |05:00Z incluida una vez |
| 5 | Creación posterior | Importada una vez con equivalencia y datos verificados |
| 6 | Reinicio normal | Backend separado reinicia, conserva corte/cursor y deduplica |
| 7 | Apagado varios días | Se detiene backend antes de agregar datos del10al15 |
| 8 | Recuperación de novedades | Cinco días UTC recuperados; corte del2 intacto |
| 9 | Cancelación durante caída | Detalle del UUID vinculado cancela por servicio existente |
| 10 | Modificación importada | PAX cambia por servicio existente; conflicto humano posterior se bloquea |
| 11 | Eventos idénticos | Duplicado no vuelve a escribir negocio/auditoría |
| 12 | Dos procesos | Dos workers compiten; un dueño. Dos transacciones del UUID: aplicado+duplicado |
| 13 | Respuesta perdida tras COMMIT | Alta ya persistida, respuesta privada descartada; nuevo ciclo no duplica. Control HTTP perdido recuperado por GET |
| 14 | Ventana parcialmente procesada | Interrupción/reinicio; UUID pendiente omitido por lista siguiente se retiene y procesa |
| 15 | Cursor no prematuro | Incompleta o con conflictos: confirmación rechazada; nunca avanza por omitir pendientes |
| 16 | Creación UTC | Normalización de Z y offset; no inferir desde recepción/servicio |
| 17 | America/Cancun | 2dic00:00 se almacena como2dic05:00Z; calendario inválido rechazado |
| 18 | Antigua modificada después | Sigue excluida; solapamiento no retrocede cursor |
| 19 | Código manual coincidente | Se conserva reserva manual, sin duplicación ni autovinculación |
| 20 | Sin equivalencia | Evento pendiente; catálogos no aumentan |
| 21 | Sobrecupo24 |24 se admite sin transporte; el siguiente PAX queda pendiente, sin crear reserva |
| 22 | Pausa/reanudación | Habilitación separada del corte/cursor; recibo durable |
| 23 | Respaldo/restauración | Otro clúster, igualdad completa, pendientes/recibos conservados y nueva autorización sin repetir corte |
| 24 | Administrador/Consulta | Consulta no activa; cambio vivo del rol del responsable impide worker |
| 25 | Auditoría/errores/Avisos | Fallos revierten negocio/auditoría/vínculo/baseline; ambas plataformas aparecen en Centro y señal explícita en Dashboard |
| 26 | Credenciales/cuota/proveedor | Clave sintética incorrecta403,429+Retry-After y500: errores durables, backoff y cursor intacto |
| 27 | Históricos/duplicados | SHA manual intacto; unicidad SQL de vínculos; no borrar ni reparar históricos |
| 28 | Cierre completo | Inventario de directorios/puertos y comprobación final OS de procesos/listeners/pidfiles |

Para GetYourGuide, los casos7–9 no se declaran recuperación automática exitosa: el resultado correcto es bloqueo y reconciliación manual porque la capacidad no está acreditada. Los casos con HTTP simulado FareHarbor no certifican claves ni permisos reales. Los dobles unitarios, el HTTP local y PostgreSQL/Electron reales se identifican por separado en el informe.
