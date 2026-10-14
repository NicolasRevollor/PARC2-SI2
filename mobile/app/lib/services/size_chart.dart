/// Tabla de talles y determinacion de ajuste (CU11 — "esta prenda me
/// queda?"). Decision de alcance confirmada con el usuario: medidas
/// ingresadas a mano por el cliente (ALTURA/PECHO/CINTURA/TIRO en
/// `Cliente`), comparadas contra una tabla de talles ESTATICA y GENERICA
/// (no estimacion por camara/vision — eso requeriria calibracion de escala
/// real, que una camara comun sin sensor de profundidad no puede dar de
/// forma confiable). Es una aproximacion academica, no una tabla de talles
/// real de fabricante.
///
/// El catalogo real mezcla dos convenciones de talla (verificado contra la
/// BD): letras (S/M/L/XL/XXL, para remeras/chaquetas) y numeros (ej. "32",
/// para pantalones — convencion de cintura en PULGADAS, no cm). Cada rama
/// se maneja por separado abajo.
library;

enum NivelAjuste { perfecto, ajustado, holgado, sinMedidas, tallaDesconocida }

class ResultadoAjuste {
  final NivelAjuste nivel;
  final String mensaje;
  const ResultadoAjuste(this.nivel, this.mensaje);
}

class _RangoTalla {
  final int pechoMin;
  final int pechoMax;
  final int cinturaMin;
  final int cinturaMax;
  const _RangoTalla(this.pechoMin, this.pechoMax, this.cinturaMin, this.cinturaMax);
}

// Rangos genericos unisex en cm — aproximacion academica, no tabla real de
// fabricante. Cubre las tallas por letra que aparecen en el catalogo
// sembrado (S/M/L/XL/XXL) mas XS/XXL como margen razonable.
const Map<String, _RangoTalla> _tablaLetras = {
  'XS': _RangoTalla(78, 85, 60, 67),
  'S': _RangoTalla(86, 93, 68, 75),
  'M': _RangoTalla(94, 101, 76, 83),
  'L': _RangoTalla(102, 109, 84, 91),
  'XL': _RangoTalla(110, 117, 92, 99),
  'XXL': _RangoTalla(118, 125, 100, 107),
};

const double _pulgadaACm = 2.54;
const int _margenNumericoCm = 2;

/// Determina el ajuste de `talla` contra las medidas del cliente. Devuelve
/// `null` solo si `talla` esta vacia (nada que evaluar).
ResultadoAjuste? determinarAjuste({
  required String? talla,
  required int? pecho,
  required int? cintura,
}) {
  final t = talla?.trim().toUpperCase();
  if (t == null || t.isEmpty) return null;

  final rango = _tablaLetras[t];
  if (rango != null) {
    if (pecho == null || cintura == null) {
      return const ResultadoAjuste(
        NivelAjuste.sinMedidas,
        'Cargá tu pecho y cintura en tu perfil para ver si te queda.',
      );
    }
    final pechoAjustado = pecho > rango.pechoMax;
    final cinturaAjustada = cintura > rango.cinturaMax;
    final pechoHolgado = pecho < rango.pechoMin;
    final cinturaHolgada = cintura < rango.cinturaMin;

    if (pechoAjustado || cinturaAjustada) {
      return const ResultadoAjuste(NivelAjuste.ajustado, 'Podría quedarte ajustado.');
    }
    if (pechoHolgado || cinturaHolgada) {
      return const ResultadoAjuste(NivelAjuste.holgado, 'Podría quedarte holgado.');
    }
    return const ResultadoAjuste(NivelAjuste.perfecto, 'Debería quedarte bien.');
  }

  // No es una talla por letra conocida — probar como talla numerica de
  // cintura en pulgadas (convencion de pantalones).
  final numerico = int.tryParse(t);
  if (numerico != null) {
    if (cintura == null) {
      return const ResultadoAjuste(
        NivelAjuste.sinMedidas,
        'Cargá tu cintura en tu perfil para ver si te queda.',
      );
    }
    final cinturaTallaCm = (numerico * _pulgadaACm).round();
    final diferencia = cintura - cinturaTallaCm;
    if (diferencia > _margenNumericoCm) {
      return const ResultadoAjuste(NivelAjuste.ajustado, 'Podría quedarte ajustado de cintura.');
    }
    if (diferencia < -_margenNumericoCm) {
      return const ResultadoAjuste(NivelAjuste.holgado, 'Podría quedarte holgado de cintura.');
    }
    return const ResultadoAjuste(NivelAjuste.perfecto, 'Debería quedarte bien de cintura.');
  }

  return const ResultadoAjuste(
    NivelAjuste.tallaDesconocida,
    'No pudimos calcular el ajuste para esta talla.',
  );
}
