# Evidencia individual de pruebas

Fecha de corte: 8 de noviembre de 2026 (America/La_Paz).

Origen: `resultados_pytest.xml`, producido por pytest. 178 casos recolectados; 116 aprobados, 62 omitidos, 0 fallidos y 0 errores. La suite informo 7,627 segundos. Los casos parametrizados se enumeran por separado.

La configuracion fue ficticia: sin cargar `.env`, sin credenciales reales y sin ejecutar integraciones PostgreSQL. Las pruebas omitidas no equivalen a resultados aprobados.

Los identificadores EV son exclusivos de este anexo; no se confunden con los casos agrupados CP-A o los flujos CP-I del informe.

## test_caja_sincronizacion.py

Codigo de las pruebas: [test_caja_sincronizacion.py](../../backend/tests/test_caja_sincronizacion.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-001 | `test_arqueo_esperado_es_inicial_mas_ingresos_menos_egresos` | Aprobada | 0.002 |
| EV-002 | `test_arqueo_negativo_es_faltante` | Aprobada | 0.002 |
| EV-003 | `test_cierre_con_diferencia_en_el_umbral_no_pide_nada` | Aprobada | 0.002 |
| EV-004 | `test_cierre_sobre_el_umbral_lo_aprueba_el_encargado` | Aprobada | 0.002 |
| EV-005 | `test_el_encargado_cierra_con_justificacion_sin_esperar_aprobacion` | Aprobada | 0.002 |
| EV-006 | `test_con_operaciones_sin_confirmar_el_cierre_es_provisional` | Aprobada | 0.002 |
| EV-007 | `test_lineas_que_coinciden_no_son_conflicto` | Aprobada | 0.003 |
| EV-008 | `test_stock_insuficiente_es_conflicto` | Aprobada | 0.002 |
| EV-009 | `test_precio_distinto_es_conflicto_en_venta_pero_no_en_reserva` | Aprobada | 0.002 |
| EV-010 | `test_reserva_sin_stock_tiene_su_propio_conflicto` | Aprobada | 0.003 |
| EV-011 | `test_producto_inexistente_gana_a_los_demas_conflictos` | Aprobada | 0.003 |
| EV-012 | `test_producto_desactivado_solo_se_puede_anular` | Aprobada | 0.002 |
| EV-013 | `test_umbral_de_conflicto_reserva_el_caso_al_administrador` | Aprobada | 0.003 |
| EV-014 | `test_suspension_acepta_lo_anterior_y_rechaza_lo_posterior` | Aprobada | 0.002 |

## test_catalogo.py

Codigo de las pruebas: [test_catalogo.py](../../backend/tests/test_catalogo.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-015 | `test_combinaciones_de_la_oferta_son_validas` | Aprobada | 0.002 |
| EV-016 | `test_la_oferta_tiene_26_productos` | Aprobada | 0.002 |
| EV-017 | `test_rechaza_prendas_fuera_de_la_oferta` | Aprobada | 0.003 |
| EV-018 | `test_rechaza_color_o_talla_que_no_corresponde_al_tipo` | Aprobada | 0.002 |

## test_chat_gemini_unit.py

Codigo de las pruebas: [test_chat_gemini_unit.py](../../backend/tests/test_chat_gemini_unit.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-019 | `test_error_temporal_se_recupera[error0]` | Aprobada | 0.009 |
| EV-020 | `test_error_temporal_se_recupera[error1]` | Aprobada | 0.011 |
| EV-021 | `test_error_temporal_se_recupera[error2]` | Aprobada | 0.010 |
| EV-022 | `test_errores_permanentes_y_limite_de_reintentos[400-1]` | Aprobada | 0.010 |
| EV-023 | `test_errores_permanentes_y_limite_de_reintentos[403-1]` | Aprobada | 0.010 |
| EV-024 | `test_errores_permanentes_y_limite_de_reintentos[503-3]` | Aprobada | 0.011 |
| EV-025 | `test_catalogo_y_reintento_no_repiten_la_consulta` | Aprobada | 0.092 |
| EV-026 | `test_cliente_configura_timeout_sin_reintentos_duplicados` | Aprobada | 0.008 |

## test_cu12_cu20_integracion.py

Codigo de las pruebas: [test_cu12_cu20_integracion.py](../../backend/tests/test_cu12_cu20_integracion.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-027 | `test_cu12_preparacion_descarga_todas_las_secciones` | Omitida: requiere base de pruebas | 0.000 |
| EV-028 | `test_cu12_plan_sin_operacion_sin_conexion_responde_402` | Omitida: requiere base de pruebas | 0.002 |
| EV-029 | `test_cu14_cu17_venta_confirmada_descuenta_y_entra_a_caja` | Omitida: requiere base de pruebas | 0.001 |
| EV-030 | `test_cu17_reenviar_el_uuid_no_duplica` | Omitida: requiere base de pruebas | 0.002 |
| EV-031 | `test_cu17_rechaza_otra_empresa_y_sigue_con_el_lote` | Omitida: requiere base de pruebas | 0.001 |
| EV-032 | `test_cu17_venta_con_tarjeta_se_rechaza` | Omitida: requiere base de pruebas | 0.002 |
| EV-033 | `test_cu17_suspendida_acepta_lo_anterior_y_rechaza_lo_posterior` | Omitida: requiere base de pruebas | 0.001 |
| EV-034 | `test_cu14_cliente_nuevo_y_generico` | Omitida: requiere base de pruebas | 0.012 |
| EV-035 | `test_cu18_stock_insuficiente_no_mueve_nada_hasta_aceptar_con_ajuste` | Omitida: requiere base de pruebas | 0.002 |
| EV-036 | `test_cu18_respetar_precio_registra_el_descuento` | Omitida: requiere base de pruebas | 0.001 |
| EV-037 | `test_cu18_anular_venta_registra_el_egreso` | Omitida: requiere base de pruebas | 0.002 |
| EV-038 | `test_cu18_decision_invalida_y_umbral_de_administrador` | Omitida: requiere base de pruebas | 0.009 |
| EV-039 | `test_cu18_el_empleado_no_tiene_permiso` | Omitida: requiere base de pruebas | 0.002 |
| EV-040 | `test_cu18_cliente_duplicado_se_fusiona` | Omitida: requiere base de pruebas | 0.009 |
| EV-041 | `test_cu15_reserva_aparta_y_la_cancelacion_libera` | Omitida: requiere base de pruebas | 0.002 |
| EV-042 | `test_cu15_confirmar_reserva_con_varias_prendas` | Omitida: requiere base de pruebas | 0.003 |
| EV-043 | `test_cu15_cu18_reserva_sin_existencia_se_reasigna` | Omitida: requiere base de pruebas | 0.004 |
| EV-044 | `test_cu19_cambio_de_talla_completo` | Omitida: requiere base de pruebas | 0.001 |
| EV-045 | `test_cu19_saldo_a_favor_queda_como_reembolso_pendiente` | Omitida: requiere base de pruebas | 0.002 |
| EV-046 | `test_cu19_fuera_de_politica_queda_en_conflicto_y_se_puede_aceptar` | Omitida: requiere base de pruebas | 0.002 |
| EV-047 | `test_cu19_venta_en_conflicto_deja_el_cambio_pendiente` | Omitida: requiere base de pruebas | 0.001 |
| EV-048 | `test_cu19_custodia_se_vincula_a_su_venta` | Omitida: requiere base de pruebas | 0.002 |
| EV-049 | `test_cu20_abrir_dos_veces_devuelve_la_misma` | Omitida: requiere base de pruebas | 0.008 |
| EV-050 | `test_cu20_pos_en_efectivo_exige_caja_abierta` | Omitida: requiere base de pruebas | 0.002 |
| EV-051 | `test_cu20_cierre_exacto_queda_cerrado` | Omitida: requiere base de pruebas | 0.008 |
| EV-052 | `test_cu20_diferencia_grande_pide_justificacion_y_aprobacion` | Omitida: requiere base de pruebas | 0.001 |
| EV-053 | `test_cu20_apertura_y_cierre_sin_conexion` | Omitida: requiere base de pruebas | 0.001 |
| EV-054 | `test_cu20_cierre_provisional_pasa_a_definitivo_al_resolver_el_conflicto` | Omitida: requiere base de pruebas | 0.002 |
| EV-055 | `test_cu20_una_sola_caja_por_sucursal_aunque_abran_sin_conexion` | Omitida: requiere base de pruebas | 0.001 |
| EV-056 | `test_rnf02_otra_empresa_no_ve_la_caja` | Omitida: requiere base de pruebas | 0.001 |

## test_cu21_cu30_integracion.py

Codigo de las pruebas: [test_cu21_cu30_integracion.py](../../backend/tests/test_cu21_cu30_integracion.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-057 | `test_cu21_alta_completa_y_activacion` | Omitida: requiere base de pruebas | 0.001 |
| EV-058 | `test_cu21_datos_repetidos_marcan_su_campo` | Omitida: requiere base de pruebas | 0.001 |
| EV-059 | `test_cu22_renovar_suspender_reactivar` | Omitida: requiere base de pruebas | 0.001 |
| EV-060 | `test_cu22_vencimiento_gracia_y_suspension_automatica` | Omitida: requiere base de pruebas | 0.001 |
| EV-061 | `test_cu22_cancelada_aparece_en_canceladas_y_se_recontrata` | Omitida: requiere base de pruebas | 0.001 |
| EV-062 | `test_cu22_la_operadora_no_se_suspende_y_el_cron_pide_secreto` | Omitida: requiere base de pruebas | 0.001 |
| EV-063 | `test_cu23_crear_editar_y_desactivar_plan` | Omitida: requiere base de pruebas | 0.001 |
| EV-064 | `test_cu24_empleado_activacion_baja_y_trazabilidad` | Omitida: requiere base de pruebas | 0.001 |
| EV-065 | `test_cu25_cupo_y_funcionalidades_del_plan` | Omitida: requiere base de pruebas | 0.001 |
| EV-066 | `test_cu26_reporte_aclaracion_rechazo_y_favorito` | Omitida: requiere base de pruebas | 0.002 |
| EV-067 | `test_cu26_encargado_ve_solo_su_sucursal` | Omitida: requiere base de pruebas | 0.001 |
| EV-068 | `test_cu27_transcripcion_sin_servicio_o_formato_invalido` | Omitida: requiere base de pruebas | 0.001 |
| EV-069 | `test_cu28_exportar_pdf_excel_y_segundo_plano` | Omitida: requiere base de pruebas | 0.001 |
| EV-070 | `test_cu29_cu30_entrenar_publicar_y_dashboard` | Omitida: requiere base de pruebas | 0.002 |

## test_cu21_cu30_reglas.py

Codigo de las pruebas: [test_cu21_cu30_reglas.py](../../backend/tests/test_cu21_cu30_reglas.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-071 | `test_cu22_vence_pasa_a_gracia_y_luego_a_suspendida` | Aprobada | 0.002 |
| EV-072 | `test_cu22_por_vencer_se_calcula` | Aprobada | 0.002 |
| EV-073 | `test_cu25_en_gracia_solo_consultas` | Aprobada | 0.002 |
| EV-074 | `test_cu25_suspendida_rechaza_todo_menos_sesion_y_sincronizacion` | Aprobada | 0.002 |
| EV-075 | `test_cu24_usuario_dado_de_baja_no_opera` | Aprobada | 0.002 |
| EV-076 | `test_cu24_operaciones_antes_de_la_baja_se_aceptan` | Aprobada | 0.002 |
| EV-077 | `test_cu26_ejemplo_del_informe` | Aprobada | 0.015 |
| EV-078 | `test_cu26_mas_vendidos_sin_criterio_pide_aclaracion` | Aprobada | 0.003 |
| EV-079 | `test_cu26_este_mes_al_inicio_del_mes_pide_aclaracion` | Aprobada | 0.003 |
| EV-080 | `test_cu26_sin_periodo_usa_el_mes_actual_y_lo_indica` | Aprobada | 0.004 |
| EV-081 | `test_cu26_rechaza_modificar_datos_y_otra_empresa` | Aprobada | 0.003 |
| EV-082 | `test_cu26_encargado_limitado_a_sus_sucursales` | Aprobada | 0.003 |
| EV-083 | `test_cu26_dos_agrupaciones_y_rango` | Aprobada | 0.002 |
| EV-084 | `test_cu29_compara_con_la_version_publicada` | Aprobada | 0.003 |

## test_cu31_cu32_domicilio.py

Codigo de las pruebas: [test_cu31_cu32_domicilio.py](../../backend/tests/test_cu31_cu32_domicilio.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-085 | `test_cu31_cu32_recojo_inspeccion_y_entrega_del_cambio` | Omitida: requiere base de pruebas | 0.001 |
| EV-086 | `test_cu31_cu7_devolucion_recogida_descuenta_el_delivery_y_emite_la_nota` | Omitida: requiere base de pruebas | 0.002 |
| EV-087 | `test_cu31_cancelar_recojo_vuelve_a_la_sucursal_y_no_cobra` | Omitida: requiere base de pruebas | 0.002 |
| EV-088 | `test_cu31_un_recojo_pendiente_no_se_anula_por_vencimiento` | Omitida: requiere base de pruebas | 0.001 |
| EV-089 | `test_cu31_validaciones` | Omitida: requiere base de pruebas | 0.001 |

## test_cu33_cupones.py

Codigo de las pruebas: [test_cu33_cupones.py](../../backend/tests/test_cu33_cupones.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-090 | `test_reglas_del_cupon` | Omitida: requiere base de pruebas | 0.001 |
| EV-091 | `test_cu33_tres_compras_dan_un_cupon_y_se_usa_una_vez` | Omitida: requiere base de pruebas | 0.002 |
| EV-092 | `test_cu33_validaciones` | Omitida: requiere base de pruebas | 0.002 |
| EV-093 | `test_cu33_una_compra_devuelta_no_cuenta` | Omitida: requiere base de pruebas | 0.003 |
| EV-094 | `test_cu33_compras_sin_conexion_suman` | Omitida: requiere base de pruebas | 0.002 |

## test_cu34_cu35.py

Codigo de las pruebas: [test_cu34_cu35.py](../../backend/tests/test_cu34_cu35.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-095 | `test_cu34_avisa_cuando_vuelve_el_stock` | Omitida: requiere base de pruebas | 0.001 |
| EV-096 | `test_cu34_validaciones` | Omitida: requiere base de pruebas | 0.003 |
| EV-097 | `test_cu35_compra_en_linea_con_envio_hasta_la_entrega` | Omitida: requiere base de pruebas | 0.002 |
| EV-098 | `test_cu35_el_pos_no_hace_envios` | Omitida: requiere base de pruebas | 0.001 |

## test_cu36_chatbot.py

Codigo de las pruebas: [test_cu36_chatbot.py](../../backend/tests/test_cu36_chatbot.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-099 | `test_reglas_del_asistente` | Omitida: requiere base de pruebas | 0.003 |
| EV-100 | `test_cu36_admin_pide_un_reporte_y_lo_descarga_en_pdf_csv_y_html` | Omitida: requiere base de pruebas | 0.002 |
| EV-101 | `test_cu36_permisos_y_perfiles` | Omitida: requiere base de pruebas | 0.002 |
| EV-102 | `test_cu36_chat_publico_tiene_limite_por_ip` | Omitida: requiere base de pruebas | 0.002 |

## test_devoluciones.py

Codigo de las pruebas: [test_devoluciones.py](../../backend/tests/test_devoluciones.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-103 | `test_dentro_del_plazo_de_cambio_de_24_h` | Aprobada | 0.004 |
| EV-104 | `test_fuera_de_plazo_se_rechaza_indicando_la_fecha_limite` | Aprobada | 0.003 |
| EV-105 | `test_fuera_de_plazo_con_recargo_por_dia_de_demora` | Aprobada | 0.002 |
| EV-106 | `test_el_recargo_nunca_supera_el_valor_de_la_prenda` | Aprobada | 0.003 |
| EV-107 | `test_defecto_de_fabrica_se_evalua_contra_la_garantia` | Aprobada | 0.002 |
| EV-108 | `test_categoria_no_retornable_solo_por_defecto` | Aprobada | 0.003 |
| EV-109 | `test_maximo_de_cambios_y_unidades_agotadas` | Aprobada | 0.004 |
| EV-110 | `test_el_codigo_escaneado_debe_coincidir_con_la_prenda` | Aprobada | 0.003 |
| EV-111 | `test_deteriorada_segun_la_politica` | Aprobada | 0.003 |
| EV-112 | `test_defecto_de_fabrica_se_acepta_y_va_al_inventario_no_vendible` | Aprobada | 0.002 |
| EV-113 | `test_credito_descuenta_recargo_y_deterioro` | Aprobada | 0.003 |
| EV-114 | `test_clasificacion_del_cambio` | Aprobada | 0.003 |
| EV-115 | `test_cambio_sin_costo_y_diferencia_propia_de_la_variante` | Aprobada | 0.002 |
| EV-116 | `test_respetar_precio_original_no_cobra_el_aumento_general` | Aprobada | 0.003 |
| EV-117 | `test_la_talla_nueva_es_mas_grande_por_centimetros` | Aprobada | 0.002 |
| EV-118 | `test_una_l_puede_ser_mas_chica_que_otra_l` | Aprobada | 0.004 |
| EV-119 | `test_sin_medidas_se_usa_el_orden_de_las_tallas` | Aprobada | 0.003 |
| EV-120 | `test_el_reembolso_usa_el_medio_de_la_venta` | Aprobada | 0.002 |
| EV-121 | `test_umbral_de_autorizacion` | Aprobada | 0.002 |
| EV-122 | `test_la_garantia_no_puede_ser_menor_que_el_plazo_de_cambio` | Aprobada | 0.002 |
| EV-123 | `test_valores_invalidos_se_marcan_por_campo` | Aprobada | 0.002 |
| EV-124 | `test_codigos` | Aprobada | 0.002 |
| EV-125 | `test_la_nota_de_devolucion_dice_cuanto_y_por_que_medio` | Aprobada | 0.002 |
| EV-126 | `test_la_nota_avisa_si_el_reembolso_sigue_pendiente` | Aprobada | 0.004 |

## test_historial_devoluciones.py

Codigo de las pruebas: [test_historial_devoluciones.py](../../backend/tests/test_historial_devoluciones.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-127 | `test_el_administrador_ve_todas_las_sucursales` | Aprobada | 0.002 |
| EV-128 | `test_el_encargado_asignado_solo_ve_sus_sucursales` | Aprobada | 0.001 |
| EV-129 | `test_el_personal_sin_asignar_ve_toda_la_empresa` | Aprobada | 0.001 |
| EV-130 | `test_el_filtro_de_sucursal_no_amplia_el_alcance` | Aprobada | 0.002 |
| EV-131 | `test_excel_con_reporte_indicadores_y_datos_sin_formato` | Aprobada | 0.112 |

## test_reportes_ia.py

Codigo de las pruebas: [test_reportes_ia.py](../../backend/tests/test_reportes_ia.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-132 | `test_reglas_sugieren_transferencia_de_exceso_a_quiebre` | Aprobada | 0.003 |
| EV-133 | `test_reglas_sin_exceso_no_transfieren_y_alertan_quiebre_total` | Aprobada | 0.002 |
| EV-134 | `test_reglas_hallazgos_por_sucursal_ordenados_por_venta` | Aprobada | 0.002 |
| EV-135 | `test_reglas_sin_sucursales_no_explotan` | Aprobada | 0.002 |
| EV-136 | `test_clave_invalida_se_reconoce_aunque_google_responda_400` | Aprobada | 0.002 |
| EV-137 | `test_respaldo_usa_reglas_y_avisa_cuando_la_ia_falla` | Aprobada | 0.004 |
| EV-138 | `test_respaldo_no_avisa_cuando_la_ia_responde` | Aprobada | 0.004 |
| EV-139 | `test_cortes_de_dia_en_hora_de_bolivia` | Aprobada | 0.005 |
| EV-140 | `test_montos_salen_como_numero_en_el_json` | Aprobada | 0.002 |

## test_reports.py

Codigo de las pruebas: [test_reports.py](../../backend/tests/test_reports.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-141 | `test_shape_sales_rows_convierte_y_ordena_por_producto_y_sucursal` | Aprobada | 0.002 |
| EV-142 | `test_shape_inventory_rows_convierte_y_ordena` | Aprobada | 0.002 |
| EV-143 | `test_sales_totals_suma_monto_y_cantidad` | Aprobada | 0.001 |
| EV-144 | `test_sales_totals_con_lista_vacia` | Aprobada | 0.002 |
| EV-145 | `test_describe_filtros_sin_filtros` | Aprobada | 0.002 |
| EV-146 | `test_describe_filtros_con_fechas_sucursal_producto` | Aprobada | 0.002 |
| EV-147 | `test_sales_rows_to_csv_exacto` | Aprobada | 0.003 |
| EV-148 | `test_sales_rows_to_csv_vacio_solo_header_y_totales_cero` | Aprobada | 0.002 |
| EV-149 | `test_inventory_rows_to_csv_exacto` | Aprobada | 0.002 |
| EV-150 | `test_sales_rows_to_pdf_bytes_es_un_pdf_no_vacio` | Aprobada | 0.009 |
| EV-151 | `test_sales_rows_to_pdf_bytes_vacio_no_falla` | Aprobada | 0.003 |
| EV-152 | `test_inventory_rows_to_pdf_bytes_es_un_pdf_no_vacio` | Aprobada | 0.003 |

## test_respaldos.py

Codigo de las pruebas: [test_respaldos.py](../../backend/tests/test_respaldos.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-153 | `test_secreto_correcto_es_valido` | Aprobada | 0.001 |
| EV-154 | `test_secreto_incorrecto_o_vacio_no_es_valido` | Aprobada | 0.001 |
| EV-155 | `test_sin_secreto_configurado_nada_es_valido` | Aprobada | 0.005 |
| EV-156 | `test_retencion_conserva_los_mas_nuevos` | Aprobada | 0.002 |
| EV-157 | `test_retencion_no_borra_nada_si_hay_menos_que_el_tope` | Aprobada | 0.002 |
| EV-158 | `test_retencion_invalida_nunca_borra_el_ultimo_respaldo` | Aprobada | 0.002 |
| EV-159 | `test_a_json_preserva_montos_y_fechas` | Aprobada | 0.002 |
| EV-160 | `test_serializar_y_deserializar_es_reversible` | Aprobada | 0.002 |
| EV-161 | `test_ruta_archivo_separa_por_empresa` | Aprobada | 0.002 |
| EV-162 | `test_ruta_local_rechaza_escapes_de_carpeta` | Aprobada | 0.004 |

## test_returns.py

Codigo de las pruebas: [test_returns.py](../../backend/tests/test_returns.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-163 | `test_venta_recien_hecha_esta_dentro_de_la_ventana` | Aprobada | 0.002 |
| EV-164 | `test_venta_de_hace_23_horas_sigue_siendo_elegible` | Aprobada | 0.003 |
| EV-165 | `test_venta_de_hace_mas_de_24_horas_ya_no_es_elegible` | Aprobada | 0.002 |
| EV-166 | `test_el_limite_exacto_de_24_horas_queda_fuera` | Aprobada | 0.002 |
| EV-167 | `test_fecha_naive_se_interpreta_como_utc_y_no_explota` | Aprobada | 0.002 |
| EV-168 | `test_horas_restantes_es_negativo_cuando_vencio` | Aprobada | 0.002 |

## test_security.py

Codigo de las pruebas: [test_security.py](../../backend/tests/test_security.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-169 | `test_access_token_se_reconoce_como_acceso_y_no_como_refresh` | Aprobada | 0.010 |
| EV-170 | `test_refresh_token_no_sirve_como_acceso` | Aprobada | 0.003 |
| EV-171 | `test_token_de_recuperacion_no_es_ni_acceso_ni_refresh` | Aprobada | 0.003 |
| EV-172 | `test_tokens_previos_al_claim_type_se_siguen_distinguiendo` | Aprobada | 0.002 |
| EV-173 | `test_la_huella_cambia_al_cambiar_la_contrasena` | Aprobada | 0.002 |

## test_suscripcion_sincronizacion.py

Codigo de las pruebas: [test_suscripcion_sincronizacion.py](../../backend/tests/test_suscripcion_sincronizacion.py).

| Evidencia | Funcion o parametrizacion | Estado | Tiempo (s) |
|---|---|---|---:|
| EV-174 | `test_sumar_meses_mismo_dia` | Aprobada | 0.002 |
| EV-175 | `test_sumar_meses_cruza_el_anio` | Aprobada | 0.002 |
| EV-176 | `test_sumar_meses_fin_de_mes_cae_en_el_ultimo_dia` | Aprobada | 0.003 |
| EV-177 | `test_operacion_en_linea_no_lleva_uuid_del_dispositivo` | Aprobada | 0.002 |
| EV-178 | `test_operacion_sin_conexion_guarda_uuid_y_fechas` | Aprobada | 0.002 |

