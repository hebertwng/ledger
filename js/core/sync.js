// No modo local não há nada para sincronizar: a fila de operações pendentes (outbox) e o
// envio real para o Firestore são implementados na Etapa 8, quando o Firebase é configurado.
// A ausência de Firebase é uma condição normal de funcionamento, não um erro (seção 2.1).
export function isSyncActive() {
  return false;
}

export function enqueueChange() {
  // Intencionalmente no-op no modo local.
}
